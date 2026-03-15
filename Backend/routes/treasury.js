const express = require('express');
const router = express.Router();
const Buyback = require('../models/Buyback');
const { getContracts, getProvider, ADDRESSES } = require('../lib/contracts');
const { formatEth } = require('../lib/format');
const cache = require('../lib/cache');

// GET /api/treasury/stats
router.get('/stats', async (req, res) => {
  try {
    const cached = cache.get('treasury_stats');
    if (cached) return res.json(cached);

    const { Treasury } = getContracts();
    const provider = getProvider();

    const [stats, treasuryBalance] = await Promise.all([
      Treasury.getStats(),
      provider.getBalance(ADDRESSES.Treasury),
    ]);

    const vaultedETH = (stats[0] || stats.vaultedETH || BigInt(0)).toString();
    const totalBurned = (stats[1] || stats.totalBurned || BigInt(0)).toString();
    const totalToStakers = (stats[2] || stats.totalDistributedToStakers || BigInt(0)).toString();
    const totalBuybacks = (stats[3] || stats.totalBuybacks || BigInt(0)).toString();
    const balanceStr = treasuryBalance.toString();

    const result = {
      vaultedETH,
      vaultedETHFormatted: formatEth(vaultedETH),
      totalBurned,
      totalBurnedFormatted: formatEth(totalBurned),
      totalToStakers,
      totalToStakersFormatted: formatEth(totalToStakers),
      totalBuybacks,
      totalBuybacksFormatted: formatEth(totalBuybacks),
      // Alias for frontend GlobalStats (uses totalVaultedFormatted)
      totalVaultedFormatted: formatEth(vaultedETH),
      // BNB currently held in Treasury (from vault fee on squares) — available for buybacks
      treasuryBalance: balanceStr,
      treasuryBalanceFormatted: formatEth(balanceStr),
      lastRefresh: new Date().toISOString(),
    };

    cache.set('treasury_stats', result, 30);
    res.json(result);
  } catch (err) {
    console.error('Treasury stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch treasury stats' });
  }
});

// GET /api/treasury/buybacks?page=1&limit=12
router.get('/buybacks', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 12));
    const skip = (page - 1) * limit;

    const [buybacks, total] = await Promise.all([
      Buyback.find().sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      Buyback.countDocuments(),
    ]);

    res.json({
      buybacks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch buybacks' });
  }
});

module.exports = router;
