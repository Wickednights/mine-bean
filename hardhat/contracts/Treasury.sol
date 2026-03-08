// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Treasury
 * @notice Protocol revenue handler for BEAN Protocol on BNB Smart Chain.
 *         Receives BNB vault fees from GridMining, executes buybacks via PancakeSwap,
 *         burns 50% of acquired BEAN and distributes 50% to stakers.
 */
contract Treasury is Ownable, ReentrancyGuard {
    // ─── Constants ─────────────────────────────────────────────
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant BURY_BPS = 5000;          // 50% burn
    uint256 public constant STAKER_BPS = 5000;        // 50% to stakers
    uint256 public constant DEFAULT_SLIPPAGE_BPS = 500; // 5%
    uint256 public constant MAX_SLIPPAGE_BPS = 2000;    // 20%

    // ─── State ─────────────────────────────────────────────────
    IBean public bean;
    address public gridMining;
    IStaking public staking;

    // PancakeSwap V3 pool config
    address public poolManager;
    uint24 public poolFee;
    int24 public poolTickSpacing;
    address public poolHooks;
    bool public poolConfigSet;

    uint256 public slippageBps = DEFAULT_SLIPPAGE_BPS;
    uint256 public buybackThreshold = 0.01 ether;

    // Accounting
    uint256 public vaultedETH;
    uint256 public totalBurned;
    uint256 public totalDistributedToStakers;
    uint256 public totalBuybacks;

    // ─── Errors ────────────────────────────────────────────────
    error ZeroAddress();
    error OnlyGridMining();
    error BelowThreshold();
    error BuybackFailed();
    error SlippageTooHigh();
    error PoolConfigNotSet();
    error PriceDeviationTooHigh();
    error TWAPNotReady();
    error OnlyPoolManager();

    // ─── Events ────────────────────────────────────────────────
    event VaultReceived(uint256 amount, uint256 totalVaulted);
    event BuybackExecuted(uint256 ethSpent, uint256 beanReceived, uint256 beanBurned, uint256 beanToStakers);
    event ThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event SlippageUpdated(uint256 oldSlippage, uint256 newSlippage);

    // ─── Constructor ───────────────────────────────────────────

    constructor(address _bean) Ownable(msg.sender) {
        if (_bean == address(0)) revert ZeroAddress();
        bean = IBean(_bean);
    }

    // ─── Core Functions ────────────────────────────────────────

    function receiveVault() external payable {
        if (msg.sender != gridMining) revert OnlyGridMining();
        vaultedETH += msg.value;
        emit VaultReceived(msg.value, vaultedETH);
    }

    function executeBuyback() external nonReentrant {
        uint256 balance = address(this).balance;
        if (balance < buybackThreshold) revert BelowThreshold();

        // Swap BNB for BEAN via PancakeSwap router
        uint256 bnbToSpend = balance;

        // Get expected amount from TWAP
        uint256 expectedBEAN = bean.getTWAPAmountOut(bnbToSpend);
        uint256 minOut = (expectedBEAN * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR;

        // Execute swap via PancakeSwap V2 Router
        address[] memory path = new address[](2);
        path[0] = IPancakeRouter(pancakeRouter()).WETH();
        path[1] = address(bean);

        uint256[] memory amounts = IPancakeRouter(pancakeRouter()).swapExactETHForTokens{value: bnbToSpend}(
            minOut,
            path,
            address(this),
            block.timestamp
        );

        uint256 beanReceived = amounts[amounts.length - 1];

        // Split: 50% burn, 50% to stakers
        uint256 toBurn = (beanReceived * BURY_BPS) / BPS_DENOMINATOR;
        uint256 toStakers = beanReceived - toBurn;

        // Burn
        bean.burn(toBurn);
        totalBurned += toBurn;

        // Distribute to stakers
        if (address(staking) != address(0) && toStakers > 0) {
            bean.approve(address(staking), toStakers);
            staking.distributeYield(toStakers);
            totalDistributedToStakers += toStakers;
        }

        totalBuybacks++;

        emit BuybackExecuted(bnbToSpend, beanReceived, toBurn, toStakers);
    }

    function canExecuteBuyback() external view returns (bool canExecute, string memory reason) {
        if (address(this).balance < buybackThreshold) return (false, "Below threshold");
        return (true, "");
    }

    function getStats() external view returns (
        uint256 _vaultedETH, uint256 _totalBurned,
        uint256 _totalDistributedToStakers, uint256 _totalBuybacks
    ) {
        return (vaultedETH, totalBurned, totalDistributedToStakers, totalBuybacks);
    }

    // ─── Admin ─────────────────────────────────────────────────

    function setGridMining(address _gridMining) external onlyOwner {
        if (_gridMining == address(0)) revert ZeroAddress();
        gridMining = _gridMining;
    }

    function setStaking(address _staking) external onlyOwner {
        if (_staking == address(0)) revert ZeroAddress();
        staking = IStaking(_staking);
    }

    function setBuybackThreshold(uint256 _threshold) external onlyOwner {
        emit ThresholdUpdated(buybackThreshold, _threshold);
        buybackThreshold = _threshold;
    }

    function setSlippage(uint256 _slippageBps) external onlyOwner {
        if (_slippageBps > MAX_SLIPPAGE_BPS) revert SlippageTooHigh();
        emit SlippageUpdated(slippageBps, _slippageBps);
        slippageBps = _slippageBps;
    }

    function setPoolConfig(uint24 _fee, int24 _tickSpacing, address _hooks) external onlyOwner {
        poolFee = _fee;
        poolTickSpacing = _tickSpacing;
        poolHooks = _hooks;
        poolConfigSet = true;
    }

    // PancakeSwap router address — BSC mainnet
    function pancakeRouter() internal pure returns (address) {
        return 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    }

    // Allow receiving BNB refunds from swaps
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != poolManager) revert OnlyPoolManager();
        return data;
    }

    receive() external payable {}
}

// ─── Interfaces ────────────────────────────────────────────────

interface IBean {
    function getTWAPAmountOut(uint256 bnbAmount) external view returns (uint256);
    function burn(uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IStaking {
    function distributeYield(uint256 amount) external;
}

interface IPancakeRouter {
    function WETH() external pure returns (address);
    function swapExactETHForTokens(
        uint256 amountOutMin, address[] calldata path,
        address to, uint256 deadline
    ) external payable returns (uint256[] memory amounts);
}
