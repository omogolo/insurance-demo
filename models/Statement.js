const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  type: {
    type: String,
    required: true,
    enum: ['Premium Paid', 'Premium Due', 'Claim Filed', 'Claim Settled', 'Refund', 'Adjustment', 'Penalty']
  },
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  runningBalance: { type: Number, required: true },
  referenceId: String
}, { _id: false });

const statementSchema = new mongoose.Schema({
  statementId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  policyId: {
    type: String,
    required: true,
    index: true
    // No ref — String IDs, not ObjectIds
  },
  customerId: {
    type: String,
    required: true,
    index: true
    // No ref — String IDs, not ObjectIds
  },
  period: {
    from: { type: Date, required: true },
    to: { type: Date, required: true }
  },
  transactions: [transactionSchema],
  summary: {
    totalPremiumPaid: { type: Number, default: 0 },
    totalClaimsSettled: { type: Number, default: 0 },
    totalRefunds: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 }
  },
  generatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.model('Statement', statementSchema);
