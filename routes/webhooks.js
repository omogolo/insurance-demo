// routes/webhooks.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const Customer = require('../models/Customer');
const Policy = require('../models/Policy');
const OTP = require('../models/OTP');
const { sendSMS } = require('../services/sms');
const { normalizePhone, getPhoneVariants } = require('../utils/phone');

// ─── Respond.io Native Payload Parser ──────────────────────────────────────────
// Respond.io sends its default webhook payload with this general structure:
//   { event: "messageCreated", data: { message: {...}, contact: {...}, channel: {...} } }
//
// This helper extracts the two fields we need: phone and text.
// It tries multiple known formats and logs the raw payload for debugging.

function parseRespondioPayload(body) {
  // ── 1. Log raw payload for debugging (first 500 chars to keep logs readable) ──
  console.log('[Webhook] Raw payload:', JSON.stringify(body).slice(0, 500));

  let phone = null;
  let text = null;

  // ── 2. Extract phone ──────────────────────────────────────────────────────
  // Try multiple paths where Respond.io may place the phone number
  const phonePaths = [
    // Native format: data.contact.phones[0].phone
    () => body?.data?.contact?.phones?.[0]?.phone,
    // Native format: data.contact.phone (some versions)
    () => body?.data?.contact?.phone,
    // Shortcut: contact.phones[0].phone
    () => body?.contact?.phones?.[0]?.phone,
    // Shortcut: contact.phone
    () => body?.contact?.phone,
    // Array of phone strings: contact.phones (string array)
    () => {
      const phones = body?.data?.contact?.phones || body?.contact?.phones;
      if (Array.isArray(phones) && typeof phones[0] === 'string') return phones[0];
      return null;
    },
  ];

  for (const fn of phonePaths) {
    const val = fn();
    if (val) {
      phone = val.trim();
      break;
    }
  }

  // ── 3. Extract message text ───────────────────────────────────────────────
  const textPaths = [
    // Native: data.message.payload.text
    () => body?.data?.message?.payload?.text,
    // Native: data.message.text
    () => body?.data?.message?.text,
    // Native: data.message.content (some versions)
    () => body?.data?.message?.content,
    // Shortcut: message.payload.text
    () => body?.message?.payload?.text,
    // Shortcut: message.text
    () => body?.message?.text,
  ];

  for (const fn of textPaths) {
    const val = fn();
    if (val && typeof val === 'string') {
      text = val.trim().toLowerCase();
      break;
    }
  }

  // ── 4. Extract event type ─────────────────────────────────────────────────
  const eventType = body?.event || body?.event_type || 'unknown';

  // ── 5. Extract contact ID ─────────────────────────────────────────────────
  const contactId =
    body?.data?.contact?.id ||
    body?.contact?.id ||
    body?.contactId ||
    null;

  return { phone, text, eventType, contactId };
}

// ─── Input Validation ────────────────────────────────────────────────────────

