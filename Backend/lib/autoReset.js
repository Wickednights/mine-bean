/**
 * Auto-reset service: calls GridMining.reset() when a round has ended.
 * Rounds settle automatically (VRF or instant for empty rounds) — no manual Reset button needed.
 *
 * Requires: RESET_WALLET_PRIVATE_KEY in .env (wallet must hold BNB for gas)
 * Disable: omit RESET_WALLET_PRIVATE_KEY or set AUTO_RESET_ENABLED=false
 */

const { ethers } = require('ethers');
const { getProvider, ADDRESSES } = require('./contracts');
const GridMiningABI = require('../abis/GridMining.json');

const POLL_INTERVAL_MS = parseInt(process.env.AUTO_RESET_POLL_INTERVAL_MS || '12000', 10) || 12000;

let started = false;

async function startAutoReset() {
  const privateKey = process.env.RESET_WALLET_PRIVATE_KEY;
  if (!privateKey || process.env.AUTO_RESET_ENABLED === 'false') {
    if (!privateKey) {
      console.log('[AutoReset] RESET_WALLET_PRIVATE_KEY not set — auto-reset disabled');
    } else {
      console.log('[AutoReset] AUTO_RESET_ENABLED=false — auto-reset disabled');
    }
    return;
  }

  if (started) return;
  started = true;

  const provider = getProvider();
  const wallet = new ethers.Wallet(privateKey, provider);
  const GridMining = new ethers.Contract(ADDRESSES.GridMining, GridMiningABI, wallet);

  let lastResetRound = 0;

  async function tryReset() {
    try {
      const info = await GridMining.getCurrentRoundInfo();
      const roundId = Number(info.roundId ?? info[0]);
      const timeRemaining = Number(info.timeRemaining ?? info[4]);
      const round = await GridMining.getRound(roundId);
      const settled = round?.settled ?? round[8];

      if (settled) return;
      if (timeRemaining > 0) return;

      // Round ended and not settled — call reset
      if (roundId <= lastResetRound) return;
      lastResetRound = roundId;

      const tx = await GridMining.reset();
      console.log(`[AutoReset] Round ${roundId} ended — reset tx: ${tx.hash}`);
      await tx.wait();
      console.log(`[AutoReset] Round ${roundId} reset confirmed`);
    } catch (err) {
      const msg = err.message || String(err);
      if (msg.includes('RoundNotEnded') || msg.includes('RoundAlreadySettled') || msg.includes('VRFAlreadyRequested')) {
        // Expected — no action needed
      } else {
        console.error('[AutoReset] Error:', msg);
      }
    }
  }

  setInterval(tryReset, POLL_INTERVAL_MS);
  console.log(`[AutoReset] Running (poll every ${POLL_INTERVAL_MS}ms). Fund ${wallet.address} with BNB for gas.`);
}

module.exports = { startAutoReset };
