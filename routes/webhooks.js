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

  let phone = null;
  let text = null;

  // Extract phone: body.contact.phone
  phone = body?.contact?.phone;
  if (phone && !phone.startsWith('+')) {
    phone = '+' + phone;
  }

  // Extract text: body.message.message.text (nested twice)
  text = body?.message?.message?.text;

  // Detect unresolved variables
  if (text && text.startsWith('$')) {
    console.warn('[Webhook] Variable NOT resolved: "' + text + '"');
    text = null;
  }

  const eventType = body?.event_type || body?.event || 'unknown';
  const contactId = body?.contact?.id || null;

  return { phone, text, eventType, contactId };
}

// ─── Validation ────────────────────────────────────────────────────────────────

function validatePayload(parsed) {
  const errors = [];
  if (!parsed.phone) errors.push('Phone number not found');
  if (!parsed.text) errors.push('Message text not found');
  return { valid: errors.length === 0, errors };
}

// ─── Customer Lookup ───────────────────────────────────────────────────────────

async fun
