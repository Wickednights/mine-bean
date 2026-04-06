/**
 * Lightweight snapshot updated by the indexer poll loop for /api/diagnostics.
 * Safe to require from routes without starting the indexer.
 */

const snapshot = {
  running: false,
  pollIntervalMs: null,
  lastHeartbeatAt: null,
  lastChainHead: 0,
  lastProcessedToBlock: 0,
  lastLogsFromBlock: 0,
  lastLogsToBlock: 0,
  lastLogCount: 0,
  lastPollError: null,
};

function markStarted(pollIntervalMs) {
  snapshot.running = true;
  snapshot.pollIntervalMs = pollIntervalMs ?? null;
}

function touchHeartbeat(chainHead) {
  snapshot.lastHeartbeatAt = new Date().toISOString();
  snapshot.lastChainHead = Number(chainHead);
}

function touchLogsProgress(fromBlock, toBlock, logCount) {
  snapshot.lastLogsFromBlock = Number(fromBlock);
  snapshot.lastLogsToBlock = Number(toBlock);
  snapshot.lastLogCount = Number(logCount);
  if (Number.isFinite(toBlock)) snapshot.lastProcessedToBlock = Number(toBlock);
}

function recordPollError(msg) {
  snapshot.lastPollError = typeof msg === 'string' ? msg : String(msg);
}

function getSnapshot() {
  return { ...snapshot };
}

module.exports = {
  snapshot,
  markStarted,
  touchHeartbeat,
  touchLogsProgress,
  recordPollError,
  getSnapshot,
};
