// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/**
 * @title GridMining
 * @notice Core mining game contract for BEAN Protocol on BNB Smart Chain.
 *         5×5 grid, 60-second rounds, VRF-based random winner selection.
 *         Miners deploy BNB to blocks; winning block splits the pot proportionally.
 *         1 BEAN minted per round to top miner (or split among winners).
 */
contract GridMining is ReentrancyGuard, VRFConsumerBaseV2Plus {
    // ─── Constants ─────────────────────────────────────────────
    uint256 public constant GRID_SIZE = 25;
    uint256 public constant ROUND_DURATION = 60;
    uint256 public constant MAX_SUPPLY = 3_000_000 ether;
    uint256 public constant ONE_BEAN = 1 ether;
    uint256 public constant MIN_DEPLOY = 0.0000025 ether;
    uint256 public constant ADMIN_FEE_BPS = 100;       // 1%
    uint256 public constant VAULT_FEE_BPS = 1000;      // 10%
    uint256 public constant ROASTING_FEE_BPS = 1000;    // 10%
    uint256 public constant BEANPOT_CHANCE = 1000;      // 1 in 1000
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_BEANPOT_ACCUMULATION = 100;
    uint256 public constant MAX_BEANPOT_ACCUMULATION = 2000;
    /// @dev Max rounds per checkpointPending / checkpointBatch tx (gas bound)
    uint256 public constant MAX_CHECKPOINT_BATCH = 50;
    /// @dev Auto catch-up checkpoints before deploy() / deployFor() (same scan as checkpointPending)
    uint256 public constant DEPLOY_CHECKPOINT_CATCHUP = 15;

    // ─── State ─────────────────────────────────────────────────

    struct Round {
        uint256 startTime;
        uint256 endTime;
        uint256 totalDeployed;
        uint256 totalWinnings;
        uint256 winnersDeployed;
        uint8 winningBlock;
        address topMiner;
        uint256 topMinerReward;
        uint256 beanpotAmount;
        uint256 vrfRequestId;
        uint256 topMinerSeed;
        bool settled;
        uint256 minerCount;
    }

    struct Miner {
        uint256 deployedMask;    // bitmask of blocks deployed to
        uint256 amountPerBlock;  // BNB per block
        bool checkpointed;
    }

    mapping(uint64 => Round) public rounds;
    mapping(uint64 => mapping(address => Miner)) public miners;
    mapping(uint64 => uint256[25]) private _roundDeployed;  // per-block deployed amounts

    uint64 public currentRoundId;
    bool public gameStarted;

    // Rewards accounting
    mapping(address => uint256) public userUnclaimedETH;
    mapping(address => uint256) public userUnclaimedBEAN;
    mapping(address => uint256) public userRoastedBEAN;
    mapping(address => uint256) public userRoastingDebt;
    mapping(address => uint64) public userLastRound;
    uint256 public accRoastingPerUnclaimed;
    uint256 public totalMinted;
    uint256 public totalUnclaimed;

    // Beanpot
    uint256 public beanpotPool;
    uint256 public beanpotAccumulation = 500; // 5% default

    // External contracts
    IBean public bean;
    address public autoMiner;
    ITreasury public treasury;
    address public feeCollector;

    // VRF (Chainlink VRFConsumerBaseV2Plus)
    uint256 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    uint32 public vrfCallbackGasLimit;
    uint16 public vrfRequestConfirmations;
    uint32 public constant vrfNumWords = 2;
    mapping(uint256 => uint64) public vrfRequestToRound;
    uint256 public maxMinersForSingleWinner = 50;

    // ─── Errors ────────────────────────────────────────────────
    // Note: ZeroAddress, OnlyCoordinatorCanFulfill, OnlyOwnerOrCoordinator
    // are inherited from VRFConsumerBaseV2Plus
    error GameNotStarted();
    error GameAlreadyStarted();
    error RoundNotActive();
    error RoundNotEnded();
    error RoundAlreadySettled();
    error RoundNotSettled();
    error NoBlocksSelected();
    error InvalidBlockId();
    error AlreadyDeployedThisRound();
    error InsufficientDeployAmount();
    error NotAutoMiner();
    error NothingToClaim();
    error TransferFailed();
    error MaxSupplyReached();
    error VRFNotConfigured();
    error VRFAlreadyRequested();
    error InvalidVRFRequest();
    error AlreadyCheckpointed();
    error CheckpointBatchTooLarge();
    error InvalidMaxRounds();
    error EmergencyTooEarly();
    error MinimumThresholdTooLow();
    error InvalidBeanpotAccumulation();

    // ─── Events ────────────────────────────────────────────────
    // Note: OwnershipTransferRequested, OwnershipTransferred, CoordinatorSet
    // are inherited from VRFConsumerBaseV2Plus / ConfirmedOwnerWithProposal
    event GameStarted(uint64 indexed roundId, uint256 startTime, uint256 endTime);
    event Deployed(uint64 indexed roundId, address indexed user, uint256 amountPerBlock, uint256 blockMask, uint256 totalAmount);
    event DeployedFor(uint64 indexed roundId, address indexed user, address indexed executor, uint256 amountPerBlock, uint256 blockMask, uint256 totalAmount);
    event RoundSettled(uint64 indexed roundId, uint8 winningBlock, address topMiner, uint256 totalWinnings, uint256 topMinerReward, uint256 beanpotAmount, bool isSplit, uint256 topMinerSeed, uint256 winnersDeployed);
    event ResetRequested(uint64 indexed roundId, uint256 vrfRequestId);
    event ClaimedETH(address indexed user, uint256 amount);
    event ClaimedBEAN(address indexed user, uint256 minedBean, uint256 roastedBean, uint256 fee, uint256 net);
    event Checkpointed(uint64 indexed roundId, address indexed user, uint256 ethReward, uint256 beanReward);
    event AutoMinerUpdated(address indexed oldAutoMiner, address indexed newAutoMiner);
    event BeanpotAccumulationUpdated(uint256 oldValue, uint256 newValue);
    event EmergencyVRFRequested(uint64 indexed roundId, uint256 oldRequestId, uint256 newRequestId);

    // ─── Modifiers ─────────────────────────────────────────────

    modifier onlyAutoMiner() {
        if (msg.sender != autoMiner) revert NotAutoMiner();
        _;
    }

    // ─── Constructor ───────────────────────────────────────────

    constructor(
        address _vrfCoordinator,
        address _bean,
        address _treasury,
        address _feeCollector
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        if (_bean == address(0)) revert ZeroAddress();
        bean = IBean(_bean);
        if (_treasury != address(0)) treasury = ITreasury(_treasury);
        feeCollector = _feeCollector;
    }

    // ─── Core Game Logic ───────────────────────────────────────

    function startFirstRound() external onlyOwner {
        if (gameStarted) revert GameAlreadyStarted();
        gameStarted = true;
        currentRoundId = 1;
        rounds[1].startTime = block.timestamp;
        rounds[1].endTime = block.timestamp + ROUND_DURATION;
        emit GameStarted(1, block.timestamp, block.timestamp + ROUND_DURATION);
    }

    function deploy(uint8[] calldata blockIds) external payable nonReentrant {
        if (!gameStarted) revert GameNotStarted();
        _deploy(msg.sender, blockIds, msg.value);
    }

    function deployFor(address user, uint8[] calldata blockIds) external payable nonReentrant onlyAutoMiner {
        if (!gameStarted) revert GameNotStarted();
        _deploy(user, blockIds, msg.value);
    }

    function _deploy(address user, uint8[] calldata blockIds, uint256 value) internal {
        // Catch up pending rewards in chronological order (capped) so returning players need fewer manual steps
        _checkpointPendingForUser(user, DEPLOY_CHECKPOINT_CATCHUP);

        uint64 roundId = currentRoundId;
        Round storage round = rounds[roundId];

        if (block.timestamp >= round.endTime) revert RoundNotActive();
        if (blockIds.length == 0) revert NoBlocksSelected();
        if (miners[roundId][user].amountPerBlock > 0) revert AlreadyDeployedThisRound();

        uint256 perBlock = value / blockIds.length;
        if (perBlock < MIN_DEPLOY) revert InsufficientDeployAmount();

        uint256 mask;
        for (uint256 i = 0; i < blockIds.length; i++) {
            if (blockIds[i] >= GRID_SIZE) revert InvalidBlockId();
            uint256 bit = 1 << blockIds[i];
            if (mask & bit != 0) revert InvalidBlockId(); // duplicate
            mask |= bit;
            _roundDeployed[roundId][blockIds[i]] += perBlock;
        }

        uint256 totalAmount = perBlock * blockIds.length;

        // Admin fee
        uint256 adminFee = (totalAmount * ADMIN_FEE_BPS) / BPS_DENOMINATOR;
        if (feeCollector != address(0) && adminFee > 0) {
            (bool sent, ) = feeCollector.call{value: adminFee}("");
            if (!sent) revert TransferFailed();
        }

        miners[roundId][user] = Miner(mask, perBlock, false);
        round.totalDeployed += totalAmount;
        round.minerCount++;

        if (msg.sender == autoMiner) {
            emit DeployedFor(roundId, user, msg.sender, perBlock, mask, totalAmount);
        } else {
            emit Deployed(roundId, user, perBlock, mask, totalAmount);
        }
    }

    // ─── VRF Settlement ────────────────────────────────────────

    function reset() external {
        uint64 roundId = currentRoundId;
        Round storage round = rounds[roundId];
        if (block.timestamp < round.endTime) revert RoundNotEnded();
        if (round.settled) revert RoundAlreadySettled();

        if (round.totalDeployed == 0) {
            // No deployments — skip settlement, start new round
            round.settled = true;
            _startNewRound();
            return;
        }

        // Request VRF
        if (address(s_vrfCoordinator) == address(0)) revert VRFNotConfigured();
        if (round.vrfRequestId != 0) revert VRFAlreadyRequested();

        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: vrfKeyHash,
                subId: vrfSubscriptionId,
                requestConfirmations: vrfRequestConfirmations,
                callbackGasLimit: vrfCallbackGasLimit,
                numWords: vrfNumWords,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
                )
            })
        );

        round.vrfRequestId = requestId;
        vrfRequestToRound[requestId] = roundId;
        emit ResetRequested(roundId, requestId);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        uint64 roundId = vrfRequestToRound[requestId];
        if (roundId == 0) revert InvalidVRFRequest();

        Round storage round = rounds[roundId];
        if (round.settled) revert RoundAlreadySettled();

        // Determine winning block
        uint8 winningBlock = uint8(randomWords[0] % GRID_SIZE);
        uint256 topMinerSeed = randomWords[1];

        uint256 winnersDeployed = _roundDeployed[roundId][winningBlock];

        // Calculate fees and winnings
        uint256 vaultAmount = ((round.totalDeployed - winnersDeployed) * VAULT_FEE_BPS) / BPS_DENOMINATOR;
        uint256 totalWinnings = round.totalDeployed - vaultAmount;

        // Send vault fee to treasury
        if (address(treasury) != address(0) && vaultAmount > 0) {
            treasury.receiveVault{value: vaultAmount}();
        }

        // Beanpot logic
        uint256 beanpotAmount;
        bool beanpotTriggered = (randomWords[0] % BEANPOT_CHANCE) == 0;
        if (beanpotTriggered && beanpotPool > 0) {
            beanpotAmount = beanpotPool;
            beanpotPool = 0;
        } else {
            // Accumulate beanpot
            uint256 accumulation = (totalMinted < MAX_SUPPLY)
                ? (ONE_BEAN * beanpotAccumulation) / BPS_DENOMINATOR
                : 0;
            beanpotPool += accumulation;
        }

        // Mint BEAN reward
        uint256 topMinerReward;
        address topMiner;
        bool isSplit;

        if (totalMinted + ONE_BEAN <= MAX_SUPPLY && winnersDeployed > 0) {
            topMinerReward = ONE_BEAN;
            totalMinted += ONE_BEAN;

            // 50/50 split vs single winner (determined by topMinerSeed)
            isSplit = (topMinerSeed % 2) == 0 || round.minerCount > maxMinersForSingleWinner;

            // The actual BEAN distribution happens during checkpoint
            bean.mint(address(this), ONE_BEAN);
        }

        round.winningBlock = winningBlock;
        round.topMiner = topMiner;
        round.topMinerReward = topMinerReward;
        round.totalWinnings = totalWinnings;
        round.beanpotAmount = beanpotAmount;
        round.topMinerSeed = topMinerSeed;
        round.winnersDeployed = winnersDeployed;
        round.settled = true;

        emit RoundSettled(roundId, winningBlock, topMiner, totalWinnings, topMinerReward, beanpotAmount, isSplit, topMinerSeed, winnersDeployed);

        _startNewRound();
    }

    function _startNewRound() internal {
        uint64 newRoundId = currentRoundId + 1;
        currentRoundId = newRoundId;
        rounds[newRoundId].startTime = block.timestamp;
        rounds[newRoundId].endTime = block.timestamp + ROUND_DURATION;
        emit GameStarted(newRoundId, block.timestamp, block.timestamp + ROUND_DURATION);
    }

    // ─── Checkpoint & Claims ───────────────────────────────────

    /// @notice Apply checkpoint for `user` on `roundId`. No-op if user did not deploy that round.
    /// @dev Reverts if round not settled or already checkpointed (single-round UX).
    function checkpoint(uint64 roundId) external nonReentrant {
        Round storage round = rounds[roundId];
        if (!round.settled) revert RoundNotSettled();

        Miner storage miner = miners[roundId][msg.sender];
        if (miner.amountPerBlock == 0) return;
        if (miner.checkpointed) revert AlreadyCheckpointed();

        _executeCheckpoint(msg.sender, roundId, round, miner);
    }

    /// @notice Checkpoint up to `maxRounds` pending rounds in order (same scan as getTotalPendingRewards).
    /// @param maxRounds Must be 1..MAX_CHECKPOINT_BATCH. Call again if more rounds remain.
    function checkpointPending(uint256 maxRounds) external nonReentrant {
        if (maxRounds == 0 || maxRounds > MAX_CHECKPOINT_BATCH) revert InvalidMaxRounds();
        _checkpointPendingForUser(msg.sender, maxRounds);
    }

    /// @notice Checkpoint multiple settled rounds in one tx. Round IDs are sorted ascending; duplicates ignored.
    /// @dev Prefer checkpointPending if you are unsure of order — batch does not fill gaps between rounds.
    function checkpointBatch(uint64[] calldata roundIds) external nonReentrant {
        uint256 len = roundIds.length;
        if (len == 0 || len > MAX_CHECKPOINT_BATCH) revert CheckpointBatchTooLarge();

        uint64[] memory sorted = new uint64[](len);
        for (uint256 i = 0; i < len; i++) {
            sorted[i] = roundIds[i];
        }
        _sortRoundIdsAsc(sorted);

        for (uint256 i = 0; i < len; i++) {
            uint64 rid = sorted[i];
            if (i > 0 && rid == sorted[i - 1]) continue;

            Round storage round = rounds[rid];
            if (!round.settled) revert RoundNotSettled();

            Miner storage miner = miners[rid][msg.sender];
            if (miner.amountPerBlock == 0) continue;
            if (miner.checkpointed) continue;

            _executeCheckpoint(msg.sender, rid, round, miner);
        }
    }

    function _checkpointPendingForUser(address user, uint256 maxRounds) internal {
        uint256 executed;
        uint64 last = userLastRound[user];
        uint64 cur = currentRoundId;

        for (uint64 r = last + 1; r <= cur && executed < maxRounds; r++) {
            if (!rounds[r].settled) break;

            Miner storage miner = miners[r][user];
            if (miner.amountPerBlock == 0) continue;
            if (miner.checkpointed) continue;

            _executeCheckpoint(user, r, rounds[r], miner);
            unchecked {
                ++executed;
            }
        }
    }

    function _executeCheckpoint(address user, uint64 roundId, Round storage round, Miner storage miner) private {
        miner.checkpointed = true;

        uint256 ethReward;
        uint256 beanReward;

        if (miner.deployedMask & (1 << round.winningBlock) != 0 && round.winnersDeployed > 0) {
            ethReward = (round.totalWinnings * miner.amountPerBlock) / round.winnersDeployed;
            userUnclaimedETH[user] += ethReward;

            if (round.beanpotAmount > 0) {
                uint256 beanpotShare = (round.beanpotAmount * miner.amountPerBlock) / round.winnersDeployed;
                beanReward += beanpotShare;
            }

            if (round.topMinerReward > 0) {
                uint256 beanShare = (round.topMinerReward * miner.amountPerBlock) / round.winnersDeployed;
                beanReward += beanShare;
            }

            if (beanReward > 0) {
                userUnclaimedBEAN[user] += beanReward;
                totalUnclaimed += beanReward;
            }
        }

        userLastRound[user] = roundId;
        emit Checkpointed(roundId, user, ethReward, beanReward);
    }

    function _sortRoundIdsAsc(uint64[] memory arr) private pure {
        uint256 n = arr.length;
        for (uint256 i = 1; i < n; i++) {
            uint64 key = arr[i];
            uint256 j = i;
            while (j > 0 && arr[j - 1] > key) {
                arr[j] = arr[j - 1];
                unchecked {
                    j--;
                }
            }
            arr[j] = key;
        }
    }

    function claimETH() external nonReentrant {
        uint256 amount = userUnclaimedETH[msg.sender];
        if (amount == 0) revert NothingToClaim();
        userUnclaimedETH[msg.sender] = 0;
        (bool sent, ) = msg.sender.call{value: amount}("");
        if (!sent) revert TransferFailed();
        emit ClaimedETH(msg.sender, amount);
    }

    function claimBEAN() external nonReentrant {
        uint256 unclaimed = userUnclaimedBEAN[msg.sender];
        uint256 roasted = userRoastedBEAN[msg.sender];
        uint256 total = unclaimed + roasted;
        if (total == 0) revert NothingToClaim();

        // Roasting fee on unclaimed only
        uint256 fee = (unclaimed * ROASTING_FEE_BPS) / BPS_DENOMINATOR;
        uint256 net = total - fee;

        userUnclaimedBEAN[msg.sender] = 0;
        userRoastedBEAN[msg.sender] = 0;
        totalUnclaimed -= unclaimed;

        // Distribute fee as roasting bonus to remaining unclaimed holders
        if (totalUnclaimed > 0 && fee > 0) {
            accRoastingPerUnclaimed += (fee * 1e18) / totalUnclaimed;
        }

        bean.transfer(msg.sender, net);
        if (fee > 0) {
            bean.burn(fee);
        }

        emit ClaimedBEAN(msg.sender, unclaimed, roasted, fee, net);
    }

    // ─── View Functions ────────────────────────────────────────

    function getCurrentRoundInfo() external view returns (
        uint64 roundId, uint256 startTime, uint256 endTime,
        uint256 totalDeployed, uint256 timeRemaining, bool isActive
    ) {
        roundId = currentRoundId;
        Round storage round = rounds[roundId];
        startTime = round.startTime;
        endTime = round.endTime;
        totalDeployed = round.totalDeployed;
        timeRemaining = block.timestamp < round.endTime ? round.endTime - block.timestamp : 0;
        isActive = block.timestamp < round.endTime && gameStarted;
    }

    function getRound(uint64 roundId) external view returns (
        uint256 startTime, uint256 endTime, uint256 totalDeployed,
        uint256 totalWinnings, uint8 winningBlock, address topMiner,
        uint256 topMinerReward, uint256 beanpotAmount, bool settled
    ) {
        Round storage round = rounds[roundId];
        return (round.startTime, round.endTime, round.totalDeployed,
                round.totalWinnings, round.winningBlock, round.topMiner,
                round.topMinerReward, round.beanpotAmount, round.settled);
    }

    function getRoundDeployed(uint64 roundId) external view returns (uint256[25] memory) {
        return _roundDeployed[roundId];
    }

    function getMinerInfo(uint64 roundId, address user) external view returns (
        uint256 deployedMask, uint256 amountPerBlock, bool checkpointed
    ) {
        Miner storage m = miners[roundId][user];
        return (m.deployedMask, m.amountPerBlock, m.checkpointed);
    }

    function getPendingETH(address user) external view returns (uint256) {
        return userUnclaimedETH[user];
    }

    function getPendingBEAN(address user) external view returns (uint256 gross, uint256 fee, uint256 net) {
        gross = userUnclaimedBEAN[user] + userRoastedBEAN[user];
        fee = (userUnclaimedBEAN[user] * ROASTING_FEE_BPS) / BPS_DENOMINATOR;
        net = gross - fee;
    }

    function getTotalPendingRewards(address user) external view returns (
        uint256 pendingETH, uint256 pendingUnroastedBEAN,
        uint256 pendingRoastedBEAN, uint64 uncheckpointedRound
    ) {
        pendingETH = userUnclaimedETH[user];
        pendingUnroastedBEAN = userUnclaimedBEAN[user];
        pendingRoastedBEAN = userRoastedBEAN[user];
        uint64 lastRound = userLastRound[user];
        // Find next round user participated in (skip rounds they didn't deploy to)
        for (uint64 r = lastRound + 1; r <= currentRoundId; r++) {
            if (!rounds[r].settled) break;
            Miner storage m = miners[r][user];
            if (m.amountPerBlock > 0 && !m.checkpointed) {
                uncheckpointedRound = r;
                break;
            }
        }
    }

    // ─── Admin ─────────────────────────────────────────────────

    function setAutoMiner(address _autoMiner) external onlyOwner {
        if (_autoMiner == address(0)) revert ZeroAddress();
        emit AutoMinerUpdated(autoMiner, _autoMiner);
        autoMiner = _autoMiner;
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = ITreasury(_treasury);
    }

    function setFeeCollector(address _feeCollector) external onlyOwner {
        feeCollector = _feeCollector;
    }

    function setBeanpotAccumulation(uint256 _accumulation) external onlyOwner {
        if (_accumulation < MIN_BEANPOT_ACCUMULATION || _accumulation > MAX_BEANPOT_ACCUMULATION) {
            revert InvalidBeanpotAccumulation();
        }
        emit BeanpotAccumulationUpdated(beanpotAccumulation, _accumulation);
        beanpotAccumulation = _accumulation;
    }

    function setMaxMinersForSingleWinner(uint256 _max) external onlyOwner {
        if (_max < 1) revert MinimumThresholdTooLow();
        maxMinersForSingleWinner = _max;
    }

    function setVRFConfig(
        uint256 _subscriptionId, bytes32 _keyHash,
        uint32 _callbackGasLimit, uint16 _requestConfirmations
    ) external onlyOwner {
        vrfSubscriptionId = _subscriptionId;
        vrfKeyHash = _keyHash;
        vrfCallbackGasLimit = _callbackGasLimit;
        vrfRequestConfirmations = _requestConfirmations;
    }

    function emergencyResetVRF() external onlyOwner {
        uint64 roundId = currentRoundId;
        Round storage round = rounds[roundId];
        if (round.vrfRequestId == 0) revert VRFNotConfigured();
        // Must wait at least 15 minutes
        if (block.timestamp < round.endTime + 900) revert EmergencyTooEarly();

        uint256 oldRequestId = round.vrfRequestId;
        round.vrfRequestId = 0;

        uint256 newRequestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: vrfKeyHash,
                subId: vrfSubscriptionId,
                requestConfirmations: vrfRequestConfirmations,
                callbackGasLimit: vrfCallbackGasLimit,
                numWords: vrfNumWords,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
                )
            })
        );
        round.vrfRequestId = newRequestId;
        vrfRequestToRound[newRequestId] = roundId;

        emit EmergencyVRFRequested(roundId, oldRequestId, newRequestId);
    }

    receive() external payable {}
}

// ─── Interfaces ────────────────────────────────────────────────

interface IBean {
    function mint(address to, uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function burn(uint256 amount) external;
}

interface ITreasury {
    function receiveVault() external payable;
}
