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
  var expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await OTP.deleteMany({ customerId: customerId, used: false });
  await OTP.create({ customerId: customerId, otp: otp, purpose: purpose, expiresAt: expiresAt });
  return otp;
}

// ─── Command Handler ───────────────────────────────────────────────────────────

async function handleTextCommand(parsed) {
  var text = parsed.text;
  var customer = await findCustomer(parsed.phone);

  if (!customer) {
    return {
      action: 'reply',
      type: 'text',
      message: 'Sorry, we could not find an account for ' + parsed.phone + '. Please contact support.',
      customerFound: false
    };
  }

  var base = {
    action: 'reply',
    customerFound: true,
    customerName: customer.name,
    customerId: customer._id
  };

  switch (text) {
    case 'hi':
    case 'hello':
    case 'menu':
    case '1':
      return {
        action: 'reply',
        customerFound: true,
        customerName: customer.name,
        customerId: customer._id,
        type: 'menu',
        message: 'Hello ' + customer.name + '! How can I help you today?\n\n1. View My Policies\n2. Policy Details\n3. Make a Claim\n4. Speak to an Agent\n\nReply with a number or keyword.'
      };

    case 'policies':
    case 'view policies':
    case 'my policies':
    case '2':
      var otp = await createOTP(customer._id.toString(), 'policy_details');
      try {
        await sendSMS(
          parsed.phone,
          'Your InsureBot verification code is: ' + otp + '. Valid for 5 minutes.'
        );
        return {
          action: 'reply',
          customerFound: true,
          customerName: customer.name,
          customerId: customer._id,
          type: 'otp_sent',
          message: 'Verification code sent to ' + parsed.phone + '. Reply with the 5-digit code.',
          otpSent: true
        };
      } catch (smsError) {
        console.error('[SMS] Failed:', smsError.message);
        return {
          action: 'reply',
          customerFound: true,
          customerName: customer.name,
          customerId: customer._id,
          type: 'error',
          message: 'Could not send verification code. Please try again later.'
        };
      }

    default:
      if (/^\d{5}$/.test(text)) {
        var otpRecord = await OTP.findOne({
          customerId: customer._id,
          otp: text,
          used: false,
          expiresAt: { $gt: new Date() }
        });

        if (!otpRecord) {
          return {
            action: 'reply',
            customerFound: true,
            customerName: customer.name,
            customerId: customer._id,
            type: 'otp_invalid',
            message: 'Invalid or expired code. Reply "policies" to request a new one.'
          };
        }

        await OTP.updateOne(
          { _id: otpRecord._id },
          { $set: { used: true }, $inc: { attempts: 1 } }
        );

        if (otpRecord.purpose === 'policy_details') {
          var policies = await Policy.find({ customer: customer._id });

          if (policies.length === 0) {
            return {
              action: 'reply',
              customerFound: true,
              customerName: customer.name,
              customerId: customer._id,
              type: 'policy_list',
              message: 'You have no active policies on record.',
              policyCount: 0
            };
          }

          var policyLines = policies.map(function (p, i) {
            return (i + 1) + '. ' + p.policyNumber + ' - ' + p.type + ' (' + p.status + ')';
          }).join('\n');

          return {
            action: 'reply',
            customerFound: true,
            customerName: customer.name,
            customerId: customer._id,
            type: 'policy_list',
            message: 'Your policies:\n\n' + policyLines + '\n\nReply with a policy number for details.',
            policyCount: policies.length,
            policies: policies.map(function (p) {
              return {
                number: p.policyNumber,
                type: p.type,
                status: p.status,
                premium: p.premium
              };
            })
          };
        }

        return {
          action: 'reply',
          customerFound: true,
          customerName: customer.name,
          customerId: customer._id,
          type: 'otp_verified',
          message: 'Verified successfully.'
        };
      }

      return {
        action: 'reply',
        customerFound: true,
        customerName: customer.name,
        customerId: customer._id,
        type: 'fallback',
        message: 'I didn\'t understand "' + text + '". Reply "menu" to see options.'
      };
  }
}

// ─── Webhook Endpoint ──────────────────────────────────────────────────────────

router.post('/respondio', async function (req, res) {
  var timestamp = new Date().toISOString();
  console.log('[' + timestamp + '] POST /webhooks/respondio');

  try {
    var parsed = parseRespondioPayload(req.body);
    console.log('[Webhook] Phone: ' + (parsed.phone || 'NOT FOUND') + ' | Text: ' + (parsed.text || 'NOT FOUND') + ' | Event: ' + parsed.eventType);

    var validation = validatePayload(parsed);
    if (!validation.valid) {
      console.warn('[Webhook] Validation failed:', validation.errors.join(', '));
      return res.status(400).json({
        action: 'error',
        errors: validation.errors,
        message: 'Invalid webhook payload.'
      });
    }

    var messageEvents = ['messageCreated', 'message.sent', 'message.received'];
    if (!messageEvents.includes(parsed.eventType) && parsed.eventType !== 'unknown') {
      console.log('[Webhook] Ignoring event: ' + parsed.eventType);
      return res.status(200).json({ action: 'ignored', eventType: parsed.eventType });
    }

    var result = await handleTextCommand(parsed);
    return res.json(result);
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return res.status(500).json({
      action: 'error',
      message: 'Internal server error.'
    });
  }
});

// ─── Health Check ──────────────────────────────────────────────────────────────

router.get('/health', function (req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
