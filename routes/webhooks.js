const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Policy = require('../models/Policy');
const Statement = require('../models/Statement');
const { cacheFromWebhook } = require('../services/conversation');
const { createOTP, validateOTP } = require('../services/otp');
const { sendTextMessage, sendTemplateMessage } = require('../services/whatsapp');
const { policySummaryLine, buildStatementMessage, formatCurrency, formatDate } = require('../utils/helpers');

// ─── In-memory session state ──────────────────────────────────────────────────
const sessions = new Map();

function getSession(phone) {
  return sessions.get(phone);
}

function setSession(phone, state, data = {}, ttlMinutes = 10) {
  sessions.set(phone, {
    state,
    data,
    expiresAt: Date.now() + ttlMinutes * 60 * 1000
  });
}

function clearSession(phone) {
  sessions.delete(phone);
}

// Clean expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [phone, session] of sessions) {
    if (session.expiresAt < now) {
      sessions.delete(phone);
    }
  }
}, 5 * 60 * 1000);

// ─── Extraction functions — matched to YOUR Respond.io webhook payload ─────────

function extractPhone(payload) {
  return payload.contact?.phone || null;
}

function extractMessageText(payload) {
  try {
    const msgObj = payload.message?.message;
    if (msgObj?.type === 'text' && msgObj?.text) {
      return msgObj.text;
    }
    return '';
  } catch {
    return '';
  }
}

function isInboundCustomerMessage(payload) {
  const traffic = payload.message?.traffic;
  const senderSource = payload.sender?.source;
  return traffic === 'incoming' && senderSource === 'user';
}

// ─── Main webhook handler ─────────────────────────────────────────────────────

