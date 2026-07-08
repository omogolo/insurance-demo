const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Policy = require('../models/Policy');
const Statement = require('../models/Statement');
const { cacheFromWebhook } = require('../services/conversation');
const { createOTP, validateOTP } = require('../services/otp');
const { sendTextMessage } = require('../services/whatsapp');
const { sendOTPSMS } = require('../services/sms');
const { policySummaryLine, buildStatementMessage, formatCurrency } = require('../utils/helpers');

// ─── In-memory session state ──────────────────────────────────────────────────
const sessions = new Map();
function getSession(phone) { return sessions.get(phone); }
function setSession(phone, state, data = {}, ttlMinutes = 10) {
  sessions.set(phone, { state, data, expiresAt: Date.now() + ttlMinutes * 60 * 1000 });
}
function clearSession(phone) { sessions.delete(phone); }

setInterval(() => {
  const now = Date.now();
  for (const [phone, session] of sessions) { if (session.expiresAt < now) sessions.delete(phone); }
}, 5 * 60 * 1000);

// ─── Extraction functions ─────────────────────────────────────────────────────
function extractPhone(payload) {
  let phone = payload.contact?.phone || null;
  if (phone) {
    // Remove any spaces
    phone = phone.replace(/\s+/g, '');
    // If it's missing the '+', add it so it matches the DB format
    if (!phone.startsWith('+')) {
      phone = '+' + phone;
    }
  }
  return phone;
}

function extractMessageText(payload) {
  try {
    if (payload.message?.message?.type === 'text' && payload.message.message.text) {
      return payload.message.message.text;
    }
    if (payload.message?.payload?.type === 'text' && payload.message.payload.text) {
      return payload.message.payload.text;
    }
    return '';
  } catch { return ''; }
}

function isInboundCustomerMessage(payload) {
  if (payload.message?.traffic === 'incoming' && payload.sender?.source === 'user') {
    return true;
  }
  if (payload.event_type === 'message.created' && payload.contact?.id) {
    return true;
  }
  return false;
}

// ─── Main webhook handler ─────────────────────────────────────────────────────
router.post('/respondio', async (req, res) => {
  const payload = req.body.data || req.body;
  
  console.log('=== RAW PAYLOAD ===', JSON.stringify(payload, null, 2));

  cacheFromWebhook(payload);
  res.status(200).json({ received: true });

  if (!isInboundCustomerMessage(payload)) {
    console.log(`[Webhook] Ignoring — traffic: ${payload.message?.traffic}, sender: ${payload.sender?.source}`);
    return;
  }

  const phone = extractPhone(payload);
  const rawText = extractMessageText(payload).trim().toLowerCase();

  console.log(`[Webhook] INBOUND | Phone: ${phone} | Text: "${rawText}"`);

  if (!phone) {
    console.warn('[Webhook] No phone in payload, skipping');
    return;
  }

  const customer = await Customer.findOne({ phone });
  if (!customer) {
    await sendTextMessage(phone, `Unfortunately your mobile number is not on the system. Please contact support for this issue.`);
    return;
  }

  const session = getSession(phone);

  // --- OTP Input State ---
  if (session && session.state === 'AWAITING_OTP') {
    const otpInput = rawText;
    if (otpInput === 'cancel') { clearSession(phone); await sendTextMessage(phone, '✅ Cancelled.'); return; }
    if (!/^\d{5}$/.test(otpInput)) { await sendTextMessage(phone, `⚠️ Enter a valid 5-digit code.\nReply *cancel* to abort.`); return; }

    const result = await validateOTP(customer.customerId, otpInput, session.data.purpose);
    if (result.valid) {
      clearSession(phone);
      if (session.data.purpose === 'statement_retrieval') await fulfillStatementRequest(phone, customer, session.data.policyId);
      else if (session.data.purpose === 'claim_info') await fulfillClaimInfo(phone, customer);
    } else {
      let errorMsg = result.reason === 'max_attempts_exceeded' ? '❌ Too many attempts. Request a new OTP.' : 
                     result.reason === 'no_active_otp' ? '❌ OTP expired. Request a new OTP.' :
                     `❌ Incorrect OTP. ${result.remainingAttempts} attempt(s) left.`;
      if (result.reason !== 'incorrect') clearSession(phone);
      await sendTextMessage(phone, errorMsg);
    }
    return;
  }

  // --- Policy Selection State ---
  if (session && session.state === 'AWAITING_POLICY_SELECT') {
    if (rawText === 'cancel') { clearSession(phone); await sendTextMessage(phone, '✅ Cancelled.'); return; }
    const idx = parseInt(rawText) - 1;
    const policyList = session.data.policies;
    if (isNaN(idx) || idx < 0 || idx >= policyList.length) {
      await sendTextMessage(phone, `⚠️ Invalid selection. Enter 1-${policyList.length}.`);
      return;
    }
    clearSession(phone);
    await triggerOTPFlow(phone, customer, policyList[idx].policyId, 'statement_retrieval');
    return;
  }

  // --- Commands ---
  if (rawText === 'help' || rawText === 'menu' || rawText === 'hi') {
    clearSession(phone);
    await sendTextMessage(phone, `🛡️ *InsureBot v2.0 — BWP*\n\nReply:\n• *policies*\n• *statement*\n• *claims*`);
    return;
  }

  if (rawText === 'policies') {
    const policies = await Policy.find({ customerId: customer.customerId }).sort({ type: 1 });
    if (!policies.length) return await sendTextMessage(phone, `📋 No policies found.`);
    let msg = `📋 *Your Policies*\n\n`;
    policies.forEach(p => { msg += policySummaryLine(p) + '\n\n'; });
    return await sendTextMessage(phone, msg);
  }

  if (rawText === 'statement') {
    const policies = await Policy.find({ customerId: customer.customerId, status: { $in: ['Active', 'Lapsed', 'Claimed'] } });
    if (!policies.length) return await sendTextMessage(phone, '📋 No active policies.');
    if (policies.length === 1) return await triggerOTPFlow(phone, customer, policies[0].policyId, 'statement_retrieval');
    
    let msg = `📋 *Select a policy:*\n\n`;
    policies.forEach((p, i) => { msg += `${i + 1}. ${p.policyId} — ${p.type}\n`; });
    msg += `\nReply with a number (1-${policies.length}).`;
    setSession(phone, 'AWAITING_POLICY_SELECT', { policies }, 5);
    return await sendTextMessage(phone, msg);
  }

  if (rawText === 'claims') {
    const policies = await Policy.find({ customerId: customer.customerId, 'claims.0': { $exists: true } });
    if (!policies.length) return await sendTextMessage(phone, '📋 No claims found.');
    const policyIds = policies.map(p => p.policyId).join(',');
    return await triggerOTPFlow(phone, customer, policyIds, 'claim_info');
  }

  await sendTextMessage(phone, `🤔 Unknown command. Reply *help*.`);
});

