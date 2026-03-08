// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Staking
 * @notice BEAN staking contract for BEAN Protocol on BNB Smart Chain.
 *         Users deposit BEAN to earn yield from protocol buybacks.
 *         Supports auto-compound via funded fee reserves.
 */
contract Staking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constants ─────────────────────────────────────────────
    uint256 public constant PRECISION = 1e18;
    uint256 public constant MAX_COMPOUND_FEE = 0.01 ether;

    // ─── State ─────────────────────────────────────────────────

    struct Stake {
        uint256 balance;
        uint256 pendingRewards;
        uint256 compoundFeeReserve;
        uint64 lastClaimAt;
        uint64 lastDepositAt;
        uint64 lastWithdrawAt;
    }

    IERC20 public bean;
    address public treasury;

    mapping(address => Stake) public stakes;
    mapping(address => uint256) public userRewardsDebt;

    uint256 public totalStaked;
    uint256 public totalYieldDistributed;
    uint256 public accYieldPerShare;

    uint256 public minStake = 1 ether;
    uint256 public compoundFee = 0.0003 ether;
    uint256 public compoundCooldown = 3600; // 1 hour

    // ─── Errors ────────────────────────────────────────────────
    error ZeroAddress();
    error ZeroAmount();
    error BelowMinimumStake();
    error InsufficientBalance();
    error InsufficientPendingRewards();
    error InsufficientCompoundFeeReserve();
    error CompoundCooldownNotMet();
    error OnlyTreasury();
    error TransferFailed();
    error InvalidConfig();

    // ─── Events ────────────────────────────────────────────────
    event Deposited(address indexed user, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed user, uint256 amount, uint256 newBalance);
    event YieldClaimed(address indexed user, uint256 amount);
    event YieldCompounded(address indexed user, uint256 amount, address indexed compounder, uint256 fee);
    event YieldDistributed(uint256 amount, uint256 newAccYieldPerShare);
    event YieldBurned(uint256 amount);
    event CompoundFeeDeposited(address indexed user, uint256 amount);
    event CompoundFeeRefunded(address indexed user, uint256 amount);
    event ConfigUpdated(string param, uint256 oldValue, uint256 newValue);

    // ─── Constructor ───────────────────────────────────────────

    constructor(address _bean) Ownable(msg.sender) {
        if (_bean == address(0)) revert ZeroAddress();
        bean = IERC20(_bean);
    }

    // ─── Core Staking ──────────────────────────────────────────

    function deposit(uint256 amount) external payable nonReentrant {
        if (amount == 0) revert ZeroAmount();

        _updateRewards(msg.sender);

        bean.safeTransferFrom(msg.sender, address(this), amount);

        Stake storage s = stakes[msg.sender];
        s.balance += amount;
        s.lastDepositAt = uint64(block.timestamp);

        if (s.balance < minStake) revert BelowMinimumStake();

        totalStaked += amount;

        // Handle compound fee deposit (BNB sent as msg.value)
        if (msg.value > 0) {
            s.compoundFeeReserve += msg.value;
            emit CompoundFeeDeposited(msg.sender, msg.value);
        }

        emit Deposited(msg.sender, amount, s.balance);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        Stake storage s = stakes[msg.sender];
        if (amount > s.balance) revert InsufficientBalance();

        _updateRewards(msg.sender);

        s.balance -= amount;
        s.lastWithdrawAt = uint64(block.timestamp);
        totalStaked -= amount;

        // Refund compound fee if fully withdrawn
        if (s.balance == 0 && s.compoundFeeReserve > 0) {
            uint256 refund = s.compoundFeeReserve;
            s.compoundFeeReserve = 0;
            (bool sent, ) = msg.sender.call{value: refund}("");
            if (!sent) revert TransferFailed();
            emit CompoundFeeRefunded(msg.sender, refund);
        }

        bean.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, s.balance);
    }

    function claimYield() external nonReentrant {
        _updateRewards(msg.sender);

        Stake storage s = stakes[msg.sender];
        uint256 rewards = s.pendingRewards;
        if (rewards == 0) revert InsufficientPendingRewards();

        s.pendingRewards = 0;
        s.lastClaimAt = uint64(block.timestamp);

        bean.safeTransfer(msg.sender, rewards);

        emit YieldClaimed(msg.sender, rewards);
    }

    function claimYieldPartial(uint256 amount) external nonReentrant {
        _updateRewards(msg.sender);

        Stake storage s = stakes[msg.sender];
        if (amount > s.pendingRewards) revert InsufficientPendingRewards();
        if (amount == 0) revert ZeroAmount();

        s.pendingRewards -= amount;
        s.lastClaimAt = uint64(block.timestamp);

        bean.safeTransfer(msg.sender, amount);

        emit YieldClaimed(msg.sender, amount);
    }

    function compound() external nonReentrant {
        _compound(msg.sender, msg.sender);
    }

    function compoundFor(address user) external nonReentrant {
        _compound(user, msg.sender);
    }

    function _compound(address user, address compounder) internal {
        _updateRewards(user);

        Stake storage s = stakes[user];
        uint256 rewards = s.pendingRewards;
        if (rewards == 0) revert InsufficientPendingRewards();

        // If third-party compound, charge fee from user's reserve
        uint256 fee;
        if (compounder != user) {
            if (s.compoundFeeReserve < compoundFee) revert InsufficientCompoundFeeReserve();
            if (s.lastClaimAt + compoundCooldown > block.timestamp) revert CompoundCooldownNotMet();
            fee = compoundFee;
            s.compoundFeeReserve -= fee;
            (bool sent, ) = compounder.call{value: fee}("");
            if (!sent) revert TransferFailed();
        }

        s.pendingRewards = 0;
        s.balance += rewards;
        s.lastClaimAt = uint64(block.timestamp);
        totalStaked += rewards;

        emit YieldCompounded(user, rewards, compounder, fee);
    }

    function depositCompoundFee() external payable {
        if (msg.value == 0) revert ZeroAmount();
        stakes[msg.sender].compoundFeeReserve += msg.value;
        emit CompoundFeeDeposited(msg.sender, msg.value);
    }

    function withdrawCompoundFee(uint256 amount) external nonReentrant {
        Stake storage s = stakes[msg.sender];
        if (amount > s.compoundFeeReserve) revert InsufficientBalance();
        s.compoundFeeReserve -= amount;
        (bool sent, ) = msg.sender.call{value: amount}("");
        if (!sent) revert TransferFailed();
        emit CompoundFeeRefunded(msg.sender, amount);
    }

    // ─── Yield Distribution (called by Treasury) ───────────────

    function distributeYield(uint256 amount) external {
        if (msg.sender != treasury) revert OnlyTreasury();
        if (totalStaked == 0) {
            // Burn if no stakers
            IBeanBurnable(address(bean)).burn(amount);
            emit YieldBurned(amount);
            return;
        }

        bean.safeTransferFrom(msg.sender, address(this), amount);
        accYieldPerShare += (amount * PRECISION) / totalStaked;
        totalYieldDistributed += amount;

        emit YieldDistributed(amount, accYieldPerShare);
    }

    function sowBean(uint256 amount) external onlyOwner {
        // Manual yield injection by owner
        if (totalStaked == 0) revert ZeroAmount();
        bean.safeTransferFrom(msg.sender, address(this), amount);
        accYieldPerShare += (amount * PRECISION) / totalStaked;
        totalYieldDistributed += amount;
        emit YieldDistributed(amount, accYieldPerShare);
    }

    // ─── View Functions ────────────────────────────────────────

    function getPendingRewards(address user) public view returns (uint256 pending) {
        Stake storage s = stakes[user];
        if (s.balance == 0) return s.pendingRewards;
        uint256 accRewards = (s.balance * accYieldPerShare) / PRECISION;
        pending = s.pendingRewards + accRewards - userRewardsDebt[user];
    }

    function getStakeInfo(address user) external view returns (
        uint256 balance, uint256 pendingRewards, uint256 compoundFeeReserve,
        uint64 lastClaimAt, uint64 lastDepositAt, uint64 lastWithdrawAt, bool canCompound
    ) {
        Stake storage s = stakes[user];
        balance = s.balance;
        pendingRewards = getPendingRewards(user);
        compoundFeeReserve = s.compoundFeeReserve;
        lastClaimAt = s.lastClaimAt;
        lastDepositAt = s.lastDepositAt;
        lastWithdrawAt = s.lastWithdrawAt;
        canCompound = s.compoundFeeReserve >= compoundFee && pendingRewards > 0;
    }

    function getGlobalStats() external view returns (
        uint256 _totalStaked, uint256 _totalYieldDistributed, uint256 _accYieldPerShare
    ) {
        return (totalStaked, totalYieldDistributed, accYieldPerShare);
    }

    function canCompoundFor(address user) external view returns (bool canDo, string memory reason) {
        Stake storage s = stakes[user];
        if (s.compoundFeeReserve < compoundFee) return (false, "Insufficient fee reserve");
        if (getPendingRewards(user) == 0) return (false, "No pending rewards");
        if (s.lastClaimAt + compoundCooldown > block.timestamp) return (false, "Cooldown not met");
        return (true, "");
    }

    // ─── Admin ─────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
    }

    function setMinStake(uint256 _minStake) external onlyOwner {
        if (_minStake == 0) revert InvalidConfig();
        emit ConfigUpdated("minStake", minStake, _minStake);
        minStake = _minStake;
    }

    function setCompoundFee(uint256 _fee) external onlyOwner {
        if (_fee > MAX_COMPOUND_FEE) revert InvalidConfig();
        emit ConfigUpdated("compoundFee", compoundFee, _fee);
        compoundFee = _fee;
    }

    function setCompoundCooldown(uint256 _cooldown) external onlyOwner {
        emit ConfigUpdated("compoundCooldown", compoundCooldown, _cooldown);
        compoundCooldown = _cooldown;
    }

    // ─── Internal ──────────────────────────────────────────────

    function _updateRewards(address user) internal {
        Stake storage s = stakes[user];
        if (s.balance > 0) {
            uint256 accRewards = (s.balance * accYieldPerShare) / PRECISION;
            s.pendingRewards += accRewards - userRewardsDebt[user];
        }
        userRewardsDebt[user] = (s.balance * accYieldPerShare) / PRECISION;
    }

    receive() external payable {}
}

interface IBeanBurnable {
    function burn(uint256 amount) external;
}
