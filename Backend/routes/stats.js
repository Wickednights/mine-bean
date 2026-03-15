const express = require('express');
const router = express.Router();
const { getContracts, getProvider, ADDRESSES } = require('../lib/contracts');
const { formatEth } = require('../lib/format');
const cache = require('../lib/cache');

// GET /api/stats/diagnostic - Raw contract reads for debugging zeros
router.get('/diagnostic', async (req, res) => {
  try {
    const { Bean, GridMining, Treasury } = getContracts();
    const provider = getProvider();

    const [totalSupply, beanpotPool, treasuryStats, treasuryBalance, minter] = await Promise.all([
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
    ]);

    res.json({
      rpcUrl: process.env.RPC_URL ? '(set)' : '(default)',
      addresses: { Bean: ADDRESSES.Bean, Treasury: ADDRESSES.Treasury, GridMining: ADDRESSES.GridMining },
      bean: { totalSupply, minter },
      gridMining: { beanpotPool },
      treasury: treasuryStats,
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
