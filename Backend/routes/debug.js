/**
 * Debug API: aggregates contract reads and backend status for troubleshooting.
 * GET /api/debug?address=0x... — full debug (user-scoped + global)
 * GET /api/debug — global only (no address)
 */

const express = require('express');
const router = express.Router();
const { getContracts, getProvider, ADDRESSES } = require('../lib/contracts');
const { formatEth } = require('../lib/format');

async function getDiagnostic() {
  try {
    const { getContracts } = require('../lib/contracts');
    const { Bean, GridMining, Treasury, Staking } = getContracts();
    const provider = getProvider();
    const [totalSupply, beanpotPool, minter, gridMiningTotalMinted, gridMiningBeanAddr] = await Promise.all([
      Bean.totalSupply().then((v) => v.toString()).catch((e) => `error: ${e.message}`),
      GridMining.beanpotPool().then((v) => v.toString()).catch((e) => `error: ${e.message}`),
      Bean.minter().then((a) => (typeof a === 'string' ? a : a?.toString?.() || null)).catch((e) => `error: ${e.message}`),
      GridMining.totalMinted().then((v) => v.toString()).catch((e) => `error: ${e.message}`),
      GridMining.bean().then((a) => (typeof a === 'string' ? a : a?.toString?.() || null)).catch((e) => `error: ${e.message}`),
    ]);
    const minterAddr = typeof minter === 'string' && minter.startsWith('0x') ? minter : null;
    const gridMiningAddr = ADDRESSES.GridMining?.toLowerCase?.() ?? '';
    const appBeanAddr = ADDRESSES.Bean?.toLowerCase?.() ?? '';
    const gridMiningBean = (typeof gridMiningBeanAddr === 'string' && gridMiningBeanAddr.startsWith('0x')) ? gridMiningBeanAddr.toLowerCase() : null;
    const minterMatch = minterAddr && gridMiningAddr && minterAddr.toLowerCase() === gridMiningAddr;
    const beanAddressMatch = gridMiningBean && appBeanAddr && gridMiningBean === appBeanAddr;
    return {
      addresses: { Bean: ADDRESSES.Bean, GridMining: ADDRESSES.GridMining, AutoMiner: ADDRESSES.AutoMiner },
      bean: { totalSupply, minter: minterAddr || minter },
      gridMining: { beanpotPool, totalMinted: gridMiningTotalMinted, beanAddress: gridMiningBeanAddr },
      minterMatchesGridMining: minterMatch,
      beanAddressMatch,
    };
  } catch (e) {
    return { error: e.message };
  }
}

