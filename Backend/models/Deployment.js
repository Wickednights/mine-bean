const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema({
  roundId: { type: Number, required: true, index: true },
  user: { type: String, required: true, index: true },
  amountPerBlock: { type: String, required: true },
  totalAmount: { type: String, required: true },
  blockMask: { type: Number, required: true },
  blockIds: [{ type: Number }],
  isAutoMine: { type: Boolean, default: false },
  txHash: { type: String },
  blockNumber: { type: Number },
  logIndex: { type: Number },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

deploymentSchema.index({ roundId: 1, user: 1 });
deploymentSchema.index({ user: 1, roundId: -1 });
deploymentSchema.index({ roundId: 1, blockNumber: 1, logIndex: 1 });

module.exports = mongoose.model('Deployment', deploymentSchema);
