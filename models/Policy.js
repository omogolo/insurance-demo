const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
  policyId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  customerId: {
    type: String,
    required: true,
    index: true
    // NOTE: Intentionally NOT using ref: 'Customer' with ObjectId.
    // Both schemas use String IDs (e.g., 'CUS-0001'), not MongoDB ObjectIds.
    // Use manual lookups instead of .populate().
  },
  type: {
    type: String,
    required: true,
    enum: ['Life', 'Vehicle', 'Health', 'Property']
  },
  status: {
    type: String,
    required: true,
    enum: ['Active', 'Pending', 'Lapsed', 'Claimed', 'Matured', 'Cancelled'],
    default: 'Active'
  },
  currency: {
    type: String,
    default: 'BWP',
    enum: ['BWP']
  },
  premium: {
    amount: { type: Number, required: true, min: 0 },
    frequency: {
      type: String,
      required: true,
      enum: ['Monthly', 'Quarterly', 'Yearly']
    },
    nextDue: { type: Date }
  },
  coverage: {
    sumInsured: { type: Number, required: true, min: 0 },
    // Life-specific
    nominee: { type: String },
    termYears: { type: Number },
    maturityBenefit: { type: Number },
    // Vehicle-specific
    make: { type: String },
    model: { type: String },
    year: { type: Number },
    registrationNo: { type: String },
    engineNo: { type: String },
    // Health-specific
    networkType: { type: String, enum: ['Cashless', 'Reimbursement'] },
    preExisting: { type: Boolean, default: false },
    roomRentLimit: { type: Number },
    // Property-specific
    propertyType: { type: String },
    areaSqFt: { type: Number },
    constructionType: { type: String },
    locationRisk: { type: String, enum: ['Low', 'Medium', 'High'] }
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  claims: [{
    claimId: { type: String },
    status: {
      type: String,
      enum: ['Filed', 'Under Review', 'Approved', 'Settled', 'Rejected']
    },
    filedDate: { type: Date },
    amount: { type: Number },
    description: { type: String }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Policy', policySchema);
