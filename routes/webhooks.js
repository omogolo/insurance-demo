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

async function findCustomer(phone) {
  const normalized = normalizePhone(phone);
  let customer = await Customer.findOne({ phone: normalized });
  if (customer) return customer;

  const variants = getPhoneVariants(normalized);
  for (const variant of variants) {
    customer = await Customer.findOne({ phone: variant });
    if (customer) return customer;
  }
  return null;
}

// ─── OTP Helpers ───────────────────────────────────────────────────────────────

function generateOTP() {
  return crypto.randomInt(10000, 99999).toString();
}

async function createOTP(customerId, purpose) {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await OTP.deleteMany({ customerId, used: false });
  await OTP.create({ customerId, otp, purpose, expiresAt });
  return otp;
}

// ─── Command Handler ───────────────────────────────────────────────────────────

async function handleTextCommand(parsed) {
  const { text } = parsed;
  const customer = await findCustomer(parsed.phone);

  if (!customer) {
    return {
      action: 'reply',
      type: 'text',
      message: 'Sorry, we could not find an account for ' + parsed.phone + '. Please contact support.',
      customerFound: false,
    };
  }

  const base = {
    action: 'reply',
    customerFound: true,
    customerName: customer.name,
    customerId: customer._id,
  };

  switch (text) {
    case 'hi':
    case 'hello':
    case 'menu':
    case '1':
      return {
        ...base,
        type: 'menu',
        message: 'Hello ' + customer.name + '! How can I help you today?\n\n1. View My Policies\n2. Policy Details\n3. Make a Claim\n4. Speak to an Agent\n\nReply with a number or keyword.',
      };

    case 'policies':
    case 'view policies':
    case 'my policies':
    case '2': {
      const otp = await createOTP(customer._id.toString(), 'policy_details');
      try {
        await sendSMS(
          parsed.phone,
          'Your InsureBot verification code is: ' + otp + '. Valid for 5 minutes.'
        );
        return {
          ...base,
          type: 'otp_sent',
          message: 'Verification code sent to ' + parsed.phone + '. Reply with the 5-digit code.',
          otpSent: true,
        };
      } catch (smsError) {
        console.error('[SMS] Failed:', smsError.message);
        return {
          ...base,
          type: 'error',
          message: 'Could not send verification code. Please try again later.',
        };
      }
    }

    default:
      // Check if it's a 5-digit OTP
      if (/^\d{5}$/.test(text)) {
        const otpRecord = await OTP.findOne({
          customerId: customer._id,
          otp: text,
          used: false,
          expiresAt: { $gt: new Date() },
        });

        if (!otpRecord) {
          return {
            ...base,
            type: 'otp_invalid',
            message: 'Invalid or expired code. Reply "policies" to request a new one.',
          };
        }

        await OTP.updateOne(
          { _id: otpRecord._id },
          { $set: { used: true }, $inc: { attempts: 1 } }
        );

        if (otpRecord.purpose === 'policy_details') {
          const policies = customer.policies || [];
          if (policies.length === 0) {
            return {
              ...base,
              type: 'policy_list',
              message: 'You have no active policies on record.',
              policyCount: 0,
            };
          }

          const policyLines = policies
            .map(function (p, i) {
              return (i + 1) + '. ' + p.policyNumber + ' - ' + p.type + ' (' + p.status + ')';
            })
            .join('\n');

          return {
            ...base,
            type: 'policy_list',
            message: 'Your policies:\n\n' + policyLines + '\n\nReply with a policy number for details.',
            policyCount: policies.length,
            policies: policies.map(function (p) {
              return {
                number: p.policyNumber,
                type: p.type,
                status: p.status,
                premium: p.premium,
              };
            }),
          };
        }

        return { ...base, type: 'otp_verified', message: 'Verified successfully.' };
      }

      return {
        ...base,
        type: 'fallback',
        message: 'I didn\'t understand "' + text + '". Reply "menu" to see options.',
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
        message: 'Invalid webhook payload.',
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
      message: 'Internal server error.',
    });
  }
});

// ─── Health Check ──────────────────────────────────────────────────────────────

router.get('/health', function (req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