// --- Core OTP Trigger Logic (v2.0 SMS Upgrade) ---
async function triggerOTPFlow(phone, customer, policyId, purpose) {
  const otp = await createOTP(customer.customerId, purpose);
  
  const smsResult = await sendOTPSMS(customer.phone, otp);

  if (!smsResult.success) {
    await sendTextMessage(phone, `❌ *OTP Failed*\n\n${smsResult.message}\n\nReply *help* to return to the menu.`);
    return;
  }

  setSession(customer.phone, 'AWAITING_OTP', { purpose, policyId }, 10);
  
  await sendTextMessage(phone, 
    `🔐 *OTP Sent via SMS*\n\n` +
    `A 5-digit code was sent to ${customer.phone}.\n\n` +
    `⏳ _Please wait at least 5 minutes for the SMS to arrive before typing anything else into this chat._\n\n` +
    `Reply *cancel* to abort.`
  );
}

// --- Fulfillment Functions ---
async function fulfillStatementRequest(phone, customer, policyId) {
  const primaryPolicyId = policyId.split(',')[0].trim();
  const statement = await Statement.findOne({ customerId: customer.customerId, policyId: primaryPolicyId });
  if (!statement) return await sendTextMessage(phone, `❌ Statement not found.`);
  await sendTextMessage(phone, buildStatementMessage(statement, customer));
}

async function fulfillClaimInfo(phone, customer) {
  const policies = await Policy.find({ customerId: customer.customerId, 'claims.0': { $exists: true } });
  let msg = `📄 *Your Claims*\n\n`; let found = 0;
  for (const policy of policies) {
    for (const claim of policy.claims) {
      found++;
      const emoji = { 'Filed':'📝', 'Under Review':'🔍', 'Approved':'✅', 'Rejected':'❌', 'Settled':'💰' }[claim.status] || '📋';
      msg += `${emoji} *${claim.claimId}* — ${policy.policyId}\nStatus: ${claim.status}\nAmount: ${formatCurrency(claim.amount)}\n\n`;
    }
  }
  if (!found) msg += 'No claims found.';
  await sendTextMessage(phone, msg);
}

module.exports = router;
