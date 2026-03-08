const express = require('express');
const router = express.Router();
const Deployment = require('../models/Deployment');
const { getContracts } = require('../lib/contracts');
const { formatEth } = require('../lib/format');
const cache = require('../lib/cache');

// GET /api/leaderboard/miners?period=all&limit=20
router.get('/miners', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const period = req.query.period || 'all';

    const cacheKey = `leaderboard_miners_${period}_${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Build date filter for period
    const dateFilter = {};
    if (period !== 'all') {
      const now = new Date();
      const ms = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
      if (ms[period]) {
        dateFilter.timestamp = { $gte: new Date(now - ms[period]) };
      }
    }

    const pipeline = [
      { $match: dateFilter },
      {
        $group: {
          _id: '$user',
          totalDeployed: { $sum: { $toDouble: '$totalAmount' } },
          roundsPlayed: { $addToSet: '$roundId' },
        },
      },
      { $sort: { totalDeployed: -1 } },
      { $limit: limit },
    ];

    const results = await Deployment.aggregate(pipeline);

    const deployers = results.map(r => ({
      address: r._id,
      totalDeployed: Math.floor(r.totalDeployed).toString(),
      totalDeployedFormatted: formatEth(BigInt(Math.floor(r.totalDeployed))),
      roundsPlayed: r.roundsPlayed.length,
    }));

    const result = { period, deployers };
    cache.set(cacheKey, result, 120);
    res.json(result);
  } catch (err) {
    console.error('Leaderboard miners error:', err.message);
    res.status(500).json({ error: 'Failed to fetch miners leaderboard' });
  }
});

// GET /api/leaderboard/stakers?limit=20
router.get('/stakers', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const cacheKey = `leaderboard_stakers_${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Read from Staking contract — iterate known stakers from DB
    const { Staking } = getContracts();
    const StakeEvent = require('../models/StakeEvent');

    // Get unique staker addresses
    const uniqueStakers = await StakeEvent.distinct('user');

    const stakerData = await Promise.all(
      uniqueStakers.map(async (addr) => {
        try {
          const info = await Staking.getStakeInfo(addr);
          const balance = info[0] || info.balance || BigInt(0);
          return { address: addr, stakedBalance: balance };
        } catch {
          return null;
        }
      })
    );

    const stakers = stakerData
      .filter(s => s && s.stakedBalance > 0n)
      .sort((a, b) => (b.stakedBalance > a.stakedBalance ? 1 : -1))
      .slice(0, limit)
      .map(s => ({
        address: s.address,
        stakedBalance: s.stakedBalance.toString(),
        stakedBalanceFormatted: formatEth(s.stakedBalance),
      }));

    const result = {
      stakers,
      pagination: { page: 1, limit, total: stakers.length, pages: 1 },
    };
    cache.set(cacheKey, result, 120);
    res.json(result);
  } catch (err) {
    console.error('Leaderboard stakers error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stakers leaderboard' });
  }
});

// GET /api/leaderboard/earners?limit=20
router.get('/earners', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const cacheKey = `leaderboard_earners_${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Get unique deployers and check their pending BEAN
    const { GridMining } = getContracts();
    const uniqueUsers = await Deployment.distinct('user');

    const earnerData = await Promise.all(
      uniqueUsers.slice(0, 200).map(async (addr) => { // Cap at 200 to avoid RPC overload
        try {
          const rewards = await GridMining.getTotalPendingRewards(addr);
          const unroasted = rewards[1] || BigInt(0);
          return { address: addr, unclaimed: unroasted };
        } catch {
          return null;
        }
      })
    );

    const earners = earnerData
      .filter(e => e && e.unclaimed > 0n)
      .sort((a, b) => (b.unclaimed > a.unclaimed ? 1 : -1))
      .slice(0, limit)
      .map(e => ({
        address: e.address,
        unclaimed: e.unclaimed.toString(),
        unclaimedFormatted: formatEth(e.unclaimed),
      }));

    const result = {
      earners,
      pagination: { page: 1, limit, total: earners.length, pages: 1 },
    };
    cache.set(cacheKey, result, 300); // Cache for 5 min — expensive
    res.json(result);
  } catch (err) {
    console.error('Leaderboard earners error:', err.message);
    res.status(500).json({ error: 'Failed to fetch earners leaderboard' });
  }
});

module.exports = router;
