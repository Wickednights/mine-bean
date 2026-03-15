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

// Configurable via env: INDEXER_POLL_INTERVAL_MS (default 12s). Higher = fewer RPC calls.
const POLL_INTERVAL = parseInt(process.env.INDEXER_POLL_INTERVAL_MS || '12000', 10) || 12000;
const MAX_BLOCK_RANGE = 2000; // Many RPCs (Alchemy, etc.) reject eth_getLogs over ~2k blocks

// All contract addresses for single eth_getLogs call (reduces 4 RPC calls → 1)
const INDEXER_ADDRESSES = [
  ADDRESSES.GridMining,
  ADDRESSES.AutoMiner,
  ADDRESSES.Treasury,
  ADDRESSES.Staking,
];

let started = false;

async function startIndexer() {
  if (started) return;
  started = true;

  const provider = getProvider();

  // All contracts use HTTP provider with queryFilter polling (no WebSocket/filters needed)
  const GridMining = new ethers.Contract(ADDRESSES.GridMining, GridMiningABI, provider);
  const AutoMiner = new ethers.Contract(ADDRESSES.AutoMiner, AutoMinerABI, provider);
  const Treasury = new ethers.Contract(ADDRESSES.Treasury, TreasuryABI, provider);
  const Staking = new ethers.Contract(ADDRESSES.Staking, StakingABI, provider);

  // Alias for beanpotPool() calls
  const GridMiningRead = GridMining;

  // Track last processed block
  let lastBlock = 0;
  try {
    lastBlock = await provider.getBlockNumber();
    console.log(`[Indexer] Starting from block ${lastBlock}`);
  } catch (err) {
    console.error('[Indexer] Failed to get initial block number:', err.message);
  }

  // ─── Event Handlers ─────────────────────────────────────────────────────

  async function handleGameStarted(event) {
    const [roundId, startTime, endTime] = event.args;
    const rid = Number(roundId);
    console.log(`[Indexer] GameStarted round=${rid}`);

    try {
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

      let beanpotPool = BigInt(0);
      try {
        beanpotPool = await GridMiningRead.beanpotPool();
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
  }

  async function handleDeployed(event, isAutoMine = false) {
    const args = event.args;
    // Deployed: (roundId, user, amountPerBlock, blockMask, totalAmount)
    // DeployedFor: (roundId, user, executor, amountPerBlock, blockMask, totalAmount)
    const offset = isAutoMine ? 1 : 0; // DeployedFor has extra executor arg
    const roundId = args[0];
    const user = args[1];
    const amountPerBlock = args[2 + offset];
    const blockMask = args[3 + offset];
    const totalAmount = args[4 + offset];

    const rid = Number(roundId);
    const userAddr = user.toLowerCase();
    const mask = Number(blockMask);

    const blockIds = [];
    for (let i = 0; i < 25; i++) {
      if (mask & (1 << i)) blockIds.push(i);
    }

    console.log(`[Indexer] ${isAutoMine ? 'DeployedFor' : 'Deployed'} round=${rid} user=${userAddr} blocks=${blockIds.length}`);

    try {
      const blockNumber = event.blockNumber || 0;
      const logIndex = event.index || 0;

      await Deployment.findOneAndUpdate(
        { txHash: event.transactionHash, roundId: rid, user: userAddr },
        {
          roundId: rid,
          user: userAddr,
          amountPerBlock: amountPerBlock.toString(),
          totalAmount: totalAmount.toString(),
          blockMask: mask,
          blockIds,
          isAutoMine,
          txHash: event.transactionHash,
          blockNumber,
          logIndex,
          timestamp: new Date(),
        },
        { upsert: true, new: true }
      );

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

        await Round.updateOne(
          { roundId: rid },
          { totalDeployed: newTotal.toString(), blocks }
        );

        const userDeps = await Deployment.find({ roundId: rid, user: userAddr });
        const userTotal = userDeps.reduce((s, d) => s + BigInt(d.totalAmount), BigInt(0));

        cache.delete('stats');

        emitGlobal('deployed', {
          roundId: rid,
          user: userAddr,
          totalAmount: totalAmount.toString(),
          isAutoMine,
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
      console.error(`[Indexer] ${isAutoMine ? 'DeployedFor' : 'Deployed'} error:`, err.message);
    }
  }

  async function handleRoundSettled(event) {
    const [roundId, winningBlock, topMiner, totalWinnings, topMinerReward,
      beanpotAmount, isSplit, topMinerSeed, winnersDeployed] = event.args;
    const rid = Number(roundId);
    console.log(`[Indexer] RoundSettled round=${rid} winningBlock=${winningBlock}`);

    try {
      const wBlock = Number(winningBlock);
      const bpAmount = beanpotAmount.toString();

      const winnerDeps = await Deployment.find({ roundId: rid }).sort({ blockNumber: 1, logIndex: 1 });
      const winners = winnerDeps.filter(d => d.blockMask & (1 << wBlock));

      let beanWinner = topMiner;
      let winnerCount = winners.length;

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
          txHash: event.transactionHash,
          settledAt: new Date(),
        },
        { upsert: true, new: true }
      );

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

      setTimeout(async () => {
        let newRound = null;
        try {
          const next = await Round.findOne({ roundId: rid + 1 }).lean();
          if (next) {
            let beanpotPool = BigInt(0);
            try {
              beanpotPool = await GridMiningRead.beanpotPool();
            } catch {}
            newRound = {
              roundId: String(next.roundId),
              startTime: next.startTime,
              endTime: next.endTime,
              beanpotPool: beanpotPool.toString(),
              beanpotPoolFormatted: formatEth(beanpotPool),
            };
          }
        } catch {}
        emitGlobal('roundTransition', {
          settled: {
            roundId: rid,
            winningBlock: wBlock,
            beanpotAmount: bpAmount,
          },
          newRound,
        });
      }, 500);
    } catch (err) {
      console.error('[Indexer] RoundSettled error:', err.message);
    }
  }

  async function handleClaimedETH(event) {
    const [user, amount] = event.args;
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] ClaimedETH user=${userAddr}`);

    try {
      await Claim.create({
        user: userAddr,
        type: 'eth',
        amount: amount.toString(),
        txHash: event.transactionHash,
        timestamp: new Date(),
      });

      emitToUser(userAddr, 'claimedETH', {
        amount: amount.toString(),
        txHash: event.transactionHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Indexer] ClaimedETH error:', err.message);
    }
  }

  async function handleClaimedBEAN(event) {
    const [user, minedBean, roastedBean, fee, net] = event.args;
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
        txHash: event.transactionHash,
        timestamp: new Date(),
      });

      emitToUser(userAddr, 'claimedBEAN', {
        gross: gross.toString(),
        fee: fee.toString(),
        net: net.toString(),
        txHash: event.transactionHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Indexer] ClaimedBEAN error:', err.message);
    }
  }

  async function handleCheckpointed(event) {
    const [roundId, user, ethReward, beanReward] = event.args;
    const userAddr = user.toLowerCase();
    emitToUser(userAddr, 'checkpointed', {
      roundId: Number(roundId),
      ethReward: ethReward.toString(),
      beanReward: beanReward.toString(),
    });
  }

  async function handleExecutedFor(event) {
    const [user, roundId, blocks, totalDeployed, fee, roundsExecuted] = event.args;
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
  }

  async function handleConfigDeactivated(event) {
    const [user, roundsCompleted] = event.args;
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] AutoMiner ConfigDeactivated user=${userAddr}`);

    emitToUser(userAddr, 'configDeactivated', {
      roundsCompleted: Number(roundsCompleted),
    });
  }

  async function handleStopped(event) {
    const [user, refundAmount, roundsCompleted] = event.args;
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] AutoMiner Stopped user=${userAddr}`);

    emitToUser(userAddr, 'stopped', {
      refundAmount: refundAmount.toString(),
      roundsCompleted: Number(roundsCompleted),
    });
  }

  async function handleBuybackExecuted(event) {
    const [ethSpent, beanReceived, beanBurned, beanToStakers] = event.args;
    console.log('[Indexer] BuybackExecuted');

    try {
      const txHash = event.transactionHash;
      const block = await provider.getBlock(event.blockNumber).catch(() => null);
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
          blockNumber: event.blockNumber,
          timestamp,
        },
        { upsert: true }
      );

      cache.delete('treasury_stats');
    } catch (err) {
      console.error('[Indexer] BuybackExecuted error:', err.message);
    }
  }

  async function handleDeposited(event) {
    const [user, amount] = event.args;
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] Staking Deposited user=${userAddr}`);

    try {
      await StakeEvent.create({
        user: userAddr,
        type: 'deposit',
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.transactionHash,
        timestamp: new Date(),
      });

      cache.delete('staking_stats');
      cache.delete(`leaderboard_stakers_20`);

      emitToUser(userAddr, 'stakeDeposited', {
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.transactionHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Indexer] Deposited error:', err.message);
    }
  }

  async function handleWithdrawn(event) {
    const [user, amount] = event.args;
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] Staking Withdrawn user=${userAddr}`);

    try {
      await StakeEvent.create({
        user: userAddr,
        type: 'withdraw',
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.transactionHash,
        timestamp: new Date(),
      });

      cache.delete('staking_stats');

      emitToUser(userAddr, 'stakeWithdrawn', {
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.transactionHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Indexer] Withdrawn error:', err.message);
    }
  }

  async function handleYieldClaimed(event) {
    const [user, amount] = event.args;
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] Staking YieldClaimed user=${userAddr}`);

    try {
      await StakeEvent.create({
        user: userAddr,
        type: 'claim',
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.transactionHash,
        timestamp: new Date(),
      });

      emitToUser(userAddr, 'yieldClaimed', {
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.transactionHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Indexer] YieldClaimed error:', err.message);
    }
  }

  async function handleYieldCompounded(event) {
    const [user, amount] = event.args;
    const userAddr = user.toLowerCase();
    console.log(`[Indexer] Staking YieldCompounded user=${userAddr}`);

    try {
      await StakeEvent.create({
        user: userAddr,
        type: 'compound',
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.transactionHash,
        timestamp: new Date(),
      });

      emitToUser(userAddr, 'yieldCompounded', {
        amount: amount.toString(),
        amountFormatted: formatEth(amount),
        txHash: event.transactionHash,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Indexer] YieldCompounded error:', err.message);
    }
  }

  async function handleYieldDistributed(event) {
    const [amount] = event.args;
    console.log('[Indexer] YieldDistributed');
    cache.delete('staking_stats');

    emitGlobal('yieldDistributed', {
      amount: amount.toString(),
      amountFormatted: formatEth(amount),
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Event Dispatch Map ─────────────────────────────────────────────────

  const eventHandlers = {
    // GridMining events
    GameStarted: handleGameStarted,
    Deployed: (e) => handleDeployed(e, false),
    DeployedFor: (e) => handleDeployed(e, true),
    RoundSettled: handleRoundSettled,
    ClaimedETH: handleClaimedETH,
    ClaimedBEAN: handleClaimedBEAN,
    Checkpointed: handleCheckpointed,
    // AutoMiner events
    ExecutedFor: handleExecutedFor,
    ConfigDeactivated: handleConfigDeactivated,
    Stopped: handleStopped,
    // Treasury events
    BuybackExecuted: handleBuybackExecuted,
    // Staking events
    Deposited: handleDeposited,
    Withdrawn: handleWithdrawn,
    YieldClaimed: handleYieldClaimed,
    YieldCompounded: handleYieldCompounded,
    YieldDistributed: handleYieldDistributed,
  };

  // ─── Polling Loop ───────────────────────────────────────────────────────
  // Single eth_getLogs for all 4 contracts (4x fewer RPC calls than separate queryFilter)

  const addrToInterface = { [ADDRESSES.GridMining.toLowerCase()]: GridMining.interface, [ADDRESSES.AutoMiner.toLowerCase()]: AutoMiner.interface, [ADDRESSES.Treasury.toLowerCase()]: Treasury.interface, [ADDRESSES.Staking.toLowerCase()]: Staking.interface };

  function parseLogToEvent(rawLog) {
    const iface = addrToInterface[rawLog.address?.toLowerCase()];
    if (!iface) return null;
    try {
      const parsed = iface.parseLog({ topics: rawLog.topics, data: rawLog.data });
      if (!parsed) return null;
      return {
        args: parsed.args,
        blockNumber: rawLog.blockNumber,
        transactionHash: rawLog.transactionHash,
        index: rawLog.index,
        fragment: { name: parsed.name },
      };
    } catch {
      return null;
    }
  }

  async function pollEvents() {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock <= lastBlock) return;

      const fromBlock = lastBlock + 1;
      let toBlock = currentBlock;
      if (toBlock - fromBlock + 1 > MAX_BLOCK_RANGE) {
        toBlock = fromBlock + MAX_BLOCK_RANGE - 1;
      }
      lastBlock = toBlock;

      const rawLogs = await provider.getLogs({ address: INDEXER_ADDRESSES, fromBlock, toBlock }).catch(err => {
        console.error('[Indexer] getLogs error:', err.message);
        return [];
      });

      const allEvents = rawLogs
        .map(parseLogToEvent)
        .filter(Boolean)
        .sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

      for (const event of allEvents) {
        const eventName = event.fragment?.name;
        const handler = eventHandlers[eventName];
        if (handler) {
          try {
            await handler(event);
          } catch (err) {
            console.error(`[Indexer] Handler error for ${eventName}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error('[Indexer] Poll error:', err.message);
    }
  }

  setInterval(pollEvents, POLL_INTERVAL);

  console.log(`[Indexer] Listening via single eth_getLogs (${POLL_INTERVAL}ms interval, env: INDEXER_POLL_INTERVAL_MS)`);
}

module.exports = { startIndexer };
