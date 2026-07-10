const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const Customer = require('../models/Customer');
const Policy = require('../models/Policy');
const OTP = require('../models/OTP');
const { sendSMS } = require('../services/sms');
const { normalizePhone, getPhoneVariants } = require('../utils/phone');

// ─── Payload Parser ────────────────────────────────────────────────────────────

function parseRespondioPayload(body) {
  console.log('[Webhook] Raw payload:', JSON.stringify(body).slice(0, 800));

  var phone = null;
  var text = null;

  phone = body && body.contact && body.contact.phone ? body.contact.phone : null;
  if (phone && !phone.startsWith('+')) {
    phone = '+' + phone;
  }

  text = body && body.message && body.message.message && body.message.message.text ? body.message.message.text : null;

  if (text && text.startsWith('$')) {
    console.warn('[Webhook] Variable NOT resolved: "' + text + '"');
    text = null;
  }

  var eventType = (body && body.event_type) ? body.event_type : ((body && body.event) ? body.event : 'unknown');
  var contactId = (body && body.contact && body.contact.id) ? body.contact.id : null;

  return { phone: phone, text: text, eventType: eventType, contactId: contactId };
}

// ─── Validation ────────────────────────────────────────────────────────────────

function validatePayload(parsed) {
  var errors = [];
  if (!parsed.phone) { errors.push('Phone number not found'); }
  if (!parsed.text) { errors.push('Message text not found'); }
  return { valid: errors.length === 0, errors: errors };
}

// ─── Customer Lookup ───────────────────────────────────────────────────────────

async function findCustomer(phone) {
  var normalized = normalizePhone(phone);
  var customer = await Customer.findOne({ phone: normalized });
  if (customer) { return customer; }

  var variants = getPhoneVariants(normalized);
  for (var i = 0; i < variants.length; i++) {
    customer = await Customer.findOne({ phone: variants[i] });
    if (customer) { return customer; }
  }
  return null;
}

// ─── OTP Helpers ───────────────────────────────────────────────────────────────

function generateOTP() {
  return crypto.randomInt(10000, 99999).toString();
}

async function createOTP(customerId, purpose) {
  var otp = generateOTP();
  var expiresAt = new Date(Date.now()
