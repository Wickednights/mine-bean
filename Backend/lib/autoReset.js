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

const POLL_INTERVAL_MS = parseInt(process.env.AUTO_RESET_POLL_INTERVAL_MS || '8000', 10) || 8000;

let started = false;

function isExpectedResetError(err) {
  const msg = err?.message || String(err);
  return (
    msg.includes('RoundNotEnded') ||
    msg.includes('RoundAlreadySettled') ||
    msg.includes('VRFAlreadyRequested') ||
    msg.includes('VRFNotConfigured')
  );
}

// When reset fails, round may have been settled by VRF callback (race) — advance to avoid retry loop
function shouldAdvanceOnResetError(err) {
  const msg = err?.message || String(err);
  return msg.includes('RoundAlreadySettled') || msg.includes('VRFAlreadyRequested');
}

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

      const tx = await GridMining.reset();
      console.log(`[AutoReset] Round ${roundId} ended — reset tx: ${tx.hash}`);
      await tx.wait();
      lastResetRound = roundId; // only advance after successful confirmation
      console.log(`[AutoReset] Round ${roundId} reset confirmed`);
    } catch (err) {
      const msg = err.message || String(err);
      if (isExpectedResetError(err)) {
        if (shouldAdvanceOnResetError(err)) {
          lastResetRound = roundId; // round settled by race or VRF pending — don't retry
        }
      } else {
        console.error('[AutoReset] Error:', msg);
      }
    }
  }

  setInterval(tryReset, POLL_INTERVAL_MS);
  console.log(`[AutoReset] Running (poll every ${POLL_INTERVAL_MS}ms). Fund ${wallet.address} with BNB for gas.`);
}

module.exports = { startAutoReset };
