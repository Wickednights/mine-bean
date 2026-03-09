// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Bean (BNBEAN)
 * @notice ERC20 token for the BEAN Protocol on BNB Smart Chain.
 *         3,000,000 max supply. Minted by GridMining (1 BEAN per round).
 *         Includes TWAP oracle for price manipulation resistance.
 */
contract Bean is ERC20, ERC20Permit, Ownable {
    uint256 public constant MAX_SUPPLY = 3_000_000 ether;

    address public minter;
    bool public minterFrozen;

    address public pair;
    address public router;

    // TWAP — rolling 5-snapshot reserve history
    struct ReserveSnapshot {
        uint112 reserve0;
        uint112 reserve1;
        uint32 blockNumber;
    }

    ReserveSnapshot[5] public reserveHistory;
    uint8 public currentSnapshotIndex;

    // Errors
    error ZeroAddress();
    error ExceedsMaxSupply();
    error NotMinter();
    error MinterAlreadyFrozen();
    error TWAPNotReady();

    // Events
    event MinterUpdated(address indexed oldMinter, address indexed newMinter);
    event MinterFrozen(address indexed minter);
    event PairUpdated(address indexed oldPair, address indexed newPair);

    constructor() ERC20("Bean", "BNBEAN") ERC20Permit("Bean") Ownable(msg.sender) {}

    // ─── Minting ───────────────────────────────────────────────

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        if (totalSupply() + amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    // ─── Admin ─────────────────────────────────────────────────

    function setMinter(address _minter) external onlyOwner {
        if (minterFrozen) revert MinterAlreadyFrozen();
        if (_minter == address(0)) revert ZeroAddress();
        emit MinterUpdated(minter, _minter);
        minter = _minter;
    }

    function freezeMinter() external onlyOwner {
        if (minterFrozen) revert MinterAlreadyFrozen();
        minterFrozen = true;
        emit MinterFrozen(minter);
    }

    // ─── TWAP Oracle ───────────────────────────────────────────

    function updateReserveSnapshot() public {
        if (pair == address(0)) return;

        // Read reserves from PancakeSwap pair
        (uint112 r0, uint112 r1, ) = IPancakePair(pair).getReserves();
        uint8 idx = currentSnapshotIndex;
        reserveHistory[idx] = ReserveSnapshot(r0, r1, uint32(block.number));
        currentSnapshotIndex = (idx + 1) % 5;
    }

    function calculateAverageReserves() public view returns (uint112 avgReserve0, uint112 avgReserve1) {
        uint256 sum0;
        uint256 sum1;
        uint256 count;
        for (uint256 i = 0; i < 5; i++) {
            if (reserveHistory[i].blockNumber > 0) {
                sum0 += reserveHistory[i].reserve0;
                sum1 += reserveHistory[i].reserve1;
                count++;
            }
        }
        if (count == 0) revert TWAPNotReady();
        avgReserve0 = uint112(sum0 / count);
        avgReserve1 = uint112(sum1 / count);
    }

    function isTWAPReady() external view returns (bool ready) {
        uint256 count;
        for (uint256 i = 0; i < 5; i++) {
            if (reserveHistory[i].blockNumber > 0) count++;
        }
        ready = count >= 3;
    }

    function getTWAPAmountOut(uint256 bnbAmount) external view returns (uint256 expectedBEAN) {
        (uint112 avgR0, uint112 avgR1) = calculateAverageReserves();
        // Assumes token0 = WBNB, token1 = BEAN — adjust if pair ordering differs
        expectedBEAN = (bnbAmount * avgR1) / avgR0;
    }

    function getPriceDeviation() external view returns (uint256 spotPrice, uint256 twapPrice, uint256 deviationBps) {
        if (pair == address(0)) revert TWAPNotReady();
        (uint112 r0, uint112 r1, ) = IPancakePair(pair).getReserves();
        spotPrice = (uint256(r1) * 1 ether) / r0;

        (uint112 avgR0, uint112 avgR1) = calculateAverageReserves();
        twapPrice = (uint256(avgR1) * 1 ether) / avgR0;

        if (twapPrice > 0) {
            deviationBps = spotPrice > twapPrice
                ? ((spotPrice - twapPrice) * 10000) / twapPrice
                : ((twapPrice - spotPrice) * 10000) / twapPrice;
        }
    }

    function getReserveHistory() external view returns (ReserveSnapshot[5] memory snapshots) {
        snapshots = reserveHistory;
    }
}

interface IPancakePair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}