router.post('/respondio', async (req, res) => {
  const payload = req.body.data || req.body;

  // Always cache contact/channel mapping
  cacheFromWebhook(payload);

  // Acknowledge immediately
  res.status(200).json({ received: true });

  // Only process inbound customer messages
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

  // ─── Help / Menu ─────────────────────────────────────────────────────────
  if (rawText === 'help' || rawText === 'menu' || rawText === 'hi' || rawText === 'hello' || rawText === 'start') {
    clearSession(phone);
    await sendTextMessage(phone,
      `🛡️ *InsureBot — WhatsApp Assistant*\n\n` +
      `Reply with a keyword:\n\n` +
      `• *policies* — View your policy list\n` +
      `• *statement* — Get policy statement (OTP required)\n` +
      `• *claims* — View claim status\n` +
      `• *help* — Show this menu\n\n` +
      `_For sensitive information, you will receive a 5-digit OTP for verification._`
    );
    return;
  }

  // ─── Lookup customer by phone ────────────────────────────────────────────
  const customer = await Customer.findOne({ phone });
  if (!customer) {
    await sendTextMessage(phone,
      `❌ No account found for this number.\n\n` +
      `Please ensure you're using the phone number registered with your insurance account.\n\n` +
      `Reply *help* for options.`
    );
    return;
  }

  // ─── Session-based flows ─────────────────────────────────────────────────
  const session = getSession(phone);

  // --- OTP input state ---
  if (session && session.state === 'AWAITING_OTP') {
    const otpInput = rawText;

    if (otpInput === 'cancel') {
      clearSession(phone);
      await sendTextMessage(phone, '✅ OTP verification cancelled. Reply *help* for options.');
      return;
    }

    if (!/^\d{5}$/.test(otpInput)) {
      await sendTextMessage(phone,
        `⚠️ Please enter a valid 5-digit OTP code.\nReply *cancel* to abort.`
      );
      return;
    }

    const result = await validateOTP(customer.customerId, otpInput, session.data.purpose);

    if (result.valid) {
      clearSession(phone);
      if (session.data.purpose === 'statement_retrieval') {
        await fulfillStatementRequest(phone, customer, session.data.policyId);
      } else if (session.data.purpose === 'policy_details') {
        await fulfillPolicyDetails(phone, customer, session.data.policyId);
      } else if (session.data.purpose === 'claim_info') {
        await fulfillClaimInfo(phone, customer);
      }
    } else {
      let errorMsg = '';
      switch (result.reason) {
        case 'no_active_otp':
          errorMsg = '❌ No active OTP found. Please request again.\nReply *help* for options.';
          clearSession(phone);
          break;
        case 'max_attempts_exceeded':
          errorMsg = '❌ Too many incorrect attempts. Please request a new OTP.\nReply *help* for options.';
          clearSession(phone);
          break;
        case 'incorrect':
          errorMsg = `❌ Incorrect OTP. ${result.remainingAttempts} attempt(s) remaining.\nReply *cancel* to abort.`;
          break;
        default:
          errorMsg = '❌ OTP validation failed. Please try again.';
          clearSession(phone);
      }
      await sendTextMessage(phone, errorMsg);
    }
    return;
  }

  // --- Policy selection state ---
  if (session && session.state === 'AWAITING_POLICY_SELECT') {
    const selection = rawText;

    if (selection === 'cancel') {
      clearSession(phone);
      await sendTextMessage(phone, '✅ Cancelled. Reply *help* for options.');
      return;
    }

    const policyList = session.data.policies;
    const idx = parseInt(selection) - 1;

    if (isNaN(idx) || idx < 0 || idx >= policyList.length) {
      await sendTextMessage(phone,
        `⚠️ Invalid selection. Please enter a number between 1 and ${policyList.length}, or *cancel*.`
      );
      return;
    }

    const selectedPolicy = policyList[idx];
    clearSession(phone);
    await triggerOTPFlow(phone, customer, selectedPolicy.policyId, 'statement_retrieval');
    return;
  }

  // ─── Command handling ────────────────────────────────────────────────────

  // --- POLICIES ---
  if (rawText === 'policies' || rawText === 'policy') {
    const policies = await Policy.find({ customerId: customer.customerId }).sort({ type: 1 });

    if (policies.length === 0) {
      await sendTextMessage(phone, `📋 You have no policies on record.`);
      return;
    }

    let msg = `📋 *Your Policies* (${policies.length})\n`;
    msg += `Customer: ${customer.name}\n`;
    msg += `─────────────────────\n\n`;

    for (const p of policies) {
      msg += policySummaryLine(p) + '\n\n';
    }

    await sendTextMessage(phone, msg);
    return;
  }

  // --- STATEMENT ---
  if (rawText === 'statement' || rawText === 'statements') {
    const policies = await Policy.find({
      customerId: customer.customerId,
      status: { $in: ['Active', 'Lapsed', 'Claimed'] }
    }).sort({ type: 1 });

    if (policies.length === 0) {
      await sendTextMessage(phone, '📋 No active policies found for statement generation.');
      return;
    }

    if (policies.length === 1) {
      await triggerOTPFlow(phone, customer, policies[0].policyId, 'statement_retrieval');
      return;
    }

    let msg = `📋 *Select a policy for statement:*\n\n`;
    policies.forEach((p, i) => {
      msg += `${i + 1}. ${p.policyId} — ${p.type} (${p.status})\n`;
    });
    msg += `\nReply with a number (1-${policies.length}) or *cancel*.`;

    setSession(phone, 'AWAITING_POLICY_SELECT', { policies }, 5);
    await sendTextMessage(phone, msg);
    return;
  }

  // --- CLAIMS ---
  if (rawText === 'claims' || rawText === 'claim') {
    const policies = await Policy.find({
      customerId: customer.customerId,
      'claims.0': { $exists: true }
    });

    if (policies.length === 0) {
      await sendTextMessage(phone, '📋 No claims found on your policies.');
      return;
    }

    const policyIds = policies.map(p => p.policyId).join(',');
    await triggerOTPFlow(phone, customer, policyIds, 'claim_info');
    return;
  }

  // ─── Fallback ────────────────────────────────────────────────────────────
  await sendTextMessage(phone,
    `🤔 I didn't understand that.\n\n` +
    `Reply *help* to see available commands.`
  );
});

// ─── Helper: Trigger OTP flow ─────────────────────────────────────────────────

async function triggerOTPFlow(phone, customer, policyId, purpose) {
  const otp = await createOTP(customer.customerId, purpose);
  await sendTemplateMessage(phone, 'otp_delivery', [otp]);

  setSession(customer.phone, 'AWAITING_OTP', { purpose, policyId }, 10);

  await sendTextMessage(phone,
    `🔐 A 5-digit verification code has been sent to your WhatsApp.\n\n` +
    `Reply with the code within 10 minutes, or *cancel* to abort.`
  );
}

// ─── Fulfillment functions ────────────────────────────────────────────────────

