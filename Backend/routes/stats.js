const express = require('express');
const router = express.Router();
const { getContracts } = require('../lib/contracts');
const { formatEth } = require('../lib/format');
const cache = require('../lib/cache');

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

    cache.set('stats', result, 30);
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

// GET /api/stats/bnb-price - BNB/USD price (proxied to avoid CORS)
router.get('/bnb-price', async (req, res) => {
  try {
    const cached = cache.get('bnb_price');
    if (cached) return res.json(cached);

    let priceUsd = '0';

    // Try CoinGecko first
    try {
      const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd');
      if (cgRes.ok) {
        const data = await cgRes.json();
        if (data.binancecoin?.usd) {
          priceUsd = data.binancecoin.usd.toString();
        }
      }
    } catch {}

    // Fallback to Binance API
    if (priceUsd === '0') {
      try {
        const bnRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT');
        if (bnRes.ok) {
          const data = await bnRes.json();
          if (data.price) priceUsd = data.price;
        }
      } catch {}
    }

    const result = { priceUsd, fetchedAt: new Date().toISOString() };
    cache.set('bnb_price', result, 60); // Cache for 60s
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch BNB price' });
  }
});

module.exports = router;