router.get('/', async (req, res) => {
  try {
    const address = (req.query.address || '').trim().toLowerCase();
    const { GridMining, AutoMiner } = getContracts();

    const rpcUrl = process.env.RPC_URL || '';
    let rpcHost = null;
    try {
      if (rpcUrl) rpcHost = new URL(rpcUrl).hostname;
    } catch {
      rpcHost = null;
    }

    const chainId = parseInt(process.env.CHAIN_ID || '97', 10) || 97;
    const networkLabel =
      process.env.NETWORK_LABEL ||
      (chainId === 56 ? 'BSC mainnet' : chainId === 97 ? 'BSC testnet (Chapel)' : `chain ${chainId}`);

    const result = {
      meta: {
        networkLabel,
        chainId,
        rpcConfigured: Boolean(process.env.RPC_URL),
        rpcHost,
      },
      gridMining: null,
      rewards: null,
      autoMiner: null,
      diagnostic: null,
      backendStatus: null,
      fetchedAt: new Date().toISOString(),
    };

    // ─── GridMining (always) ─────────────────────────────────────────────
    try {
      const info = await GridMining.getCurrentRoundInfo();
      const roundId = Number(info.roundId ?? info[0]);
      const timeRemaining = Number(info.timeRemaining ?? info[4]);
      const isActive = info.isActive ?? info[5];

      result.gridMining = {
        currentRoundId: roundId,
        roundInfo: {
          roundId,
          timeRemaining,
          isActive,
        },
        round: null,
      };

      const round = await GridMining.getRound(roundId);
      result.gridMining.round = {
        startTime: round?.startTime?.toString?.() ?? round?.[0]?.toString?.(),
        endTime: round?.endTime?.toString?.() ?? round?.[1]?.toString?.(),
        settled: round?.settled ?? round?.[8],
        winningBlock: round?.winningBlock != null ? Number(round.winningBlock ?? round[4]) : null,
        topMiner: round?.topMiner ?? round?.[5],
      };
    } catch (e) {
      result.gridMining = { error: e.message };
    }

    // ─── User-scoped: rewards, minerInfo, autoMiner ───────────────────────
    if (address && address.startsWith('0x') && address.length === 42) {
      try {
        const rewards = await GridMining.getTotalPendingRewards(address);
        const pendingETH = rewards[0] ?? rewards.pendingETH ?? BigInt(0);
        const pendingUnroasted = rewards[1] ?? rewards.pendingUnroastedBEAN ?? BigInt(0);
        const pendingRoasted = rewards[2] ?? rewards.pendingRoastedBEAN ?? BigInt(0);
        let uncheckpointedRound = Number(rewards[3] ?? rewards.uncheckpointedRound ?? 0);

        if (uncheckpointedRound > 0) {
          const info = await GridMining.getCurrentRoundInfo();
          const currentRoundId = Number(info.roundId ?? info[0]);
          for (let r = uncheckpointedRound; r <= currentRoundId; r++) {
            const miner = await GridMining.getMinerInfo(r, address);
            const amountPerBlock = miner.amountPerBlock ?? miner[1];
            const checkpointed = miner.checkpointed ?? miner[2];
            if (amountPerBlock > 0n && !checkpointed) {
              uncheckpointedRound = r;
              break;
            }
          }
        }

        result.gridMining.userRewards = {
          pendingETH: pendingETH.toString(),
          pendingETHFormatted: formatEth(pendingETH),
          pendingUnroasted: pendingUnroasted.toString(),
          pendingRoasted: pendingRoasted.toString(),
          uncheckpointedRound,
        };

        const currentRoundId = result.gridMining?.currentRoundId ?? 0;
        const roundsToFetch = [
          uncheckpointedRound,
          uncheckpointedRound + 1,
          Math.max(1, currentRoundId - 1),
          currentRoundId,
        ].filter((r, i, arr) => r > 0 && arr.indexOf(r) === i);

        result.gridMining.minerInfo = {};
        for (const r of roundsToFetch) {
          try {
            const miner = await GridMining.getMinerInfo(r, address);
            result.gridMining.minerInfo[r] = {
              deployedMask: miner.deployedMask?.toString?.() ?? miner[0]?.toString?.(),
              amountPerBlock: miner.amountPerBlock?.toString?.() ?? miner[1]?.toString?.(),
              checkpointed: miner.checkpointed ?? miner[2],
            };
          } catch {
            result.gridMining.minerInfo[r] = { error: 'fetch failed' };
          }
        }

        const u = BigInt(result.gridMining.userRewards.pendingUnroasted || 0);
        const r = BigInt(result.gridMining.userRewards.pendingRoasted || 0);
        const gross = u + r;
        const fee = u / 10n;
        const net = gross - fee;
        result.rewards = {
          pendingETH: result.gridMining.userRewards.pendingETH,
          pendingETHFormatted: result.gridMining.userRewards.pendingETHFormatted,
          pendingBEAN: {
            unroasted: result.gridMining.userRewards.pendingUnroasted,
            roasted: result.gridMining.userRewards.pendingRoasted,
            unroastedFormatted: formatEth(u),
            roastedFormatted: formatEth(r),
            gross: gross.toString(),
            grossFormatted: formatEth(gross),
            fee: fee.toString(),
            feeFormatted: formatEth(fee),
            net: net.toString(),
            netFormatted: formatEth(net),
          },
          uncheckpointedRound: result.gridMining.userRewards.uncheckpointedRound,
        };
      } catch (e) {
        result.rewards = { error: e.message };
      }

      try {
        const executorAddr = await AutoMiner.executor();
        const activeUsers = await AutoMiner.getActiveUsers(0, 100);
        const userAddrs = Array.isArray(activeUsers) ? activeUsers : (activeUsers?.users ?? activeUsers ?? []);
        const userInActiveList = userAddrs.some((a) => a && a.toLowerCase() === address);

        const state = await AutoMiner.getUserState(address);
        const config = state.config ?? state[0];
        const lastRoundPlayed = Number(state.lastRound ?? state[1] ?? 0);
        // AutoConfig: 0 strategyId, 1 numBlocks, 2 active, 3 executorFeeBps, 4 selectedBlockMask,
        // 5 amountPerBlock, 6 numRounds, 7 roundsExecuted, ... (see AutoMiner.sol)
        const strategyId = Number(config?.strategyId ?? config?.[0] ?? 0);
        const numBlocks = Number(config?.numBlocks ?? config?.[1] ?? 0);
        const numRounds = Number(config?.numRounds ?? config?.[6] ?? 0);
        const roundsExecuted = Number(config?.roundsExecuted ?? config?.[7] ?? 0);
        const active = Boolean(config?.active ?? config?.[2] ?? false);

        result.autoMiner = {
          executorAddress: executorAddr,
          activeUserCount: userAddrs.filter((a) => a && a !== '0x0000000000000000000000000000000000000000').length,
          userInActiveList,
          lastRoundPlayed,
          userState: {
            strategyId,
            numBlocks,
            numRounds,
            roundsExecuted,
            active,
          },
        };
      } catch (e) {
        result.autoMiner = { error: e.message };
      }
    }

    // ─── Diagnostic ─────────────────────────────────────────────────────
    result.diagnostic = await getDiagnostic();

    // ─── Backend status (AutoReset, AutoMinerExecutor) ─────────────────────
    const servicesConfig = {
      resetWalletConfigured: Boolean(process.env.RESET_WALLET_PRIVATE_KEY),
      autoResetEnabled: process.env.AUTO_RESET_ENABLED !== 'false',
      executorConfigured: Boolean(process.env.EXECUTOR_PRIVATE_KEY),
      autoMinerExecutorEnabled: process.env.AUTO_MINER_EXECUTOR_ENABLED !== 'false',
    };

    let autoResetPayload;
    try {
      autoResetPayload = require('../lib/autoReset').getStatus?.() ?? null;
    } catch (e) {
      autoResetPayload = { loadError: e?.message || String(e) };
    }

    let autoMinerExecutorPayload;
    try {
      autoMinerExecutorPayload = require('../lib/autoMinerExecutor').getStatus?.() ?? null;
    } catch (e) {
      autoMinerExecutorPayload = { loadError: e?.message || String(e) };
    }

    result.backendStatus = {
      servicesConfig,
      autoReset: autoResetPayload,
      autoMinerExecutor: autoMinerExecutorPayload,
    };

    res.json(result);
  } catch (err) {
    console.error('[Debug] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
