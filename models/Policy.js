const mongoose = require('mongoose');

/* Coverage details vary by policy type.
   Life: nominee, termYears, maturityBenefit
   Vehicle: make, model, year, registrationNo, engineNo
   Health: networkType, preExisting, roomRentLimit
   Property: propertyType, areaSqFt, constructionType, locationRisk
*/

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
    ref: 'Customer',
    index: true
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
  premium: {
    amount: { type: Number, required: true, min: 0 },
    frequency: {
      type: String,
      required: true,
      enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'],
      default: 'Yearly'
    },
    currency: { type: String, default: 'INR' }
  },
  sumInsured: {
    type: Number,
    required: true,
    min: 0
  },
  coverageDetails: {
    // Life
    nominee: String,
    nomineeRelation: String,
    termYears: Number,
    maturityBenefit: Number,
    // Vehicle
    make: String,
    model: String,
    year: Number,
    registrationNo: String,
    engineNo: String,
    // Health
    networkType: { type: String, enum: ['Cashless', 'Reimbursement'] },
    preExistingDiseases: [String],
    roomRentLimit: String,
    deductible: Number,
    // Property
    propertyType: String,
    areaSqFt: Number,
    constructionType: String,
    locationRisk: { type: String, enum: ['Low', 'Medium', 'High'] }
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  nextPremiumDue: {
    type: Date
  },
  claims: [{
    claimId: String,
    filedDate: Date,
    amount: Number,
    status: {
      type: String,
      enum: ['Filed', 'Under Review', 'Approved', 'Rejected', 'Settled']
    },
    description: String,
    settledDate: Date,
    settledAmount: Number
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for finding due premiums
policySchema.index({ nextPremiumDue: 1, status: 1 });

module.exports = mongoose.model('Policy', policySchema);