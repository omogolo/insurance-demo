const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Policy = require('../models/Policy');
const Statement = require('../models/Statement');
const { createOTP, validateOTP } = require('../services/otp');
const { sendSMS } = require('../services/sms');
const {
  normalizePhone,
  getPhoneVariants,
  policySummaryLine,
  buildStatementMessage,
  formatCurrency,
  formatDate,
  truncateForWhatsApp
} = require('../utils/helpers');

// ─── In-memory session state ──────────────────────────────────────────
// NOTE: This is acceptable for a demo with <50 concurrent users.
// For production, replace with MongoDB-backed sessions or Redis.
const sessions = new Map();

function getSession(phone) { return sessions.get(phone); }

function setSession(phone, state, data = {}, ttlMinutes = 10) {
  sessions.set(phone, {
    state,
    data,
    expiresAt: Date.now() + ttlMinutes * 60 * 1000
  });
}

function clearSession(phone) { sessions.delete(phone); }

// Clean expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [phone, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(phone);
  }
}, 5 * 60 * 1000).unref(); // .unref() prevents this from keeping the process alive

// ─── Payload Extraction with Validation ───────────────────────────────
function extractPayload(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Empty or invalid request body' };
  }

  // Support both Respond.io workflow JSON and raw webhook formats
  const contact = body.contact || {};
  const message = body.message || {};

  let phone = contact.phone || '';
  let text = '';

  // Handle nested message.message.text (workflow format) or message.text (raw webhook)
  if (typeof message.message === 'object' && message.message.text) {
    text = message.message.text;
  } else if (typeof message.text === 'string') {
    text = message.text;
  }

  if (!phone) {
    return { error: 'No phone number in payload' };
  }

  return { phone: normalizePhone(phone), text: text.trim().toLowerCase() };
}

// ─── Customer Lookup with Phone Variant Fallback ──────────────────────
async function findCustomer(phone) {
  const variants = getPhoneVariants(phone);
  for (const variant of variants) {
    const customer = await Customer.findOne({ phone: variant });
    if (customer) return customer;
  }
  return null;
}

// ─── Main Webhook Handler ─────────────────────────────────────────────
router.post('/respondio', async (req, res) => {
  console.log('[Webhook] POST /webhooks/respondio');

  // Step 1: Validate payload
  const payload = extractPayload(req.body);
  if (payload.error) {
    console.error(`[Webhook] Invalid payload: ${payload.error}`);
    return res.json({ reply: '⚠️ Could not process your message. Please try again.' });
  }

  const { phone, text } = payload;
  console.log(`[Webhook] Phone: ${phone} | Text: "${text}"`);

  // Step 2: Route based on text
  try {
    let reply;

    switch (text) {
      case 'hi':
      case 'hello':
      case 'help':
        reply = getMenu();
        break;
      case 'policies':
        reply = await handlePolicies(phone);
        break;
      case 'statement':
        reply = await handleStatementFlow(phone, 'select_policy');
        break;
      case 'cancel':
        clearSession(phone);
        reply = '❌ Cancelled. Type *hi* to start again.';
        break;
      default:
        reply = await handleSessionState(phone, text);
    }

    return res.json({ reply: truncateForWhatsApp(reply || 'An unexpected error occurred. Please type *hi*.') });
  } catch (error) {
    console.error(`[Webhook] Handler error: ${error.message}`);
    return res.json({ reply: '⚠️ An error occurred. Please try again later or type *hi* for the menu.' });
  }
});

// ─── Menu ─────────────────────────────────────────────────────────────
function getMenu() {
  return `🛡️ *InsureBot v2.0 — BWP*

Reply with a keyword:
• *policies* — View your policy list
• *statement* — Get policy statement (OTP required)
• *help* — Show this menu`;
}

