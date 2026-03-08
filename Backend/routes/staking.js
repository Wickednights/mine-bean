const express = require('express');
const router = express.Router();
const { getContracts } = require('../lib/contracts');
const { formatEth } = require('../lib/format');
const cache = require('../lib/cache');

// GET /api/staking/stats
router.get('/stats', async (req, res) => {
  try {
    const cached = cache.get('staking_stats');
    if (cached) return res.json(cached);

    const { Staking, Bean } = getContracts();

    const globalStats = await Staking.getGlobalStats();
    const totalStaked = (globalStats[0] || globalStats.totalStaked || BigInt(0));

    // Calculate APR from reward rate
    // APR = (rewardRate * secondsPerYear / totalStaked) * 100
    let apr = '0';
    try {
      if (totalStaked > 0n) {
        // Simple estimation — actual APR depends on yield distributions
        const rewardRate = globalStats[2] || globalStats.accYieldPerShare || BigInt(0);
        // Use a reasonable default APR if we can't compute
        apr = '0';
      }
    } catch {}

    // TVL in USD would need BEAN price — return raw for now
    const result = {
      totalStaked: totalStaked.toString(),
      totalStakedFormatted: formatEth(totalStaked),
      apr,
      tvlUsd: '0',
      rewardRate: '0',
      rewardRateFormatted: '0.0',
    };

    cache.set('staking_stats', result, 60);
    res.json(result);
  } catch (err) {
    console.error('Staking stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch staking stats' });
  }
});

// GET /api/staking/:address
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { Staking } = getContracts();

    const info = await Staking.getStakeInfo(address);
    const balance = info[0] || info.balance || BigInt(0);
    const pendingRewards = info[1] || info.pendingRewards || BigInt(0);
    const compoundFeeReserve = info[2] || info.compoundFeeReserve || BigInt(0);
    const canCompound = info[6] || info.canCompound || false;

    res.json({
      balance: balance.toString(),
      balanceFormatted: formatEth(balance),
      pendingRewards: pendingRewards.toString(),
      pendingRewardsFormatted: formatEth(pendingRewards),
      compoundFeeReserve: compoundFeeReserve.toString(),
      compoundFeeReserveFormatted: formatEth(compoundFeeReserve),
      canCompound: Boolean(canCompound),
    });
  } catch (err) {
    console.error('Staking user error:', err.message);
    res.status(500).json({ error: 'Failed to fetch staking info' });
  }
});

module.exports = router;
