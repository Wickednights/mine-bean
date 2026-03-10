const express = require('express');
const router = express.Router();
const { getContracts } = require('../lib/contracts');
const { formatEth } = require('../lib/format');

// GET /api/automine/:address
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { AutoMiner } = getContracts();

    let state;
    try {
      state = await AutoMiner.getUserState(address);
    } catch (contractErr) {
      // Contract call fails for users with no automine history (out of result range)
      // Return default inactive state
      console.warn('AutoMine contract call failed for', address, ':', contractErr.message);
      return res.json({
        config: {
          strategyId: 0,
          numBlocks: 0,
          numRounds: 0,
          roundsExecuted: 0,
          amountPerBlockFormatted: '0.0',
          depositAmountFormatted: '0.0',
          selectedBlockMask: 0,
          selectedBlocks: [],
          active: false,
        },
        costPerRoundFormatted: '0.0',
        roundsRemaining: 0,
        totalRefundableFormatted: '0.0',
      });
    }

    // getUserState returns (config, lastRound, costPerRound, roundsRemaining, totalRefundable)
    // where config is an AutoConfig struct
    const config = state.config || state[0];
    const strategyId = Number(config.strategyId ?? 0);
    const numBlocks = Number(config.numBlocks ?? 0);
    const numRounds = Number(config.numRounds ?? 0);
    const roundsExecuted = Number(config.roundsExecuted ?? 0);
    const amountPerBlock = config.amountPerBlock ?? BigInt(0);
    const depositAmount = config.depositAmount ?? BigInt(0);
    const selectedBlockMask = Number(config.selectedBlockMask ?? 0);
    const active = Boolean(config.active ?? false);

    // Decode selectedBlockMask to block IDs
    const selectedBlocks = [];
    for (let i = 0; i < 25; i++) {
      if (selectedBlockMask & (1 << i)) {
        selectedBlocks.push(i);
      }
    }

    // Calculate cost per round
    const EXECUTOR_FEE_BPS = 100;
    const EXECUTOR_FLAT_FEE = BigInt(6000000000000); // 0.000006 ETH
    const pctFeePerRound = (amountPerBlock * BigInt(numBlocks) * BigInt(EXECUTOR_FEE_BPS)) / 10000n;
    const costPerRound = amountPerBlock * BigInt(numBlocks) + (pctFeePerRound >= EXECUTOR_FLAT_FEE ? pctFeePerRound : EXECUTOR_FLAT_FEE);

    const roundsRemaining = numRounds - roundsExecuted;
    const totalRefundable = costPerRound * BigInt(Math.max(0, roundsRemaining));

    res.json({
      config: {
        strategyId,
        numBlocks,
        numRounds,
        roundsExecuted,
        amountPerBlockFormatted: formatEth(amountPerBlock),
        depositAmountFormatted: formatEth(depositAmount),
        selectedBlockMask,
        selectedBlocks,
        active,
      },
      costPerRoundFormatted: formatEth(costPerRound),
      roundsRemaining,
      totalRefundableFormatted: formatEth(totalRefundable),
    });
  } catch (err) {
    console.error('AutoMine error:', err.message);
    res.status(500).json({ error: 'Failed to fetch autominer state' });
  }
});

module.exports = router;
