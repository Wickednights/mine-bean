/**
 * Deep diagnostics for mainnet readiness: RPC, Mongo, indexer heartbeat,
 * env flags, and ABI-driven static calls for every view/pure on core contracts.
 *
 * GET /api/diagnostics?address=0x...&suite=1   — suite=0 skips per-function reads (faster)
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { ethers } = require('ethers');
const { getContracts, getProvider, ADDRESSES } = require('../lib/contracts');
const { runReadSuite } = require('../lib/contractReadSuite');
const indexerStatus = require('../lib/indexerStatus');

function networkMeta() {
  const chainId = parseInt(process.env.CHAIN_ID || '97', 10) || 97;
  const label =
    process.env.NETWORK_LABEL ||
    (chainId === 56 ? 'BSC mainnet' : chainId === 97 ? 'BSC testnet (Chapel)' : `chain ${chainId}`);
  let rpcHost = null;
  try {
    if (process.env.RPC_URL) rpcHost = new URL(process.env.RPC_URL).hostname;
  } catch {
    rpcHost = null;
  }
  return {
    networkLabel: label,
    chainId,
    rpcConfigured: Boolean(process.env.RPC_URL),
    rpcHost,
    nodeEnv: process.env.NODE_ENV || 'development',
    backendUptimeSec: Math.floor(process.uptime()),
  };
}

async function rpcProbe(provider) {
  const t0 = Date.now();
  try {
    const [block, network, feeData, gridBal, treasuryBal, autominerBal] = await Promise.all([
      provider.getBlockNumber(),
      provider.getNetwork(),
      provider.getFeeData().catch(() => null),
      provider.getBalance(ADDRESSES.GridMining).catch(() => null),
      provider.getBalance(ADDRESSES.Treasury).catch(() => null),
      provider.getBalance(ADDRESSES.AutoMiner).catch(() => null),
    ]);
    let latestBlockTs = null;
    try {
      const b = await provider.getBlock(block);
      latestBlockTs = b?.timestamp != null ? Number(b.timestamp) : null;
    } catch {
      /* optional */
    }
    return {
      ok: true,
      latencyMs: Date.now() - t0,
      blockNumber: block,
      chainId: Number(network.chainId),
      latestBlockTimestamp: latestBlockTs,
      nativeBalanceWei: {
        GridMining: gridBal != null ? gridBal.toString() : null,
        Treasury: treasuryBal != null ? treasuryBal.toString() : null,
        AutoMiner: autominerBal != null ? autominerBal.toString() : null,
      },
      feeData: feeData
        ? {
            gasPrice: feeData.gasPrice?.toString?.() ?? null,
            maxFeePerGas: feeData.maxFeePerGas?.toString?.() ?? null,
          }
        : null,
    };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: e.shortMessage || e.message || String(e),
    };
  }
}

async function mongoSnapshot() {
  const names = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const state = mongoose.connection.readyState;
  const base = {
    readyState: state,
    stateLabel: names[state] || 'unknown',
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null,
  };
  if (state !== 1) return { ...base, counts: null };
  try {
    const Round = require('../models/Round');
    const Deployment = require('../models/Deployment');
    const Claim = require('../models/Claim');
    const Buyback = require('../models/Buyback');
    const StakeEvent = require('../models/StakeEvent');
    const [rounds, deployments, claims, buybacks, stakeEvents] = await Promise.all([
      Round.estimatedDocumentCount(),
      Deployment.estimatedDocumentCount(),
      Claim.estimatedDocumentCount(),
      Buyback.estimatedDocumentCount(),
      StakeEvent.estimatedDocumentCount(),
    ]);
    let latestRound = null;
    try {
      latestRound = await Round.findOne().sort({ roundId: -1 }).select('roundId settled endTime').lean();
    } catch {
      latestRound = null;
    }
    return {
      ...base,
      counts: { rounds, deployments, claims, buybacks, stakeEvents },
      latestRoundDoc: latestRound,
    };
  } catch (e) {
    return { ...base, counts: null, countError: e.message };
  }
}

function backendServices() {
  const cfg = {
    resetWalletConfigured: Boolean(process.env.RESET_WALLET_PRIVATE_KEY),
    autoResetEnabled: process.env.AUTO_RESET_ENABLED !== 'false',
    executorConfigured: Boolean(process.env.EXECUTOR_PRIVATE_KEY),
    autoMinerExecutorEnabled: process.env.AUTO_MINER_EXECUTOR_ENABLED !== 'false',
  };
  let autoReset = null;
  let autoMinerExecutor = null;
  try {
    autoReset = require('../lib/autoReset').getStatus?.() ?? null;
  } catch (e) {
    autoReset = { loadError: e.message };
  }
  try {
    autoMinerExecutor = require('../lib/autoMinerExecutor').getStatus?.() ?? null;
  } catch (e) {
    autoMinerExecutor = { loadError: e.message };
  }
  return { servicesConfig: cfg, autoReset, autoMinerExecutor, indexer: indexerStatus.getSnapshot() };
}

router.get('/', async (req, res) => {
  const wantSuite = String(req.query.suite ?? '1') !== '0';
  const addressRaw = (req.query.address || '').trim().toLowerCase();
  let address = null;
  if (addressRaw.startsWith('0x') && addressRaw.length === 42) {
    try {
      address = ethers.getAddress(addressRaw);
    } catch {
      address = null;
    }
  }

  try {
    const provider = getProvider();
    const contracts = getContracts();
    const meta = networkMeta();

    const [rpc, mongo, services] = await Promise.all([rpcProbe(provider), mongoSnapshot(), Promise.resolve(backendServices())]);

    let roundId = 1;
    let prevRoundId = 1;
    try {
      const gm = contracts.GridMining;
      const info = await gm.getCurrentRoundInfo();
      roundId = Number(info.roundId ?? info[0]) || 1;
      prevRoundId = Math.max(1, roundId - 1);
    } catch {
      /* use defaults */
    }

    const out = {
      meta: { ...meta, addresses: { ...ADDRESSES } },
      rpc,
      mongo,
      backend: services,
      contractSuites: null,
      fetchedAt: new Date().toISOString(),
    };

    if (wantSuite) {
      const ctx = {
        userAddress: address,
        roundId,
        prevRoundId,
      };
      const suites = await Promise.all([
        runReadSuite('GridMining', contracts.GridMining, ctx),
        runReadSuite('AutoMiner', contracts.AutoMiner, ctx),
        runReadSuite('Bean', contracts.Bean, ctx),
        runReadSuite('Treasury', contracts.Treasury, ctx),
        runReadSuite('Staking', contracts.Staking, ctx),
      ]);
      const totalCalls = suites.reduce((a, s) => a + s.summary.total, 0);
      const totalOk = suites.reduce((a, s) => a + s.summary.ok, 0);
      out.contractSuites = {
        summary: { contracts: suites.length, totalCalls, totalOk, totalFail: totalCalls - totalOk },
        suites,
      };
    }

    res.json(out);
  } catch (err) {
    console.error('[Diagnostics]', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

module.exports = router;