function validatePayload(parsed) {
  const errors = [];

  if (!parsed.phone) {
    errors.push('Phone number not found in webhook payload');
  } else if (!/^\+?\d{8,15}$/.test(parsed.phone.replace(/\s/g, ''))) {
    errors.push(`Invalid phone format: ${parsed.phone}`);
  }

  if (!parsed.text) {
    errors.push('Message text not found in webhook payload');
  }

  if (!parsed.eventType) {
    errors.push('Event type missing from payload');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Customer Lookup ──────────────────────────────────────────────────────────

async function findCustomer(phone) {
  const normalized = normalizePhone(phone);

  // Try exact match first
  let customer = await Customer.findOne({ phone: normalized }).populate('policies');
  if (customer) return customer;

  // Try all phone variants (e.g., with/without +267, with/without leading 0)
  const variants = getPhoneVariants(normalized);
  for (const variant of variants) {
    customer = await Customer.findOne({ phone: variant }).populate('policies');
    if (customer) return customer;
  }

  return null;
}

// ─── OTP Generation ───────────────────────────────────────────────────────────

function generateOTP() {
  return crypto.randomInt(10000, 99999).toString();
}

async function createOTP(customerId, purpose) {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await OTP.deleteMany({ customerId, used: false }); // Clear any existing active OTP
  await OTP.create({ customerId, otp, purpose, expiresAt });

  return otp;
}

// ─── Response Mapping Helpers ─────────────────────────────────────────────────
// v2.0 Architecture: Server returns JSON, Respond.io maps it to reply templates.
// All responses follow this structure for Response Mapping.

function response(action, data = {}) {
  return res => res.json({ action, ...data });
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

// Handle text message commands
async function handleTextCommand(parsed) {
  const { text } = parsed;
  const customer = await findCustomer(parsed.phone);

  // Unknown contact
  if (!customer) {
    return {
      action: 'reply',
      type: 'text',
      message: `Sorry, we could not find an account associated with ${parsed.phone}. Please contact support.`,
      customerFound: false,
    };
  }

  const customerData = {
    action: 'reply',
    customerFound: true,
    customerName: customer.name,
    customerId: customer._id,
  };

  // Route based on message text
  switch (text) {
    // ── Main Menu ──────────────────────────────────────────────────────────
    case 'hi':
    case 'hello':
    case 'menu':
    case '1':
      return {
        ...customerData,
        type: 'menu',
        message: `Hello ${customer.name}! 👋\n\nHow can I help you today?\n\n1️⃣ View My Policies\n2️⃣ Policy Details\n3️⃣ Make a Claim\n4️⃣ Speak to an Agent\n\nReply with a number or keyword.`,
      };

    // ── View Policies (requires OTP) ──────────────────────────────────────
    case 'policies':
    case 'view policies':
    case 'my policies':
    case '2': {
      const otp = await createOTP(customer._id.toString(), 'policy_details');
      try {
        await sendSMS(
          parsed.phone,
          `Your InsureBot verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`
        );
        return {
          ...customerData,
          type: 'otp_sent',
          message: `We've sent a 5-digit verification code to ${parsed.phone}. Please reply with the code to view your policies.`,
          otpSent: true,
        };
      } catch (smsError) {
        console.error('[SMS] Failed to send OTP:', smsError.message);
        return {
          ...customerData,
          type: 'error',
          message: 'We could not send your verification code at this time. Please try again later.',
        };
      }
    }

    // ── OTP Verification ──────────────────────────────────────────────────
    default:
      if (/^\d{5}$/.test(text)) {
        // User sent a 5-digit code — verify OTP
        const otpRecord = await OTP.findOne({
          customerId: customer._id,
          otp: text,
          used: false,
          expiresAt: { $gt: new Date() },
        });

        if (!otpRecord) {
          return {
            ...customerData,
            type: 'otp_invalid',
            message: 'Invalid or expired code. Please request a new one by replying "policies".',
            attempts: (otpRecord?.attempts || 0) + 1,
          };
        }

        // Mark OTP as used
        await OTP.updateOne(
          { _id: otpRecord._id },
          { $set: { used: true }, $inc: { attempts: 1 } }
        );

        // Return policy list based on OTP purpose
        if (otpRecord.purpose === 'policy_details') {
          const policies = customer.policies || [];
          if (policies.length === 0) {
            return {
              ...customerData,
              type: 'policy_list',
              message: `You have no active policies on record. Contact us for assistance.`,
              policyCount: 0,
            };
          }

          const policyLines = policies
            .map((p, i) => `${i + 1}. ${p.policyNumber} — ${p.type} (${p.status})`)
            .join('\n');

          return {
            ...customerData,
            type: 'policy_list',
            message: `Here are your policies:\n\n${policyLines}\n\nReply with a policy number for details.`,
            policyCount: policies.length,
            policies: policies.map(p => ({
              number: p.policyNumber,
              type: p.type,
              status: p.status,
              premium: p.premium,
              currency: p.currency,
            })),
          };
        }

        return {
          ...customerData,
          type: 'otp_verified',
          message: 'Verified successfully.',
        };
      }

      // Unrecognized command
      return {
        ...customerData,
        type: 'fallback',
        message: `I didn't understand "${text}". Reply "menu" to see available options.`,
      };
  }
}

// ─── Main Webhook Endpoint ────────────────────────────────────────────────────

router.post('/respondio', async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] POST /webhooks/respondio`);
  console.log('[Webhook] POST /webhooks/respondio');

  try {
    // Parse the native Respond.io payload
    const parsed = parseRespondioPayload(req.body);
    console.log(`[Webhook] Phone: ${parsed.phone || 'NOT FOUND'} | Text: ${parsed.text || 'NOT FOUND'} | Event: ${parsed.eventType}`);

    // Validate essential fields
    const validation = validatePayload(parsed);
    if (!validation.valid) {
      console.warn('[Webhook] Validation failed:', validation.errors.join(', '));
      return res.status(400).json({
        action: 'error',
        errors: validation.errors,
        message: 'Invalid webhook payload.',
      });
    }

    // Only process message events
    const messageEvents = ['messageCreated', 'message.sent', 'message.received'];
    if (!messageEvents.includes(parsed.eventType) && parsed.eventType !== 'unknown') {
      console.log(`[Webhook] Ignoring event type: ${parsed.eventType}`);
      return res.status(200).json({ action: 'ignored', eventType: parsed.eventType });
    }

    // Handle the command
    const result = await handleTextCommand(parsed);
    return res.json(result);

  } catch (error) {
    console.error('[Webhook] Unhandled error:', error);
    return res.status(500).json({
      action: 'error',
      message: 'Internal server error.',
    });
  }
});

// ─── Health Check ─────────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
