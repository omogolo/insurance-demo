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
    // Accepts international format: +267XXXXXXXX or 267XXXXXXXX
    match: /^\+?267\d{8}$/
  },
  email: {
    type: String,
    required: false,  // ← FIX: Not all WhatsApp users have email
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
    state: { type: String, required: true },  // Botswana: district
    pincode: { type: String }
  },
  occupation: {
    type: String,
    trim: true
  } 
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
  timestamps: true  // ← FIX: adds createdAt/updatedAt
});

module.exports = mongoose.model('Customer', customerSchema);
