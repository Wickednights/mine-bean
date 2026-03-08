// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AutoMiner
 * @notice Automated mining executor for BEAN Protocol on BNB Smart Chain.
 *         Users deposit BNB and configure a strategy; an executor deploys on their behalf each round.
 *         Strategies: All (25 blocks), Random (N random blocks), Select (bitmask-chosen blocks).
 */
contract AutoMiner is Ownable, ReentrancyGuard {
    // ─── Constants ─────────────────────────────────────────────
    uint8 public constant GRID_SIZE = 25;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MAX_FEE_BPS = 500;       // 5% max
    uint256 public constant MAX_FLAT_FEE = 0.001 ether;
    uint8 public constant SELECT_STRATEGY_ID = 2;

    // ─── State ─────────────────────────────────────────────────

    struct AutoConfig {
        uint8 strategyId;
        uint8 numBlocks;
        bool active;
        uint16 executorFeeBps;
        uint32 selectedBlockMask;
        uint128 amountPerBlock;
        uint64 numRounds;
        uint64 roundsExecuted;
        uint128 depositAmount;
        uint32 depositTimestamp;
        uint96 executorFlatFee;
    }

    struct Strategy {
        uint8 fixedBlocks;
        bool exists;
        bool active;
    }

    mapping(address => AutoConfig) public configs;
    mapping(address => uint64) public lastRoundPlayed;
    mapping(uint8 => Strategy) public strategies;
    uint8 public strategyCount;

    address[] public activeUsers;
    mapping(address => uint256) public activeUserIndex;

    IGridMining public gridMining;
    address public executor;
    uint256 public executorFeeBps = 100;    // 1%
    uint256 public executorFlatFee = 0.000006 ether;
    uint256 public accumulatedFees;
    uint256 public minDeploy;
    uint256 public minGasForBatch = 500000;
    uint256 public minGasReserve = 100000;

    // ─── Errors ────────────────────────────────────────────────
    error ZeroAddress();
    error NotExecutor();
    error ConfigNotActive();
    error ConfigAlreadyActive();
    error InvalidStrategy();
    error StrategyNotFound();
    error InvalidNumBlocks();
    error InvalidNumRounds();
    error InvalidBlockCount();
    error InvalidBlockId();
    error InvalidBlockMask();
    error InvalidDeposit();
    error InvalidFixedBlocks();
    error InvalidGasLimits();
    error DuplicateBlock();
    error InsufficientDeposit();
    error InsufficientGas();
    error RoundLimitReached();
    error RoundNotActive();
    error AlreadyPlayedThisRound();
    error GameNotStarted();
    error FeeTooHigh();
    error NoFeesToCollect();

    // ─── Events ────────────────────────────────────────────────
    event ConfigUpdated(address indexed user, uint8 strategyId, uint8 numBlocks, uint256 amountPerBlock, uint256 numRounds, uint256 depositAmount, bool active, uint32 selectedBlockMask);
    event ExecutedFor(address indexed user, uint64 indexed roundId, uint8[] blocks, uint256 totalDeployed, uint256 fee, uint64 roundsExecuted);
    event Stopped(address indexed user, uint256 refundAmount, uint64 roundsCompleted);
    event ConfigDeactivated(address indexed user, uint64 roundsCompleted);
    event BatchExecuted(uint256 total, uint256 successful, uint256 failed);
    event BatchStopped(uint256 indexed stoppedAtIndex, uint256 total, uint256 successful, uint256 failed);
    event ExecutorUpdated(address indexed oldExecutor, address indexed newExecutor);
    event ExecutorFeeBpsUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event ExecutorFlatFeeUpdated(uint256 oldFee, uint256 newFee);
    event GridMiningUpdated(address indexed oldGridMining, address indexed newGridMining);
    event FeesCollected(address indexed executor, uint256 amount);
    event StrategyAdded(uint8 indexed strategyId, uint8 fixedBlocks);
    event StrategyUpdated(uint8 indexed strategyId, bool active);

    // ─── Constructor ───────────────────────────────────────────

    constructor(address _gridMining) Ownable(msg.sender) {
        if (_gridMining == address(0)) revert ZeroAddress();
        gridMining = IGridMining(_gridMining);

        // Default strategies
        strategies[0] = Strategy(0, true, true);   // Random
        strategies[1] = Strategy(25, true, true);   // All
        strategies[2] = Strategy(0, true, true);    // Select
        strategyCount = 3;
    }

    // ─── User Configuration ────────────────────────────────────

    function setConfig(
        uint8 strategyId,
        uint256 numRounds,
        uint8 numBlocks,
        uint32 blockMask
    ) external payable nonReentrant {
        if (!strategies[strategyId].exists) revert InvalidStrategy();
        if (!strategies[strategyId].active) revert InvalidStrategy();
        if (configs[msg.sender].active) revert ConfigAlreadyActive();
        if (numRounds == 0) revert InvalidNumRounds();
        if (msg.value == 0) revert InvalidDeposit();

        uint8 actualBlocks;
        if (strategyId == 1) {
            actualBlocks = GRID_SIZE; // All
        } else if (strategyId == SELECT_STRATEGY_ID) {
            actualBlocks = _countBits(blockMask);
            if (actualBlocks == 0 || actualBlocks > GRID_SIZE) revert InvalidBlockCount();
            _validateBlockMask(blockMask);
        } else {
            if (numBlocks == 0 || numBlocks > GRID_SIZE) revert InvalidNumBlocks();
            actualBlocks = numBlocks;
        }

        // Calculate required deposit
        uint256 perBlock = msg.value;
        uint256 totalBlocksOverRounds = uint256(actualBlocks) * numRounds;
        uint256 pctFeePerRound = (perBlock * actualBlocks * executorFeeBps) / BPS_DENOMINATOR;

        uint256 requiredDeposit;
        if (pctFeePerRound >= executorFlatFee) {
            // Percentage path
            uint256 deployPerRound = perBlock * actualBlocks;
            requiredDeposit = (deployPerRound * (BPS_DENOMINATOR + executorFeeBps) / BPS_DENOMINATOR) * numRounds;
        } else {
            // Flat fee path
            requiredDeposit = (perBlock * totalBlocksOverRounds) + (executorFlatFee * numRounds);
        }

        // Recalculate perBlock from actual deposit
        uint256 feeTotal;
        if (pctFeePerRound >= executorFlatFee) {
            feeTotal = (msg.value * executorFeeBps) / (BPS_DENOMINATOR + executorFeeBps);
        } else {
            feeTotal = executorFlatFee * numRounds;
        }

        uint256 deployableAmount = msg.value - feeTotal;
        uint128 amountPerBlock = uint128(deployableAmount / totalBlocksOverRounds);
        if (amountPerBlock == 0) revert InsufficientDeposit();

        configs[msg.sender] = AutoConfig({
            strategyId: strategyId,
            numBlocks: actualBlocks,
            active: true,
            executorFeeBps: uint16(executorFeeBps),
            selectedBlockMask: blockMask,
            amountPerBlock: amountPerBlock,
            numRounds: uint64(numRounds),
            roundsExecuted: 0,
            depositAmount: uint128(msg.value),
            depositTimestamp: uint32(block.timestamp),
            executorFlatFee: uint96(executorFlatFee)
        });

        // Track active user
        activeUserIndex[msg.sender] = activeUsers.length;
        activeUsers.push(msg.sender);

        emit ConfigUpdated(msg.sender, strategyId, actualBlocks, amountPerBlock, numRounds, msg.value, true, blockMask);
    }

    function stop() external nonReentrant {
        AutoConfig storage config = configs[msg.sender];
        if (!config.active) revert ConfigNotActive();

        config.active = false;
        uint64 roundsCompleted = config.roundsExecuted;

        // Calculate refund
        uint256 roundsRemaining = config.numRounds - config.roundsExecuted;
        uint256 costPerRound = _getCostPerRound(config);
        uint256 refund = roundsRemaining * costPerRound;

        // Cap refund at deposit
        if (refund > config.depositAmount) refund = config.depositAmount;
        config.depositAmount -= uint128(refund);

        _removeActiveUser(msg.sender);

        if (refund > 0) {
            (bool sent, ) = msg.sender.call{value: refund}("");
            if (!sent) revert();
        }

        emit Stopped(msg.sender, refund, roundsCompleted);
    }

    // ─── Executor Functions ────────────────────────────────────

    function executeFor(address user, uint8[] calldata blocks) external nonReentrant {
        if (msg.sender != executor) revert NotExecutor();
        _executeForUser(user, blocks);
    }

    function executeForInternal(address user, uint8[] calldata blocks) external {
        if (msg.sender != address(this)) revert NotExecutor();
        _executeForUser(user, blocks);
    }

    function executeBatch(address[] calldata users, uint8[][] calldata blocks) external nonReentrant returns (uint256 successCount, uint256 failCount) {
        if (msg.sender != executor) revert NotExecutor();

        for (uint256 i = 0; i < users.length; i++) {
            if (gasleft() < minGasReserve) {
                emit BatchStopped(i, users.length, successCount, failCount);
                break;
            }
            try this.executeForInternal(users[i], blocks[i]) {
                successCount++;
            } catch {
                failCount++;
            }
        }

        emit BatchExecuted(users.length, successCount, failCount);
    }

    function _executeForUser(address user, uint8[] memory blocks) internal {
        AutoConfig storage config = configs[user];
        if (!config.active) revert ConfigNotActive();
        if (config.roundsExecuted >= config.numRounds) revert RoundLimitReached();

        uint256 deployAmount = uint256(config.amountPerBlock) * blocks.length;
        uint256 fee = _calculateFee(config, deployAmount);

        accumulatedFees += fee;
        config.roundsExecuted++;

        // Deploy via GridMining
        gridMining.deployFor{value: deployAmount}(user, blocks);

        uint64 currentRound = gridMining.currentRoundId();
        lastRoundPlayed[user] = currentRound;

        emit ExecutedFor(user, currentRound, blocks, deployAmount, fee, config.roundsExecuted);

        // Deactivate if all rounds completed
        if (config.roundsExecuted >= config.numRounds) {
            config.active = false;
            _removeActiveUser(user);
            emit ConfigDeactivated(user, config.roundsExecuted);
        }
    }

    // ─── Fee Collection ────────────────────────────────────────

    function collectFees() external {
        if (msg.sender != executor) revert NotExecutor();
        uint256 fees = accumulatedFees;
        if (fees == 0) revert NoFeesToCollect();
        accumulatedFees = 0;
        (bool sent, ) = executor.call{value: fees}("");
        if (!sent) revert();
        emit FeesCollected(executor, fees);
    }

    // ─── View Functions ────────────────────────────────────────

    function canExecute(address user) external view returns (bool executable, string memory reason) {
        AutoConfig storage config = configs[user];
        if (!config.active) return (false, "Config not active");
        if (config.roundsExecuted >= config.numRounds) return (false, "Round limit reached");
        return (true, "");
    }

    function getUserState(address user) external view returns (
        AutoConfig memory config, uint64 lastRound, uint256 costPerRound,
        uint256 roundsRemaining, uint256 totalRefundable
    ) {
        config = configs[user];
        lastRound = lastRoundPlayed[user];
        costPerRound = config.active ? _getCostPerRound(config) : 0;
        roundsRemaining = config.active ? config.numRounds - config.roundsExecuted : 0;
        totalRefundable = roundsRemaining * costPerRound;
    }

    function getConfigProgress(address user) external view returns (
        bool active, uint256 numRounds, uint256 roundsExecuted,
        uint256 roundsRemaining, uint256 percentComplete
    ) {
        AutoConfig storage config = configs[user];
        active = config.active;
        numRounds = config.numRounds;
        roundsExecuted = config.roundsExecuted;
        roundsRemaining = config.numRounds > config.roundsExecuted ? config.numRounds - config.roundsExecuted : 0;
        percentComplete = config.numRounds > 0 ? (config.roundsExecuted * 100) / config.numRounds : 0;
    }

    function getRoundsRemaining(address user) external view returns (uint256) {
        AutoConfig storage config = configs[user];
        return config.numRounds > config.roundsExecuted ? config.numRounds - config.roundsExecuted : 0;
    }

    function getStrategy(uint8 strategyId) external view returns (uint8 fixedBlocks, bool exists, bool active) {
        Strategy storage s = strategies[strategyId];
        return (s.fixedBlocks, s.exists, s.active);
    }

    function getActiveUserCount() external view returns (uint256) {
        return activeUsers.length;
    }

    function getActiveUsers(uint256 offset, uint256 limit) external view returns (address[] memory users) {
        uint256 end = offset + limit;
        if (end > activeUsers.length) end = activeUsers.length;
        if (offset >= end) return new address[](0);
        users = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            users[i - offset] = activeUsers[i];
        }
    }

    // ─── Admin ─────────────────────────────────────────────────

    function setExecutor(address _executor) external onlyOwner {
        if (_executor == address(0)) revert ZeroAddress();
        emit ExecutorUpdated(executor, _executor);
        executor = _executor;
    }

    function setGridMining(address _gridMining) external onlyOwner {
        if (_gridMining == address(0)) revert ZeroAddress();
        emit GridMiningUpdated(address(gridMining), _gridMining);
        gridMining = IGridMining(_gridMining);
    }

    function setExecutorFeeBps(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit ExecutorFeeBpsUpdated(executorFeeBps, _feeBps);
        executorFeeBps = _feeBps;
    }

    function setExecutorFlatFee(uint256 _flatFee) external onlyOwner {
        if (_flatFee > MAX_FLAT_FEE) revert FeeTooHigh();
        emit ExecutorFlatFeeUpdated(executorFlatFee, _flatFee);
        executorFlatFee = _flatFee;
    }

    function addStrategy(uint8 fixedBlocks) external onlyOwner returns (uint8 strategyId) {
        if (fixedBlocks > GRID_SIZE) revert InvalidFixedBlocks();
        strategyId = strategyCount;
        strategies[strategyId] = Strategy(fixedBlocks, true, true);
        strategyCount++;
        emit StrategyAdded(strategyId, fixedBlocks);
    }

    function setStrategyActive(uint8 strategyId, bool active) external onlyOwner {
        if (!strategies[strategyId].exists) revert StrategyNotFound();
        strategies[strategyId].active = active;
        emit StrategyUpdated(strategyId, active);
    }

    function setGasLimits(uint256 _minForBatch, uint256 _minReserve) external onlyOwner {
        if (_minForBatch == 0 || _minReserve == 0) revert InvalidGasLimits();
        minGasForBatch = _minForBatch;
        minGasReserve = _minReserve;
    }

    // ─── Internal Helpers ──────────────────────────────────────

    function _getCostPerRound(AutoConfig storage config) internal view returns (uint256) {
        uint256 deployPerRound = uint256(config.amountPerBlock) * config.numBlocks;
        uint256 pctFee = (deployPerRound * config.executorFeeBps) / BPS_DENOMINATOR;
        uint256 flatFee = config.executorFlatFee;
        return deployPerRound + (pctFee >= flatFee ? pctFee : flatFee);
    }

    function _calculateFee(AutoConfig storage config, uint256 deployAmount) internal view returns (uint256) {
        uint256 pctFee = (deployAmount * config.executorFeeBps) / BPS_DENOMINATOR;
        uint256 flatFee = config.executorFlatFee;
        return pctFee >= flatFee ? pctFee : flatFee;
    }

    function _countBits(uint32 mask) internal pure returns (uint8 count) {
        while (mask != 0) {
            count += uint8(mask & 1);
            mask >>= 1;
        }
    }

    function _validateBlockMask(uint32 mask) internal pure {
        // Ensure no bits above GRID_SIZE are set
        if (mask >> GRID_SIZE != 0) revert InvalidBlockMask();
    }

    function _removeActiveUser(address user) internal {
        uint256 index = activeUserIndex[user];
        uint256 lastIndex = activeUsers.length - 1;
        if (index != lastIndex) {
            address lastUser = activeUsers[lastIndex];
            activeUsers[index] = lastUser;
            activeUserIndex[lastUser] = index;
        }
        activeUsers.pop();
        delete activeUserIndex[user];
    }

    receive() external payable {}
}

interface IGridMining {
    function deployFor(address user, uint8[] calldata blockIds) external payable;
    function currentRoundId() external view returns (uint64);
}
