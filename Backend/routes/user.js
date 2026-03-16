const express = require('express');
const router = express.Router();
const Deployment = require('../models/Deployment');
const Claim = require('../models/Claim');
const { getContracts } = require('../lib/contracts');
const { formatEth } = require('../lib/format');

// GET /api/user/:address
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { Bean } = getContracts();

    const [beanBalance, deployments] = await Promise.all([
      Bean.balanceOf(address).catch(() => BigInt(0)),
      Deployment.aggregate([
        { $match: { user: address.toLowerCase() } },
        {
          $group: {
            _id: null,
            totalDeployed: { $sum: { $toLong: '$totalAmount' } },
            roundsPlayed: { $addToSet: '$roundId' },
            wins: { $sum: 0 }, // Would need settlement data
          },
        },
      ]),
    ]);

    const stats = deployments[0] || { totalDeployed: 0, roundsPlayed: [], wins: 0 };

    res.json({
      address,
      balances: {
        bean: beanBalance.toString(),
        beanFormatted: formatEth(beanBalance),
        bnb: '0',
        bnbFormatted: '0.0',
      },
      stats: {
        roundsPlayed: Array.isArray(stats.roundsPlayed) ? stats.roundsPlayed.length : 0,
        wins: stats.wins || 0,
        totalDeployed: stats.totalDeployed?.toString() || '0',
      },
    });
  } catch (err) {
    console.error('User error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

// GET /api/user/:address/rewards
router.get('/:address/rewards', async (req, res) => {
  try {
    const { address } = req.params;
    const { GridMining } = getContracts();

    const rewards = await GridMining.getTotalPendingRewards(address);
    const pendingETH = rewards[0] || rewards.pendingETH || BigInt(0);
    const pendingUnroasted = rewards[1] || rewards.pendingUnroastedBEAN || BigInt(0);
    const pendingRoasted = rewards[2] || rewards.pendingRoastedBEAN || BigInt(0);
    let uncheckpointedRound = Number(rewards[3] ?? rewards.uncheckpointedRound ?? 0);

    // Workaround for old contract: if user didn't deploy to uncheckpointedRound, find next round they did
    if (uncheckpointedRound > 0) {
      const info = await GridMining.getCurrentRoundInfo();
      const currentRoundId = Number(info.roundId ?? info[0]);
      let found = false;
      for (let r = uncheckpointedRound; r <= currentRoundId; r++) {
        const miner = await GridMining.getMinerInfo(r, address);
        const amountPerBlock = miner.amountPerBlock ?? miner[1];
        const checkpointed = miner.checkpointed ?? miner[2];
        if (amountPerBlock > 0n && !checkpointed) {
          uncheckpointedRound = r;
          found = true;
          break;
        }
      }
      if (!found) uncheckpointedRound = 0;
    }

    uncheckpointedRound = uncheckpointedRound.toString();

    const gross = pendingUnroasted + pendingRoasted;
    // 10% fee on unroasted only
    const fee = pendingUnroasted / 10n;
    const net = gross - fee;

    res.json({
      pendingETH: pendingETH.toString(),
      pendingETHFormatted: formatEth(pendingETH),
      pendingBEAN: {
        unroasted: pendingUnroasted.toString(),
        unroastedFormatted: formatEth(pendingUnroasted),
        roasted: pendingRoasted.toString(),
        roastedFormatted: formatEth(pendingRoasted),
        gross: gross.toString(),
        grossFormatted: formatEth(gross),
        fee: fee.toString(),
        feeFormatted: formatEth(fee),
        net: net.toString(),
        netFormatted: formatEth(net),
      },
      uncheckpointedRound,
    });
  } catch (err) {
    console.error('Rewards error:', err.message);
    res.status(500).json({ error: 'Failed to fetch rewards' });
  }
});

// GET /api/user/:address/history?page=1&limit=20&type=deploy|claim|all
router.get('/:address/history', async (req, res) => {
  try {
    const { address } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const type = req.query.type || 'all';
    const roundId = req.query.roundId ? parseInt(req.query.roundId) : null;

    let history = [];
    let total = 0;

    const userAddr = address.toLowerCase();

    if (type === 'deploy' || type === 'all') {
      const depFilter = { user: userAddr };
      if (roundId) depFilter.roundId = roundId;

      const [deps, depCount] = await Promise.all([
        Deployment.find(depFilter)
          .sort({ timestamp: -1 })
          .skip(type === 'all' ? 0 : skip)
          .limit(type === 'all' ? 1000 : limit)
          .lean(),
        Deployment.countDocuments(depFilter),
      ]);

      history.push(...deps.map(d => ({ ...d, historyType: 'deploy' })));
      total += depCount;
    }

    if (type === 'claim' || type === 'all') {
      const claimFilter = { user: userAddr };

      const [claims, claimCount] = await Promise.all([
        Claim.find(claimFilter)
          .sort({ timestamp: -1 })
          .skip(type === 'all' ? 0 : skip)
          .limit(type === 'all' ? 1000 : limit)
          .lean(),
        Claim.countDocuments(claimFilter),
      ]);

      history.push(...claims.map(c => ({ ...c, historyType: 'claim' })));
      total += claimCount;
    }

    // Sort combined by timestamp
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (type === 'all') {
      history = history.slice(skip, skip + limit);
    }

    res.json({
      history,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('History error:', err.message);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/user/:address/profile - Profile from DB (placeholder - Supabase on frontend)
router.get('/:address/profile', async (req, res) => {
  // Profile data is stored in Supabase via Next.js API routes
  // This backend endpoint returns minimal data
  res.json({
    address: req.params.address,
    username: null,
    bio: null,
    pfp_url: null,
    banner_url: null,
  });
});

module.exports = router;
