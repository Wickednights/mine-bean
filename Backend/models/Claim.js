const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema({
  user: { type: String, required: true, index: true },
  type: { type: String, enum: ['eth', 'bean'], required: true },
  amount: { type: String, required: true },
  gross: { type: String },
  fee: { type: String },
  net: { type: String },
  txHash: { type: String },
  blockNumber: { type: Number },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

claimSchema.index({ user: 1, timestamp: -1 });

module.exports = mongoose.model('Claim', claimSchema);
