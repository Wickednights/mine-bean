const mongoose = require('mongoose');

const roundSchema = new mongoose.Schema({
  roundId: { type: Number, required: true, unique: true, index: true },
  startTime: { type: Number, required: true },
  endTime: { type: Number, required: true },
  totalDeployed: { type: String, default: '0' },
  beanpotPool: { type: String, default: '0' },
  settled: { type: Boolean, default: false, index: true },
  winningBlock: { type: Number },
  topMiner: { type: String },
  topMinerReward: { type: String, default: '0' },
  topMinerSeed: { type: String, default: '0' },
  winnersDeployed: { type: String, default: '0' },
  totalWinnings: { type: String, default: '0' },
  vaultedAmount: { type: String, default: '0' },
  beanpotAmount: { type: String, default: '0' },
  beanWinner: { type: String },
  isSplit: { type: Boolean, default: false },
  winnerCount: { type: Number, default: 0 },
  txHash: { type: String },
  settledAt: { type: Date },
  blocks: [{
    id: { type: Number },
    deployed: { type: String, default: '0' },
    minerCount: { type: Number, default: 0 },
  }],
}, { timestamps: true });

roundSchema.index({ settled: 1, roundId: -1 });
roundSchema.index({ beanpotAmount: 1, settled: 1 });

module.exports = mongoose.model('Round', roundSchema);
