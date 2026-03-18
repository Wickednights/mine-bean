const express = require('express');
const router = express.Router();
const Round = require('../models/Round');
const Deployment = require('../models/Deployment');
const { getContracts } = require('../lib/contracts');
const { formatEth } = require('../lib/format');
const cache = require('../lib/cache');

// GET /api/round/current?user=0x...
router.get('/current', async (req, res) => {
  try {
    const { user } = req.query;
    const { GridMining } = getContracts();

    // Get current round info from contract
    const roundInfo = await GridMining.getCurrentRoundInfo();
    const roundId = Number(roundInfo.roundId || roundInfo[0]);
    const startTime = Number(roundInfo.startTime || roundInfo[1]);
    const endTime = Number(roundInfo.endTime || roundInfo[2]);
    const totalDeployed = (roundInfo.totalDeployed || roundInfo[3]).toString();

    // Get per-block deployment data
    let blocks = [];
    try {
      const deployed = await GridMining.getRoundDeployed(roundId);
      blocks = Array.from({ length: 25 }, (_, i) => ({
        id: i,
        deployed: deployed[i].toString(),
        deployedFormatted: formatEth(deployed[i]),
        minerCount: 0, // Would need separate tracking
      }));
    } catch {
      blocks = Array.from({ length: 25 }, (_, i) => ({
        id: i,
        deployed: '0',
        deployedFormatted: '0.0',
        minerCount: 0,
      }));
    }

    // Get beanpot pool
    let beanpotPool = BigInt(0);
    try {
      beanpotPool = await GridMining.beanpotPool();
    } catch {}

    // Get user deployment data if address provided
    let userDeployed = '0';
    let userDeployedFormatted = '0.0';
    if (user) {
      try {
        const minerInfo = await GridMining.getMinerInfo(roundId, user);
        const amountPerBlock = minerInfo.amountPerBlock || minerInfo[1];
        const deployedMask = Number(minerInfo.deployedMask || minerInfo[0]);

        // Count deployed blocks from mask
        let blockCount = 0;
        for (let i = 0; i < 25; i++) {
          if (deployedMask & (1 << i)) blockCount++;
        }
        const total = BigInt(amountPerBlock) * BigInt(blockCount);
        userDeployed = total.toString();
        userDeployedFormatted = formatEth(total);
      } catch {}
    }

    // Count miners per block from DB
    const deployments = await Deployment.find({ roundId });
    for (const dep of deployments) {
      for (const blockId of dep.blockIds) {
        if (blocks[blockId]) {
          blocks[blockId].minerCount++;
        }
      }
    }

    res.json({
      roundId: roundId.toString(),
      startTime,
      endTime,
      totalDeployed,
      totalDeployedFormatted: formatEth(totalDeployed),
      beanpotPool: beanpotPool.toString(),
      beanpotPoolFormatted: formatEth(beanpotPool),
      settled: false,
      blocks,
      userDeployed,
      userDeployedFormatted,
    });
  } catch (err) {
    console.error('Current round error:', err.message);
    res.status(500).json({ error: 'Failed to fetch current round' });
  }
});

// GET /api/round/:id
router.get('/:id', async (req, res) => {
  try {
    const roundId = parseInt(req.params.id);
    let round = await Round.findOne({ roundId });

    if (!round) {
      // Try from contract
      try {
        const { GridMining } = getContracts();
        const info = await GridMining.getRound(roundId);
        return res.json({
          roundId,
          winningBlock: Number(info.winningBlock || info[1]),
          topMiner: info.topMiner || info[2],
          totalWinnings: (info.totalWinnings || info[3]).toString(),
          topMinerReward: (info.topMinerReward || info[4]).toString(),
          beanpotAmount: (info.beanpotAmount || info[5]).toString(),
          isSplit: info.isSplit || info[6],
        });
      } catch {
        return res.status(404).json({ error: 'Round not found' });
      }
    }

    res.json(round);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch round' });
  }
});

// GET /api/round/:id/miners - Computed winning miners
router.get('/:id/miners', async (req, res) => {
  try {
    const roundId = parseInt(req.params.id);
    const round = await Round.findOne({ roundId, settled: true });

    if (!round) {
      return res.status(404).json({ error: 'Settled round not found' });
    }

    const winningBlock = round.winningBlock;
    const deployments = await Deployment.find({ roundId }).sort({ blockNumber: 1, logIndex: 1 });

    // Filter winners: deployed to winning block
    const winners = deployments.filter(dep => {
      return dep.blockMask & (1 << winningBlock);
    });

    if (winners.length === 0) {
      return res.json({ roundId, winningBlock, miners: [] });
    }

    // Calculate total winners deployed (sum of amountPerBlock for winners)
    const totalWinnersDeployed = winners.reduce((sum, w) => sum + BigInt(w.amountPerBlock), BigInt(0));
    const totalWinnings = BigInt(round.totalWinnings || '0');
    const topMinerReward = BigInt(round.topMinerReward || '0');
    const beanpotAmount = BigInt(round.beanpotAmount || '0');

    const miners = winners.map(w => {
      const userDeployed = BigInt(w.amountPerBlock);

      // ETH rewards: proportional
      const ethReward = totalWinnersDeployed > 0n
        ? (totalWinnings * userDeployed) / totalWinnersDeployed
        : 0n;

      // BEAN rewards: always proportional (contract always splits)
      const beanReward = topMinerReward > 0n && totalWinnersDeployed > 0n
        ? (topMinerReward * userDeployed) / totalWinnersDeployed
        : 0n;

      // Beanpot: proportional
      const beanpotBonus = totalWinnersDeployed > 0n && beanpotAmount > 0n
        ? (beanpotAmount * userDeployed) / totalWinnersDeployed
        : 0n;

      return {
        address: w.user,
        ethReward: ethReward.toString(),
        ethRewardFormatted: formatEth(ethReward),
        beanReward: (beanReward + beanpotBonus).toString(),
        beanRewardFormatted: formatEth(beanReward + beanpotBonus),
        deployed: w.amountPerBlock,
        deployedFormatted: formatEth(w.amountPerBlock),
      };
    });

    res.json({ roundId, winningBlock, miners });
  } catch (err) {
    console.error('Miners error:', err.message);
    res.status(500).json({ error: 'Failed to compute miners' });
  }
});

// GET /api/rounds?page=1&limit=20&settled=true&beanpot=true
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.settled === 'true') filter.settled = true;
    if (req.query.beanpot === 'true') {
      filter.beanpotAmount = { $ne: '0', $exists: true };
    }

    const [rounds, total] = await Promise.all([
      Round.find(filter).sort({ roundId: -1 }).skip(skip).limit(limit).lean(),
      Round.countDocuments(filter),
    ]);

    res.json({
      rounds,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rounds' });
  }
});

module.exports = router;
