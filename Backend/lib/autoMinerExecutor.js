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

const POLL_INTERVAL_MS = parseInt(process.env.AUTO_MINER_EXECUTOR_POLL_MS || '5000', 10) || 5000;
const MIN_TIME_REMAINING_SEC = parseInt(process.env.AUTO_MINER_MIN_TIME_REMAINING || '20', 10) || 20;

// GridMining error selectors (ethers v6 returns "unknown custom error" without decoded name)
const ROUND_NOT_ACTIVE_SELECTOR = '0x3df07da5';
const ALREADY_DEPLOYED_SELECTOR = '0x25b23b73';

let started = false;

// Status for debug API
const status = {
  lastExecutedRound: 0,
  lastError: null,
  executorWallet: null,
};

function getStatus() {
  return { ...status };
}

function isExpectedRevert(err) {
  const msg = err?.message || String(err);
  const data = err?.data ?? err?.error?.data ?? err?.info?.error?.data;
  const selector = typeof data === 'string' && data.length >= 10 ? data.slice(0, 10) : null;
  return (
    msg.includes('RoundNotActive') ||
    msg.includes('AlreadyDeployedThisRound') ||
    msg.includes('AlreadyPlayedThisRound') ||
    msg.includes('RoundLimitReached') ||
    msg.includes('ConfigNotActive') ||
    selector === ROUND_NOT_ACTIVE_SELECTOR ||
    selector === ALREADY_DEPLOYED_SELECTOR
  );
}

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

  status.executorWallet = wallet.address;

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
      if (timeRemaining < MIN_TIME_REMAINING_SEC) return; // need buffer for tx to be mined before round ends
      if (roundId <= status.lastExecutedRound) return;
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
          status.lastExecutedRound = roundId;
          status.lastError = null;
          console.log(`[AutoMinerExecutor] Executed for ${userAddr.slice(0, 10)}... round ${roundId} blocks=${blocks.length}`);
        } catch (err) {
          if (isExpectedRevert(err)) {
            // RoundNotActive, AlreadyDeployedThisRound, etc — skip
            const data = err?.data ?? err?.error?.data;
            if (data && String(data).slice(0, 10) === ROUND_NOT_ACTIVE_SELECTOR) {
              break; // round ended, rest will fail too
            }
          } else {
            status.lastError = err.message || String(err);
            console.error(`[AutoMinerExecutor] Error for ${userAddr?.slice(0, 10)}...:`, err.message || String(err));
          }
        }
      }

      status.lastExecutedRound = roundId;
    } catch (err) {
      if (!isExpectedRevert(err) && !String(err).includes('GameNotStarted')) {
        status.lastError = err.message || String(err);
        console.error('[AutoMinerExecutor] Error:', err.message || String(err));
      }
    }
  }

  setInterval(tryExecute, POLL_INTERVAL_MS);
  tryExecute();
  console.log(`[AutoMinerExecutor] Running (poll every ${POLL_INTERVAL_MS}ms). Fund ${wallet.address} with BNB for gas.`);
}

module.exports = { startAutoMinerExecutor, getStatus };