async function fulfillStatementRequest(phone, customer, policyId) {
  const primaryPolicyId = policyId.split(',')[0].trim();

  const statement = await Statement.findOne({
    customerId: customer.customerId,
    policyId: primaryPolicyId
  });

  if (!statement) {
    await sendTextMessage(phone,
      `❌ No statement found for policy ${primaryPolicyId}.\nPlease contact support.`
    );
    return;
  }

  const msg = buildStatementMessage(statement, customer);
  await sendTextMessage(phone, msg);
}

async function fulfillPolicyDetails(phone, customer, policyId) {
  const policy = await Policy.findOne({ policyId, customerId: customer.customerId });
  if (!policy) {
    await sendTextMessage(phone, '❌ Policy not found.');
    return;
  }

  let msg = `📄 *Policy Details*\n`;
  msg += `─────────────────────\n`;
  msg += `Policy ID: ${policy.policyId}\n`;
  msg += `Type: ${policy.type}\n`;
  msg += `Status: ${policy.status}\n`;
  msg += `Sum Insured: ${formatCurrency(policy.sumInsured)}\n`;
  msg += `Premium: ${formatCurrency(policy.premium.amount)} (${policy.premium.frequency})\n`;
  msg += `Start: ${formatDate(policy.startDate)}\n`;
  msg += `End: ${formatDate(policy.endDate)}\n`;
  msg += `Next Due: ${policy.nextPremiumDue ? formatDate(policy.nextPremiumDue) : 'N/A'}\n`;

  const cd = policy.coverageDetails;
  if (policy.type === 'Life') {
    msg += `\n*Life Coverage:*\n`;
    msg += `Nominee: ${cd.nominee} (${cd.nomineeRelation})\n`;
    msg += `Term: ${cd.termYears} years\n`;
    msg += `Maturity Benefit: ${formatCurrency(cd.maturityBenefit)}\n`;
  } else if (policy.type === 'Vehicle') {
    msg += `\n*Vehicle Details:*\n`;
    msg += `${cd.make} ${cd.model} (${cd.year})\n`;
    msg += `Reg: ${cd.registrationNo}\n`;
  } else if (policy.type === 'Health') {
    msg += `\n*Health Coverage:*\n`;
    msg += `Network: ${cd.networkType}\n`;
    msg += `Room Rent: ${cd.roomRentLimit}\n`;
    msg += `Deductible: ${formatCurrency(cd.deductible || 0)}\n`;
    if (cd.preExistingDiseases && cd.preExistingDiseases.length > 0) {
      msg += `Pre-existing: ${cd.preExistingDiseases.join(', ')}\n`;
    }
  } else if (policy.type === 'Property') {
    msg += `\n*Property Details:*\n`;
    msg += `Type: ${cd.propertyType}\n`;
    msg += `Area: ${cd.areaSqFt} sq ft\n`;
    msg += `Construction: ${cd.constructionType}\n`;
    msg += `Risk: ${cd.locationRisk}\n`;
  }

  await sendTextMessage(phone, msg);
}

async function fulfillClaimInfo(phone, customer) {
  const policies = await Policy.find({
    customerId: customer.customerId,
    'claims.0': { $exists: true }
  });

  let msg = `📄 *Your Claims*\n`;
  msg += `─────────────────────\n`;

  let found = 0;
  for (const policy of policies) {
    for (const claim of policy.claims) {
      found++;
      const statusEmoji = {
        'Filed': '📝', 'Under Review': '🔍', 'Approved': '✅',
        'Rejected': '❌', 'Settled': '💰'
      };
      const emoji = statusEmoji[claim.status] || '📋';

      msg += `\n${emoji} *${claim.claimId}* — ${policy.policyId}\n`;
      msg += `   Status: ${claim.status}\n`;
      msg += `   Amount: ${formatCurrency(claim.amount)}\n`;
      msg += `   Filed: ${formatDate(claim.filedDate)}\n`;
      msg += `   ${claim.description}\n`;
      if (claim.status === 'Settled') {
        msg += `   Settled: ${formatCurrency(claim.settledAmount)} on ${formatDate(claim.settledDate)}\n`;
      }
    }
  }

  if (found === 0) {
    msg += 'No claims found.';
  }

  await sendTextMessage(phone, msg);
}

module.exports = router;