// ─── Policies ─────────────────────────────────────────────────────────
async function handlePolicies(phone) {
  const customer = await findCustomer(phone);
  if (!customer) {
    return '❌ No account found for this number. Please contact support.';
  }

  const policies = await Policy.find({ customerId: customer.customerId });
  if (policies.length === 0) {
    return `ℹ️ ${customer.name}, you have no policies on file.`;
  }

  let reply = `📋 *Your Policies (${policies.length})*\n\n`;
  policies.forEach((p) => {
    reply += policySummaryLine(p) + '\n\n';
  });

  return reply.trim();
}

// ─── Statement Flow (State Machine) ───────────────────────────────────
async function handleStatementFlow(phone, state, data = {}) {
  if (state === 'select_policy') {
    const customer = await findCustomer(phone);
    if (!customer) {
      return '❌ No account found for this number.';
    }

    const policies = await Policy.find({
      customerId: customer.customerId,
      status: 'Active'
    });

    if (policies.length === 0) {
      return 'ℹ️ You have no active policies.';
    }

    setSession(phone, 'awaiting_policy_selection', { customerId: customer.customerId, policies });

    let reply = `📋 *Select a policy for statement:*\n\n`;
    policies.forEach((p, i) => {
      reply += `${i + 1}. ${p.policyId} — ${p.type} (${p.status})\n`;
    });
    reply += '\nReply with a number or *cancel*.';

    return reply;
  }

  return 'Type *hi* to start again.';
}

// ─── Session State Handler ────────────────────────────────────────────
async function handleSessionState(phone, text) {
  const session = getSession(phone);
  if (!session) {
    return "I didn't understand that. Type *hi* for the menu.";
  }

  switch (session.state) {
    case 'awaiting_policy_selection': {
      const num = parseInt(text, 10);
      if (isNaN(num) || num < 1 || num > session.data.policies.length) {
        return `⚠️ Please enter a number between 1 and ${session.data.policies.length}, or type *cancel*.`;
      }

      const selectedPolicy = session.data.policies[num - 1];
      setSession(phone, 'awaiting_otp', {
        customerId: session.data.customerId,
        policyId: selectedPolicy.policyId
      });

      // Generate and send OTP via SMS
      try {
        const otp = await createOTP(session.data.customerId, 'statement_retrieval');
        const customer = await Customer.findOne({ customerId: session.data.customerId });

        // Strip the + for TextBW (requires country code only)
        const mobileForSMS = customer.phone.replace('+', '');
        const smsResult = await sendSMS(mobileForSMS, otp);

        if (smsResult.success) {
          return `🔐 *OTP Sent via SMS*\n\nA 5-digit code has been sent to ${customer.phone}.\n\n⚠️ _Please wait at least 5 minutes before entering the OTP to ensure it arrives._\n\nReply with the code to continue, or type *cancel*.`;
        } else {
          // SMS failed — return the specific error
          return smsResult.errorReply;
        }
      } catch (err) {
        console.error(`[Webhook] OTP flow error: ${err.message}`);
        clearSession(phone);
        return '⚠️ Could not send OTP. Please try again later.';
      }
    }

    case 'awaiting_otp': {
      // Validate OTP format
      if (!/^\d{5}$/.test(text)) {
        return '⚠️ Please enter the 5-digit OTP code, or type *cancel*.';
      }

      const result = await validateOTP(session.data.customerId, text, 'statement_retrieval');

      if (!result.valid) {
        if (result.reason === 'expired') {
          clearSession(phone);
          return '⏰ OTP expired. Type *statement* to request a new one.';
        }
        if (result.reason === 'max_attempts') {
          clearSession(phone);
          return '🔒 Too many failed attempts. Type *statement* to request a new OTP.';
        }
        return `❌ Invalid OTP. ${result.remainingAttempts} attempt(s) remaining. Try again or type *cancel*.`;
      }

      // OTP valid — fetch statement
      clearSession(phone);
      const statement = await Statement.findOne({
        policyId: session.data.policyId
      });

      if (!statement) {
        return '❌ No statement found for this policy. Please contact support.';
      }

      const customer = await Customer.findOne({ customerId: session.data.customerId });
      return buildStatementMessage(customer, statement);
    }

    default:
      clearSession(phone);
      return "Session expired. Type *hi* to start again.";
  }
}

module.exports = router;
