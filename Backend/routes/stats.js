const express = require('express');
const router = express.Router();
const { getContracts, getProvider, ADDRESSES } = require('../lib/contracts');
const { formatEth } = require('../lib/format');
const cache = require('../lib/cache');

// GET /api/stats/diagnostic - Raw contract reads for debugging zeros / BNBEAN mint
router.get('/diagnostic', async (req, res) => {
  try {
    const { Bean, GridMining, Treasury, Staking } = getContracts();
    const provider = getProvider();

    const [totalSupply, beanpotPool, treasuryStats, treasuryBalance, minter, gridMiningTotalMinted, gridMiningBeanAddr, treasuryBeanAddr, stakingBeanAddr] = await Promise.all([
      Bean.totalSupply().then((v) => v.toString()).catch((e) => `error: ${e.message}`),
      GridMining.beanpotPool().then((v) => v.toString()).catch((e) => `error: ${e.message}`),
      Treasury.getStats().then((s) => ({
        vaultedETH: (s[0] ?? s.vaultedETH ?? 0n).toString(),
        totalBurned: (s[1] ?? s.totalBurned ?? 0n).toString(),
        totalToStakers: (s[2] ?? s.totalDistributedToStakers ?? 0n).toString(),
        totalBuybacks: (s[3] ?? s.totalBuybacks ?? 0n).toString(),
      })).catch((e) => ({ error: e.message })),
      provider.getBalance(ADDRESSES.Treasury).then((v) => v.toString()).catch((e) => `error: ${e.message}`),
      Bean.minter().then((a) => a).catch((e) => `error: ${e.message}`),
      GridMining.totalMinted().then((v) => v.toString()).catch((e) => `error: ${e.message}`),
      GridMining.bean().then((a) => (typeof a === 'string' ? a : a?.toString?.() || null)).catch((e) => `error: ${e.message}`),
      Treasury.bean?.().then((a) => (typeof a === 'string' ? a : a?.toString?.() || null)).catch(() => null),
      Staking.bean?.().then((a) => (typeof a === 'string' ? a : a?.toString?.() || null)).catch(() => null),
    ]);

    const minterAddr = typeof minter === 'string' && minter.startsWith('0x') ? minter : null;
    const gridMiningAddr = ADDRESSES.GridMining?.toLowerCase?.() ?? '';
    const appBeanAddr = ADDRESSES.Bean?.toLowerCase?.() ?? '';
    const gridMiningBean = (typeof gridMiningBeanAddr === 'string' && gridMiningBeanAddr.startsWith('0x')) ? gridMiningBeanAddr.toLowerCase() : null;

    const minterMatch = minterAddr && gridMiningAddr && minterAddr.toLowerCase() === gridMiningAddr;
    const beanAddressMatch = gridMiningBean && appBeanAddr && gridMiningBean === appBeanAddr;

    let bnbeanMintStatus = 'unknown';
    if (minterMatch && beanAddressMatch && totalSupply !== '0') {
      bnbeanMintStatus = 'ok';
    } else if (!beanAddressMatch && gridMiningBean) {
      bnbeanMintStatus = 'bean_address_mismatch';
    } else if (!minterMatch && minterAddr) {
      bnbeanMintStatus = 'minter_mismatch';
    } else if (totalSupply === '0' && minterMatch && beanAddressMatch) {
      bnbeanMintStatus = 'no_mints_yet';
    } else if (totalSupply === '0') {
      bnbeanMintStatus = 'minter_mismatch_or_no_mints';
    }

    let fixHint = null;
    if (bnbeanMintStatus === 'bean_address_mismatch') {
      fixHint = 'GridMining uses a different Bean contract than the app. Redeploy the full stack (Bean, GridMining, Treasury, Staking, AutoMiner) with deploy.js, or update lib/contracts.ts and Backend to use the Bean address that GridMining uses.';
    } else if (bnbeanMintStatus === 'minter_mismatch' || bnbeanMintStatus === 'minter_mismatch_or_no_mints') {
      fixHint = 'Run: cd hardhat && npx hardhat run scripts/setMinter.js --network bscTestnet (requires DEPLOYER_PRIVATE_KEY, Bean owner)';
    } else if (bnbeanMintStatus === 'no_mints_yet') {
      fixHint = 'VRF may not be fulfilling. Fund your Chainlink VRF subscription with LINK at vrf.chain.link. BNBEAN is minted only when VRF fulfills after a round ends.';
    }

    const treasuryBean = (typeof treasuryBeanAddr === 'string' && treasuryBeanAddr.startsWith('0x')) ? treasuryBeanAddr.toLowerCase() : null;
    const stakingBean = (typeof stakingBeanAddr === 'string' && stakingBeanAddr.startsWith('0x')) ? stakingBeanAddr.toLowerCase() : null;
    const allBeansMatch = beanAddressMatch && treasuryBean === appBeanAddr && stakingBean === appBeanAddr;

    res.json({
      rpcUrl: process.env.RPC_URL ? '(set)' : '(default)',
      addresses: { Bean: ADDRESSES.Bean, Treasury: ADDRESSES.Treasury, GridMining: ADDRESSES.GridMining, Staking: ADDRESSES.Staking },
      bean: { totalSupply, minter: minterAddr || minter },
      gridMining: { beanpotPool, totalMinted: gridMiningTotalMinted, beanAddress: gridMiningBeanAddr },
      staking: { beanAddress: stakingBeanAddr },
      beanAddressMatch,
      allContractsUseAppBean: allBeansMatch,
      bnbeanMintStatus,
      minterMatchesGridMining: minterMatch,
      fixHint,
      treasury: { ...treasuryStats, beanAddress: treasuryBeanAddr },
      treasuryBalance,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Diagnostic error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats - Global protocol statistics
router.get('/', async (req, res) => {
  try {
    const cached = cache.get('stats');
    if (cached) return res.json(cached);

    const { Bean, GridMining } = getContracts();

    const [totalSupply, beanpotPool] = await Promise.all([
      Bean.totalSupply(),
      GridMining.beanpotPool().catch(() => BigInt(0)),
    ]);

    // Total minted = totalSupply (burned tokens are already excluded from supply)
    // For BEAN, max supply is 3M. Circulating = totalSupply
    const totalMinted = totalSupply;

    const result = {
      totalSupply: totalSupply.toString(),
      totalSupplyFormatted: formatEth(totalSupply),
      totalMinted: totalMinted.toString(),
      totalMintedFormatted: formatEth(totalMinted),
      beanpotPool: beanpotPool.toString(),
      beanpotPoolFormatted: formatEth(beanpotPool),
      prices: { bean: { usd: '0' }, eth: { usd: '0' } },
      fetchedAt: new Date().toISOString(),
    };

    cache.set('stats', result, 15);
    res.json(result);
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/price - BEAN price from contract/DexScreener
router.get('/price', async (req, res) => {
  try {
    const cached = cache.get('price');
    if (cached) return res.json(cached);

    // Return placeholder - actual price comes from DexScreener on frontend
    const result = {
      priceUsd: '0',
      priceNative: '0',
      volume24h: '0',
      liquidity: '0',
      priceChange24h: '0',
      fdv: '0',
      fetchedAt: new Date().toISOString(),
    };

    cache.set('price', result, 60);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

module.exports = router;
