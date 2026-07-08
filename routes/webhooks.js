const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Policy = require('../models/Policy');
const Statement = require('../models/Statement');
const { createOTP, validateOTP } = require('../services/otp');
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
    phone = phone.replace(/\s+/g, '');
    if (!phone.startsWith('+')) phone = '+' + phone;
  }
  return phone;
}

function extractMessageText(payload) {
  try {
    if (payload.message?.message?.type === 'text' && payload.message.message.text) return payload.message.message.text;
    if (payload.message?.payload?.type === 'text' && payload.message.payload.text) return payload.message.payload.text;
    if (payload.channel?.message?.type === 'text' && payload.channel.message.text) return payload.channel.message.text;
    return '';
  } catch { return ''; }
}

function isInboundCustomerMessage(payload) {
  if (payload.message?.traffic === 'incoming' && payload.sender?.source === 'user') return true;
  if ((payload.event_type === 'message.received' || payload.event_type === 'message.created') && payload.sender?.source === 'contact') return true;
  return false;
}

// ─── Main webhook handler ─────────────────────────────────────────────────────
router.post('/respondio', async (req, res) => {
  const payload = req.body.data || req.body;
  
  if (!isInboundCustomerMessage(payload)) {
    return res.status(200).json({ received: true });
  }

  const phone = extractPhone(payload);
  const rawText = extractMessageText(payload).trim().toLowerCase();

  if (!phone) return res.status(200).json({ received: true });

  const customer = await Customer.findOne({ phone });
  if (!customer) {
    return res.json({ reply: `Unfortunately your mobile number is not on the system. Please contact support for this issue.` });
  }

  const session = getSession(phone);

  // --- OTP Input State ---
  if (session && session.state === 'AWAITING_OTP') {
    const otpInput = rawText;
    if (otpInput === 'cancel') { clearSession(phone); return res.json({ reply: '✅ Cancelled.' }); }
    if (!/^\d{5}$/.test(otpInput)) { return res.json({ reply: `⚠️ Enter a valid 5-digit code.\nReply *cancel* to abort.` }); }

    const result = await validateOTP(customer.customerId, otpInput, session.data.purpose);
    if (result.valid) {
      clearSession(phone);
      if (session.data.purpose === 'statement_retrieval') return res.json({ reply: await fulfillStatementRequest(customer, session.data.policyId) });
      else if (session.data.purpose === 'claim_info') return res.json({ reply: fulfillClaimInfo(customer) });
    } else {
      let errorMsg = result.reason === 'max_attempts_exceeded' ? '❌ Too many attempts. Request a new OTP.' : 
                     result.reason === 'no_active_otp' ? '❌ OTP expired. Request a new OTP.' :
                     `❌ Incorrect OTP. ${result.remainingAttempts} attempt(s) left.`;
      if (result.reason !== 'incorrect') clearSession(phone);
      return res.json({ reply: errorMsg });
    }
  }

  // --- Policy Selection State ---
  if (session && session.state === 'AWAITING_POLICY_SELECT') {
    if (rawText === 'cancel') { clearSession(phone); return res.json({ reply: '✅ Cancelled.' }); }
    const idx = parseInt(rawText) - 1;
    const policyList = session.data.policies;
    if (isNaN(idx) || idx < 0 || idx >= policyList.length) {
      return res.json({ reply: `⚠️ Invalid selection. Enter 1-${policyList.length}.` });
    }
    clearSession(phone);
    return res.json({ reply: await triggerOTPFlow(customer, policyList[idx].policyId, 'statement_retrieval') });
  }

  // --- Commands ---
  if (rawText === 'help' || rawText === 'menu' || rawText === 'hi') {
    clearSession(phone);
    return res.json({ reply: `🛡️ *InsureBot v2.0 — BWP*\n\nReply:\n• *policies*\n• *statement*\n• *claims*` });
  }

  if (rawText === 'policies') {
    const policies = await Policy.find({ customerId: customer.customerId }).sort({ type: 1 });
    if (!policies.length) return res.json({ reply: `📋 No policies found.` });
    let msg = `📋 *Your Policies*\n\n`;
    policies.forEach(p => { msg += policySummaryLine(p) + '\n\n'; });
    return res.json({ reply: msg });
  }

  if (rawText === 'statement') {
    const policies = await Policy.find({ customerId: customer.customerId, status: { $in: ['Active', 'Lapsed', 'Claimed'] } });
    if (!policies.length) return res.json({ reply: '📋 No active policies.' });
    if (policies.length === 1) return res.json({ reply: await triggerOTPFlow(customer, policies[0].policyId, 'statement_retrieval') });
    
    let msg = `📋 *Select a policy:*\n\n`;
    policies.forEach((p, i) => { msg += `${i + 1}. ${p.policyId} — ${p.type}\n`; });
    msg += `\nReply with a number (1-${policies.length}).`;
    setSession(phone, 'AWAITING_POLICY_SELECT', { policies }, 5);
    return res.json({ reply: msg });
  }

  if (rawText === 'claims') {
    const policies = await Policy.find({ customerId: customer.customerId, 'claims.0': { $exists: true } });
    if (!policies.length) return res.json({ reply: '📋 No claims found.' });
    const policyIds = policies.map(p => p.policyId).join(',');
    return res.json({ reply: await triggerOTPFlow(customer, policyIds, 'claim_info') });
  }

  return res.json({ reply: `🤔 Unknown command. Reply *help*.` });
});

// --- Core OTP Trigger Logic ---
async function triggerOTPFlow(customer, policyId, purpose) {
  const otp = await createOTP(customer.customerId, purpose);
  
  // 1. Send OTP via TextBW
  const smsResult = await sendOTPSMS(customer.phone, otp);

  // 2. If SMS fails, tell WhatsApp
  if (!smsResult.success) {
    return `❌ *OTP Failed*\n\n${smsResult.message}\n\nReply *help* to return to the menu.`;
  }

  // 3. If SMS succeeds, save state and tell user to wait
  setSession(customer.phone, 'AWAITING_OTP', { purpose, policyId }, 10);
  
  return `🔐 *OTP Sent via SMS*\n\nA 5-digit code was sent to ${customer.phone}.\n\n⏳ _Please wait at least 5 minutes for the SMS to arrive before typing anything else into this chat._\n\nReply *cancel* to abort.`;
}

// --- Fulfillment Functions (Now just return text strings) ---
async function fulfillStatementRequest(customer, policyId) {
  const primaryPolicyId = policyId.split(',')[0].trim();
  const statement = await Statement.findOne({ customerId: customer.customerId, policyId: primaryPolicyId });
  if (!statement) return `❌ Statement not found.`;
  return buildStatementMessage(statement, customer);
}

function fulfillClaimInfo(customer) {
  // Note: This function is synchronous now since it doesn't send API requests
  const policies = Policy.find({ customerId: customer.customerId, 'claims.0': { $exists: true } });
  let msg = `📄 *Your Claims*\n\n`; let found = 0;
  for (const policy of policies) {
    for (const claim of policy.claims) {
      found++;
      const emoji = { 'Filed':'📝', 'Under Review':'🔍', 'Approved':'✅', 'Rejected':'❌', 'Settled':'💰' }[claim.status] || '📋';
      msg += `${emoji} *${claim.claimId}* — ${policy.policyId}\nStatus: ${claim.status}\nAmount: ${formatCurrency(claim.amount)}\n\n`;
    }
  }
  if (!found) msg += 'No claims found.';
  return msg;
}

module.exports = router;
