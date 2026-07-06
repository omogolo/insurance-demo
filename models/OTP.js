const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    ref: 'Customer',
    index: true
  },
  otp: {
    type: String,
    required: true,
    match: /^\d{5}$/
  },
  purpose: {
    type: String,
    required: true,
    enum: ['statement_retrieval', 'policy_details', 'claim_info', 'sensitive_update']
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  used: {
    type: Boolean,
    default: false,
    index: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Auto-expire index (TTL) — MongoDB cleans up after 2 hours
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7200 });

module.exports = mongoose.model('OTP', otpSchema);