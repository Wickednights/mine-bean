/**
 * AutoMiner executor: calls AutoMiner.executeFor(user, blocks) for each active user
 * when a new round starts. Users deposit BNB and configure a strategy; this service
 * deploys on their behalf each round.
 *
 * Requires: EXECUTOR_PRIVATE_KEY in .env (wallet must be the configured executor and hold BNB for gas)
 * Disable: omit EXECUTOR_PRIVATE_KEY or set AUTO_MINER_EXECUTOR_ENABLED=false
 */

const { ethers } = require('ethers');
const { getProvider, getContracts, ADDRESSES } = require('./contracts');
const AutoMinerABI = require('../abis/AutoMiner.json');
const GridMiningABI = require('../abis/GridMining.json');

const POLL_INTERVAL_MS = parseInt(process.env.AUTO_MINER_EXECUTOR_POLL_MS || '15000', 10) || 15000;

let started = false;

function decodeBlockMask(mask) {
  const blocks = [];
  for (let i = 0; i < 25; i++) {
    if (mask & (1 << i)) blocks.push(i);
  }
  return blocks;
}

function randomBlocks(n) {
  const indices = Array.from({ length: 25 }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, n).sort((a, b) => a - b);
}

async function startAutoMinerExecutor() {
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
  if (!privateKey || process.env.AUTO_MINER_EXECUTOR_ENABLED === 'false') {
    if (!privateKey) {
      console.log('[AutoMinerExecutor] EXECUTOR_PRIVATE_KEY not set — executor disabled');
    } else {
      console.log('[AutoMinerExecutor] AUTO_MINER_EXECUTOR_ENABLED=false — executor disabled');
    }
    return;
  }

  if (started) return;
  started = true;

  const provider = getProvider();
  const wallet = new ethers.Wallet(privateKey, provider);
  const AutoMiner = new ethers.Contract(ADDRESSES.AutoMiner, AutoMinerABI, wallet);
  const GridMining = new ethers.Contract(ADDRESSES.GridMining, GridMiningABI, provider);

  const executorAddr = await AutoMiner.executor();
  if (executorAddr.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error(`[AutoMinerExecutor] Wallet ${wallet.address} is not the configured executor (${executorAddr}). Aborting.`);
    return;
  }

  let lastExecutedRound = 0;

  async function tryExecute() {
    try {
      const [roundInfo, count] = await Promise.all([
        GridMining.getCurrentRoundInfo(),
        AutoMiner.getActiveUserCount(),
      ]);
      const roundId = Number(roundInfo.roundId ?? roundInfo[0]);
      const timeRemaining = Number(roundInfo.timeRemaining ?? roundInfo[4]);
      const isActive = roundInfo.isActive ?? roundInfo[5];

      if (!isActive || timeRemaining <= 0) return;
      if (roundId <= lastExecutedRound) return;
      if (Number(count) === 0) return;

      const users = await AutoMiner.getActiveUsers(0, 100);
      const userAddrs = Array.isArray(users) ? users : (users.users ?? users);

      for (const userAddr of userAddrs) {
        if (!userAddr || userAddr === ethers.ZeroAddress) continue;
        try {
          const lastPlayed = await AutoMiner.lastRoundPlayed(userAddr);
          if (Number(lastPlayed) === roundId) continue;

          const state = await AutoMiner.getUserState(userAddr);
          const config = state.config ?? state[0];
          if (!config || !(config.active ?? config[2] ?? false)) continue;

          const strategyId = Number(config.strategyId ?? config[0] ?? 0);
          const numBlocks = Number(config.numBlocks ?? config[1] ?? 25);
          const selectedBlockMask = Number(config.selectedBlockMask ?? config[4] ?? 0);

          let blocks;
          if (strategyId === 1) {
            blocks = Array.from({ length: 25 }, (_, i) => i);
          } else if (strategyId === 2 && selectedBlockMask > 0) {
            blocks = decodeBlockMask(selectedBlockMask);
          } else {
            blocks = randomBlocks(Math.min(numBlocks, 25));
          }

          if (blocks.length === 0) continue;

          await AutoMiner.executeFor(userAddr, blocks);
          console.log(`[AutoMinerExecutor] Executed for ${userAddr.slice(0, 10)}... round ${roundId} blocks=${blocks.length}`);
        } catch (err) {
          const msg = err.message || String(err);
          if (
            msg.includes('RoundNotActive') ||
            msg.includes('AlreadyPlayedThisRound') ||
            msg.includes('RoundLimitReached') ||
            msg.includes('ConfigNotActive')
          ) {
            // Expected — skip
          } else {
            console.error(`[AutoMinerExecutor] Error for ${userAddr?.slice(0, 10)}...:`, msg);
          }
        }
      }

      lastExecutedRound = roundId;
    } catch (err) {
      const msg = err.message || String(err);
      if (!msg.includes('RoundNotActive') && !msg.includes('GameNotStarted')) {
        console.error('[AutoMinerExecutor] Error:', msg);
      }
    }
  }

  setInterval(tryExecute, POLL_INTERVAL_MS);
  tryExecute();
  console.log(`[AutoMinerExecutor] Running (poll every ${POLL_INTERVAL_MS}ms). Fund ${wallet.address} with BNB for gas.`);
}

module.exports = { startAutoMinerExecutor };
