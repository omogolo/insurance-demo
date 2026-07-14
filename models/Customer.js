const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    index: true,
    match: /^\+?267\d{8}$/
  },
  email: {
    type: String,
    required: false,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String }
  },
  occupation: {
    type: String,
    trim: true
  },
  session: {
    action: {
      type: String,
      default: null
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Customer', customerSchema);
