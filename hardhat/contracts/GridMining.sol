// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GridMining
 * @notice Core mining game contract for BEAN Protocol on BNB Smart Chain.
 *         5×5 grid, 60-second rounds, VRF-based random winner selection.
 *         Miners deploy BNB to blocks; winning block splits the pot proportionally.
 *         1 BEAN minted per round to top miner (or split among winners).
 */
contract GridMining is ReentrancyGuard {
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
    address public treasury;
    address public feeCollector;
    address public owner;
    address private _pendingOwner;

    // VRF (Chainlink-compatible)
    address public s_vrfCoordinator;
    uint256 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    uint32 public vrfCallbackGasLimit;
    uint16 public vrfRequestConfirmations;
    uint32 public constant vrfNumWords = 2;
    mapping(uint256 => uint64) public vrfRequestToRound;
    uint256 public maxMinersForSingleWinner = 50;

    // ─── Errors ────────────────────────────────────────────────
    error ZeroAddress();
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
    error EmergencyTooEarly();
    error MinimumThresholdTooLow();
    error InvalidBeanpotAccumulation();
    error OnlyCoordinatorCanFulfill();
    error OnlyOwnerOrCoordinator();

    // ─── Events ────────────────────────────────────────────────
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
    event OwnershipTransferRequested(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    // ─── Modifiers ─────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAutoMiner() {
        if (msg.sender != autoMiner) revert NotAutoMiner();
        _;
    }

    // ─── Constructor ───────────────────────────────────────────

    constructor(address _bean, address _vrfCoordinator) {
        if (_bean == address(0) || _vrfCoordinator == address(0)) revert ZeroAddress();
        bean = IBean(_bean);
        s_vrfCoordinator = _vrfCoordinator;
        owner = msg.sender;
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
        if (s_vrfCoordinator == address(0)) revert VRFNotConfigured();
        if (round.vrfRequestId != 0) revert VRFAlreadyRequested();

        uint256 requestId = IVRFCoordinator(s_vrfCoordinator).requestRandomWords(
            vrfKeyHash,
            vrfSubscriptionId,
            vrfRequestConfirmations,
            vrfCallbackGasLimit,
            vrfNumWords
        );

        round.vrfRequestId = requestId;
        vrfRequestToRound[requestId] = roundId;
        emit ResetRequested(roundId, requestId);
    }

    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        if (msg.sender != s_vrfCoordinator) revert OnlyCoordinatorCanFulfill();
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
        if (treasury != address(0) && vaultAmount > 0) {
            ITreasury(treasury).receiveVault{value: vaultAmount}();
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

    function checkpoint(uint64 roundId) external nonReentrant {
        Round storage round = rounds[roundId];
        if (!round.settled) revert RoundNotSettled();

        Miner storage miner = miners[roundId][msg.sender];
        if (miner.amountPerBlock == 0) return;
        if (miner.checkpointed) revert AlreadyCheckpointed();

        miner.checkpointed = true;

        uint256 ethReward;
        uint256 beanReward;

        // Check if user deployed to winning block
        if (miner.deployedMask & (1 << round.winningBlock) != 0) {
            // Proportional ETH reward
            ethReward = (round.totalWinnings * miner.amountPerBlock) / round.winnersDeployed;
            userUnclaimedETH[msg.sender] += ethReward;

            // Beanpot bonus (proportional)
            if (round.beanpotAmount > 0) {
                uint256 beanpotShare = (round.beanpotAmount * miner.amountPerBlock) / round.winnersDeployed;
                beanReward += beanpotShare;
            }

            // BEAN reward from top miner
            if (round.topMinerReward > 0) {
                // Simplified: all winners on winning block share the BEAN
                uint256 beanShare = (round.topMinerReward * miner.amountPerBlock) / round.winnersDeployed;
                beanReward += beanShare;
            }

            if (beanReward > 0) {
                userUnclaimedBEAN[msg.sender] += beanReward;
                totalUnclaimed += beanReward;
            }
        }

        userLastRound[msg.sender] = roundId;

        emit Checkpointed(roundId, msg.sender, ethReward, beanReward);
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
        if (lastRound < currentRoundId && rounds[lastRound + 1].settled) {
            uncheckpointedRound = lastRound + 1;
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
        treasury = _treasury;
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

    function setCoordinator(address _vrfCoordinator) external onlyOwner {
        s_vrfCoordinator = _vrfCoordinator;
    }

    function emergencyResetVRF() external onlyOwner {
        uint64 roundId = currentRoundId;
        Round storage round = rounds[roundId];
        if (round.vrfRequestId == 0) revert VRFNotConfigured();
        // Must wait at least 30 blocks
        if (block.timestamp < round.endTime + 900) revert EmergencyTooEarly();

        uint256 oldRequestId = round.vrfRequestId;
        round.vrfRequestId = 0;

        uint256 newRequestId = IVRFCoordinator(s_vrfCoordinator).requestRandomWords(
            vrfKeyHash, vrfSubscriptionId, vrfRequestConfirmations,
            vrfCallbackGasLimit, vrfNumWords
        );
        round.vrfRequestId = newRequestId;
        vrfRequestToRound[newRequestId] = roundId;

        emit EmergencyVRFRequested(roundId, oldRequestId, newRequestId);
    }

    // ─── Ownership (2-step) ────────────────────────────────────

    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        _pendingOwner = to;
        emit OwnershipTransferRequested(owner, to);
    }

    function acceptOwnership() external {
        require(msg.sender == _pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        _pendingOwner = address(0);
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

interface IVRFCoordinator {
    function requestRandomWords(
        bytes32 keyHash, uint256 subId, uint16 requestConfirmations,
        uint32 callbackGasLimit, uint32 numWords
    ) external returns (uint256 requestId);
}
