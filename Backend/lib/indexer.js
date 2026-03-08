const { ethers } = require('ethers');
const { getContracts, getProvider, ADDRESSES } = require('../lib/contracts');
const { formatEth } = require('../lib/format');
const { emitGlobal, emitToUser } = require('../lib/sse');
const cache = require('../lib/cache');

const Round = require('../models/Round');
const Deployment = require('../models/Deployment');
const Buyback = require('../models/Buyback');
const Claim = require('../models/Claim');
const StakeEvent = require('../models/StakeEvent');

const GridMiningABI = require('../abis/GridMining.json');
const AutoMinerABI = require('../abis/AutoMiner.json');
const TreasuryABI = require('../abis/Treasury.json');
const StakingABI = require('../abis/Staking.json');

let started = false;

async function startIndexer() {
  if (started) return;
  started = true;

  const provider = getProvider();

  // Reconnecting provider wrapper
  provider.on('error', (err) => {
    console.error('[Indexer] Provider error:', err.message);
  });

  const GridMining = new ethers.Contract(ADDRESSES.GridMining, GridMiningABI, provider);
  const AutoMiner = new ethers.Contract(ADDRESSES.AutoMiner, AutoMinerABI, provider);
  const Treasury = new ethers.Contract(ADDRESSES.Treasury, TreasuryABI, provider);
  const Staking = new ethers.Contract(ADDRESSES.Staking, StakingABI, provider);

  // ─── GridMining Events ───────────────────────────────────────────────────

  GridMining.on('GameStarted', async (roundId, startTime, endTime, event) => {
    const rid = Number(roundId);
    console.log(`[Indexer] GameStarted round=${rid}`);

    try {
      // Upsert round
      await Round.findOneAndUpdate(
        { roundId: rid },
        {
          roundId: rid,
          startTime: Number(startTime),
          endTime: Number(endTime),
          settled: false,
          totalDeployed: '0',
          beanpotPool: '0',
        },
        { upsert: true, new: true }
      );

      // Get beanpot pool
      let beanpotPool = BigInt(0);
      try {
        beanpotPool = await GridMining.beanpotPool();
      } catch {}

      cache.delete('stats');

      emitGlobal('gameStarted', {
        roundId: rid,
        startTime: Number(startTime),
        endTime: Number(endTime),
        beanpotPool: beanpotPool.toString(),
        beanpotPoolFormatted: formatEth(beanpotPool),
      });
    } catch (err) {
      console.error('[Indexer] GameStarted error:', err.message);
    }
  });

  GridMining.on('Deployed', async (roundId, user, amountPerBlock, blockMask, totalAmount, event) => {
    const rid = Number(roundId);
    const userAddr = user.toLowerCase();
    const mask = Number(blockMask);

    // Decode block IDs from mask
    const blockIds = [];
    for (let i = 0; i < 25; i++) {
      if (mask & (1 << i)) blockIds.push(i);
    }

    console.log(`[Indexer] Deployed round=${rid} user=${userAddr} blocks=${blockIds.length}`);

    try {
      const txReceipt = await event.getTransactionReceipt().catch(() => null);
      const blockNumber = txReceipt?.blockNumber || event.log?.blockNumber || 0;
      const logIndex = txReceipt ? event.log?.index || 0 : 0;

      await Deployment.findOneAndUpdate(
        { txHash: event.log?.transactionHash, roundId: rid, user: userAddr },
        {
          roundId: rid,
          user: userAddr,
          amountPerBlock: amountPerBlock.toString(),
          totalAmount: totalAmount.toString(),
          blockMask: mask,
          blockIds,
          isAutoMine: false,
          txHash: event.log?.transactionHash,
          blockNumber,
          logIndex,
          timestamp: new Date(),
        },
        { upsert: true, new: true }
      );

      // Update round totals
      const round = await Round.findOne({ roundId: rid });
      if (round) {
        const currentTotal = BigInt(round.totalDeployed || '0');
        const newTotal = currentTotal + BigInt(totalAmount);

        // Update per-block data
        const blocks = round.blocks && round.blocks.length === 25
          ? [...round.blocks]
          : Array.from({ length: 25 }, (_, i) => ({ id: i, deployed: '0', minerCount: 0 }));

        for (const blockId of blockIds) {
          const existing = BigInt(blocks[blockId]?.deployed || '0');
          blocks[blockId] = {
            id: blockId,
            deployed: (existing + BigInt(amountPerBlock)).toString(),
            minerCount: (blocks[blockId]?.minerCount || 0) + 1,
          };
        }

        await Round.updateOne(
          { roundId: rid },
          { totalDeployed: newTotal.toString(), blocks }
        );

        // Get user total for this round
        const userDeps = await Deployment.find({ roundId: rid, user: userAddr });
        const userTotal = userDeps.reduce((s, d) => s + BigInt(d.totalAmount), BigInt(0));

        cache.delete('stats');

        emitGlobal('deployed', {
          roundId: rid,
          user: userAddr,
          totalAmount: totalAmount.toString(),
          isAutoMine: false,
          totalDeployed: newTotal.toString(),
          totalDeployedFormatted: formatEth(newTotal),
          userDeployed: userTotal.toString(),
          userDeployedFormatted: formatEth(userTotal),
          blocks: blockIds.map(id => ({
            id,
            deployed: blocks[id].deployed,
            deployedFormatted: formatEth(blocks[id].deployed),
            minerCount: blocks[id].minerCount,
          })),
        });
      }
    } catch (err) {
      console.error('[Indexer] Deployed error:', err.message);
    }
  });

  GridMining.on('DeployedFor', async (roundId, user, executor, amountPerBlock, blockMask, totalAmount, event) => {
    const rid = Number(roundId);
    const userAddr = user.toLowerCase();
    const mask = Number(blockMask);

    const blockIds = [];
    for (let i = 0; i < 25; i++) {
      if (mask & (1 << i)) blockIds.push(i);
    }

    console.log(`[Indexer] DeployedFor round=${rid} user=${userAddr} (auto)`);

    try {
      const txReceipt = await event.getTransactionReceipt().catch(() => null);
      const blockNumber = txReceipt?.blockNumber || 0;
      const logIndex = event.log?.index || 0;

      await Deployment.findOneAndUpdate(
        { txHash: event.log?.transactionHash, roundId: rid, user: userAddr },
        {
          roundId: rid,
          user: userAddr,
          amountPerBlock: amountPerBlock.toString(),
          totalAmount: totalAmount.toString(),
          blockMask: mask,
          blockIds,
          isAutoMine: true,
          txHash: event.log?.transactionHash,
          blockNumber,
          logIndex,
          timestamp: new Date(),
        },
        { upsert: true, new: true }
      );

      // Update round totals
      const round = await Round.findOne({ roundId: rid });
      if (round) {
        const currentTotal = BigInt(round.totalDeployed || '0');
        const newTotal = currentTotal + BigInt(totalAmount);

        const blocks = round.blocks && round.blocks.length === 25
          ? [...round.blocks]
          : Array.from({ length: 25 }, (_, i) => ({ id: i, deployed: '0', minerCount: 0 }));

        for (const blockId of blockIds) {
          const existing = BigInt(blocks[blockId]?.deployed || '0');
          blocks[blockId] = {
            id: blockId,
            deployed: (existing + BigInt(amountPerBlock)).toString(),
            minerCount: (blocks[blockId]?.minerCount || 0) + 1,
          };
        }

        await Round.updateOne({ roundId: rid }, { totalDeployed: newTotal.toString(), blocks });

        const userDeps = await Deployment.find({ roundId: rid, user: userAddr });
        const userTotal = userDeps.reduce((s, d) => s + BigInt(d.totalAmount), BigInt(0));

        emitGlobal('deployed', {
          roundId: rid,
          user: userAddr,
          totalAmount: totalAmount.toString(),
          isAutoMine: true,
          totalDeployed: newTotal.toString(),
          totalDeployedFormatted: formatEth(newTotal),
          userDeployed: userTotal.toString(),
          userDeployedFormatted: formatEth(userTotal),
          blocks: blockIds.map(id => ({
            id,
            deployed: blocks[id].deployed,
            deployedFormatted: formatEth(blocks[id].deployed),
            minerCount: blocks[id].minerCount,
          })),
        });
      }
    } catch (err) {
      console.error('[Indexer] DeployedFor error:', err.message);
    }
  });

  GridMining.on('RoundSettled', async (
    roundId, winningBlock, topMiner, totalWinnings, topMinerReward,
    beanpotAmount, isSplit, topMinerSeed, winnersDeployed, event
  ) => {
    const rid = Number(roundId);
    console.log(`[Indexer] RoundSettled round=${rid} winningBlock=${winningBlock}`);

    try {
      const wBlock = Number(winningBlock);
      const bpAmount = beanpotAmount.toString();

      // Determine beanWinner
      const winnerDeps = await Deployment.find({ roundId: rid }).sort({ blockNumber: 1, logIndex: 1 });
      const winners = winnerDeps.filter(d => d.blockMask & (1 << wBlock));

      let beanWinner = topMiner;
      let winnerCount = winners.length;

      // Store in DB
      await Round.findOneAndUpdate(
        { roundId: rid },
        {
          settled: true,
          winningBlock: wBlock,
          topMiner: topMiner.toLowerCase(),
          topMinerReward: topMinerReward.toString(),
          topMinerSeed: topMinerSeed.toString(),
          winnersDeployed: winnersDeployed.toString(),
          totalWinnings: totalWinnings.toString(),
          beanpotAmount: bpAmount,
          isSplit: Boolean(isSplit),
          beanWinner: beanWinner.toLowerCase(),
          winnerCount,
          txHash: event.log?.transactionHash,
          settledAt: new Date(),
        },
        { upsert: true, new: true }
      );

      // Compute vaulted (10% of totalWinnings goes to treasury)
      const total = BigInt(totalWinnings);
      const vaulted = total / 10n;
      await Round.updateOne({ roundId: rid }, { vaultedAmount: vaulted.toString() });

      cache.delete('stats');
      cache.delete('treasury_stats');

      emitGlobal('roundSettled', {
        roundId: rid,
        winningBlock: wBlock,
        topMiner: topMiner.toLowerCase(),
        totalWinnings: totalWinnings.toString(),
        topMinerReward: topMinerReward.toString(),
        beanpotAmount: bpAmount,
        isSplit: Boolean(isSplit),
        topMinerSeed: topMinerSeed.toString(),
        winnersDeployed: winnersDeployed.toString(),
      });

      // After settlement, emit roundTransition for beanpot celebration
      setTimeout(() => {
        emitGlobal('roundTransition', {
          settled: {
            roundId: rid,
            winningBlock: wBlock,
            beanpotAmount: bpAmount,
          },
        });
      }, 500);
    } catch (err) {
      console.error('[Indexer] RoundSettled error:', err.message);
    }
  });

  GridMining.on('ClaimedETH', async (user, amount, event) => {
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] ClaimedETH user=${userAddr}`);

    try {
      await Claim.create({
        user: userAddr,
        type: 'eth',
        amount: amount.toString(),
        txHash: event.log?.transactionHash,
        timestamp: new Date(),
      });

      emitToUser(userAddr, 'claimedETH', {
        amount: amount.toString(),
        txHash: event.log?.transactionHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Indexer] ClaimedETH error:', err.message);
    }
  });

  GridMining.on('ClaimedBEAN', async (user, minedBean, roastedBean, fee, net, event) => {
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] ClaimedBEAN user=${userAddr}`);

    try {
      const gross = BigInt(minedBean) + BigInt(roastedBean);
      await Claim.create({
        user: userAddr,
        type: 'bean',
        amount: net.toString(),
        gross: gross.toString(),
        fee: fee.toString(),
        net: net.toString(),
        txHash: event.log?.transactionHash,
        timestamp: new Date(),
      });

      emitToUser(userAddr, 'claimedBEAN', {
        gross: gross.toString(),
        fee: fee.toString(),
        net: net.toString(),
        txHash: event.log?.transactionHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Indexer] ClaimedBEAN error:', err.message);
    }
  });

  GridMining.on('Checkpointed', async (roundId, user, ethReward, beanReward, event) => {
    const userAddr = user.toLowerCase();
    emitToUser(userAddr, 'checkpointed', {
      roundId: Number(roundId),
      ethReward: ethReward.toString(),
      beanReward: beanReward.toString(),
    });
  });

  // ─── AutoMiner Events ────────────────────────────────────────────────────

  AutoMiner.on('ExecutedFor', async (user, roundId, blocks, totalDeployed, fee, roundsExecuted, event) => {
    const userAddr = user.toLowerCase();
    const rid = Number(roundId);
    const blockIds = blocks.map(Number);

    console.log(`[Indexer] AutoMiner ExecutedFor round=${rid} user=${userAddr}`);

    emitToUser(userAddr, 'autoMineExecuted', {
      roundId: rid,
      blocks: blockIds,
      totalDeployed: totalDeployed.toString(),
      fee: fee.toString(),
      roundsExecuted: Number(roundsExecuted),
    });
  });

  AutoMiner.on('ConfigDeactivated', async (user, roundsCompleted, event) => {
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] AutoMiner ConfigDeactivated user=${userAddr}`);

    emitToUser(userAddr, 'configDeactivated', {
      roundsCompleted: Number(roundsCompleted),
    });
  });

  AutoMiner.on('Stopped', async (user, refundAmount, roundsCompleted, event) => {
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] AutoMiner Stopped user=${userAddr}`);

    emitToUser(userAddr, 'stopped', {
      refundAmount: refundAmount.toString(),
      roundsCompleted: Number(roundsCompleted),
    });
  });

  // ─── Treasury Events ─────────────────────────────────────────────────────

  Treasury.on('BuybackExecuted', async (ethSpent, beanReceived, beanBurned, beanToStakers, event) => {
    console.log('[Indexer] BuybackExecuted');

    try {
      const txHash = event.log?.transactionHash;
      const block = await provider.getBlock(event.log?.blockNumber).catch(() => null);
      const timestamp = block ? new Date(Number(block.timestamp) * 1000) : new Date();

      await Buyback.findOneAndUpdate(
        { txHash },
        {
          ethSpent: ethSpent.toString(),
          ethSpentFormatted: formatEth(ethSpent),
          beanReceived: beanReceived.toString(),
          beanReceivedFormatted: formatEth(beanReceived),
          beanBurned: beanBurned.toString(),
          beanBurnedFormatted: formatEth(beanBurned),
          beanToStakers: beanToStakers.toString(),
          beanToStakersFormatted: formatEth(beanToStakers),
          txHash,
          blockNumber: event.log?.blockNumber,
          timestamp,
        },
        { upsert: true }
      );

      cache.delete('treasury_stats');
    } catch (err) {
      console.error('[Indexer] BuybackExecuted error:', err.message);
    }
  });

  // ─── Staking Events ──────────────────────────────────────────────────────

  Staking.on('Deposited', async (user, amount, newBalance, event) => {
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] Staking Deposited user=${userAddr}`);

    try {
      await StakeEvent.create({
        user: userAddr,
        type: 'deposit',
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.log?.transactionHash,
        timestamp: new Date(),
      });

      cache.delete('staking_stats');
      cache.delete(`leaderboard_stakers_20`);

      emitToUser(userAddr, 'stakeDeposited', {
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.log?.transactionHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Indexer] Deposited error:', err.message);
    }
  });

  Staking.on('Withdrawn', async (user, amount, newBalance, event) => {
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] Staking Withdrawn user=${userAddr}`);

    try {
      await StakeEvent.create({
        user: userAddr,
        type: 'withdraw',
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.log?.transactionHash,
        timestamp: new Date(),
      });

      cache.delete('staking_stats');

      emitToUser(userAddr, 'stakeWithdrawn', {
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.log?.transactionHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Indexer] Withdrawn error:', err.message);
    }
  });

  Staking.on('YieldClaimed', async (user, amount, event) => {
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] Staking YieldClaimed user=${userAddr}`);

    try {
      await StakeEvent.create({
        user: userAddr,
        type: 'claim',
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.log?.transactionHash,
        timestamp: new Date(),
      });

      emitToUser(userAddr, 'yieldClaimed', {
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.log?.transactionHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Indexer] YieldClaimed error:', err.message);
    }
  });

  Staking.on('YieldCompounded', async (user, amount, compounder, fee, event) => {
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] Staking YieldCompounded user=${userAddr}`);

    try {
      await StakeEvent.create({
        user: userAddr,
        type: 'compound',
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.log?.transactionHash,
        timestamp: new Date(),
      });

      emitToUser(userAddr, 'yieldCompounded', {
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.log?.transactionHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Indexer] YieldCompounded error:', err.message);
    }
  });

  Staking.on('YieldDistributed', async (amount, newAccYieldPerShare, event) => {
    console.log('[Indexer] YieldDistributed');
    cache.delete('staking_stats');

    emitGlobal('yieldDistributed', {
      amount: amount.toString(),
      amountFormatted: formatEth(amount),
      timestamp: new Date().toISOString(),
    });
  });

  console.log('[Indexer] Listening to contract events on BSC mainnet');
}

module.exports = { startIndexer };
