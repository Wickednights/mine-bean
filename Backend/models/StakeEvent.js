const mongoose = require('mongoose');

const stakeEventSchema = new mongoose.Schema({
  user: { type: String, required: true, index: true },
  type: { type: String, enum: ['deposit', 'withdraw', 'claim', 'compound'], required: true },
  amount: { type: String, required: true },
  amountFormatted: { type: String },
  txHash: { type: String },
  blockNumber: { type: Number },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

stakeEventSchema.index({ user: 1, timestamp: -1 });

module.exports = mongoose.model('StakeEvent', stakeEventSchema);
