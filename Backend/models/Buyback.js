const mongoose = require('mongoose');

const buybackSchema = new mongoose.Schema({
  ethSpent: { type: String, required: true },
  ethSpentFormatted: { type: String },
  beanReceived: { type: String, required: true },
  beanReceivedFormatted: { type: String },
  beanBurned: { type: String, required: true },
  beanBurnedFormatted: { type: String },
  beanToStakers: { type: String, required: true },
  beanToStakersFormatted: { type: String },
  txHash: { type: String, required: true, unique: true },
  blockNumber: { type: Number },
  timestamp: { type: Date, required: true },
}, { timestamps: true });

buybackSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Buyback', buybackSchema);
