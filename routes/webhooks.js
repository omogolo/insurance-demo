var express = require('express');
var router = express.Router();
var crypto = require('crypto');

var Customer = require('../models/Customer');
var Policy = require('../models/Policy');
var Claim = require('../models/Claim');
var OTP = require('../models/OTP');
var sendSMS = require('../services/sms').sendSMS;
var normalizePhone = require('../utils/phone').normalizePhone;
var getPhoneVariants = require('../utils/phone').getPhoneVariants;

// ============================================================
// PAYLOAD PARSER
// ============================================================

function parseRespondioPayload(body) {
  console.log('[Webhook] Raw payload:', JSON.stringify(body).slice(0, 800));

  var phone = null;
  var text = null;

  phone = body && body.contact && body.contact.phone ? body.contact.phone : null;
  if (phone && phone.charAt(0) !== '+') {
    phone = '+' + phone;
  }

  text = body && body.message && body.message.message && body.message.message.text ? body.message.message.text : null;

  if (text && text.charAt(0) === '$') {
    console.warn('[Webhook] Variable NOT resolved: "' + text + '"');
    text = null;
  }

  var eventType = (body && body.event_type) ? body.event_type : ((body && body.event) ? body.event : 'unknown');
  var contactId = (body && body.contact && body.contact.id) ? body.contact.id : null;

  return { phone: phone, text: text, eventType: eventType, contactId: contactId };
}

// ============================================================
// VALIDATION
// ============================================================

function validatePayload(parsed) {
  var errors = [];
  if (!parsed.phone) { errors.push('Phone number not found'); }
  if (!parsed.text) { errors.push('Message text not found'); }
  return { valid: errors.length === 0, errors: errors };
}

// ============================================================
// CUSTOMER LOOKUP
// ============================================================

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

// ============================================================
// OTP HELPERS
// ============================================================

function generateOTP() {
  return crypto.randomInt(10000, 99999).toString();
}

async function createAndSendOTP(customer, phone, purpose) {
  var otp = generateOTP();
  var expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await OTP.deleteMany({ customerId: customer._id.toString(), used: false });
  await OTP.create({
    customerId: customer._id.toString(),
    otp: otp,
    purpose: purpose,
    expiresAt: expiresAt
  });

  try {
    await sendSMS(phone, 'Your InsureBot verification code is: ' + otp + '. Valid for 5 minutes.');
    return { success: true };
  } catch (err) {
    console.error('[SMS] Failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================
// SESSION HELPERS (for multi-turn flows)
// ============================================================

var SESSION_EXPIRY_MS = 10 * 60 * 1000;

async function getSession(customer) {
  if (!customer.session || !customer.session.action) { return null; }
  var age = Date.now() - new Date(customer.session.updatedAt).getTime();
  if (age > SESSION_EXPIRY_MS) {
    await clearSession(customer);
    return null;
  }
  return customer.session;
}

async function setSession(customer, action, data) {
  await Customer.findByIdAndUpdate(customer._id, {
    $set: { session: { action: action, data: data || {}, updatedAt: new Date() } }
  });
}

async function clearSession(customer) {
  await Customer.findByIdAndUpdate(customer._id, {
    $set: { session: { action: null, data: {}, updatedAt: new Date() } }
  });
}

// ============================================================
// CLAIM HELPERS
// ============================================================

function generateClaimNumber() {
  var now = new Date();
  var dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  var seq = String(crypto.randomInt(1, 9999)).padStart(4, '0');
  return 'CLM-' + dateStr + '-' + seq;
}

// ============================================================
// STATEMENT GENERATOR
// ============================================================

function generateStatement(customer, policies) {
  if (!policies || policies.length === 0) {
    return 'No active policies found for your account.';
  }

  var lines = [];
  lines.push('INSURANCE STATEMENT');
  lines.push('Account: ' + customer.name);
  lines.push('Generated: ' + new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  }));
  lines.push('');

  var totalPremium = 0;
  var totalCover = 0;

  for (var i = 0; i < policies.length; i++) {
    var p = policies[i];
    lines.push((i + 1) + '. ' + p.policyNumber + ' - ' + p.type + ' Insurance');
    lines.push('   Status: ' + p.status);
    lines.push('   Premium: BWP ' + p.premium + '/month');
    lines.push('   Coverage: BWP ' + p.coverAmount.toLocaleString());

    if (p.startDate) {
      lines.push('   From: ' + new Date(p.startDate).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      }));
    }
    if (p.endDate) {
      lines.push('   To: ' + new Date(p.endDate).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      }));
    }
    if (p.nextPaymentDate) {
      lines.push('   Next Payment: ' + new Date(p.nextPaymentDate).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      }));
    }

    if (p.type === 'Vehicle' && p.vehicleDetails) {
      var v = p.vehicleDetails;
      lines.push('   Vehicle: ' + (v.year || '') + ' ' + (v.make || '') + ' ' + (v.model || '') + ' (' + (v.registration || 'N/A') + ')');
    }
    if (p.type === 'Property' && p.propertyDetails) {
      var prop = p.propertyDetails;
      lines.push('   Property: ' + (prop.type || 'N/A') + ' at ' + (prop.address || 'N/A'));
    }

    lines.push('');
    totalPremium += p.premium || 0;
    totalCover += p.coverAmount || 0;
  }

  lines.push('---');
  lines.push('Total Policies: ' + policies.length);
  lines.push('Total Monthly Premium: BWP ' + totalPremium.toLocaleString());
  lines.push('Total Coverage: BWP ' + totalCover.toLocaleString());
  lines.push('');
  lines.push('Reply "menu" for more options or "agent" to speak with us.');

  return lines.join('\n');
}

// ============================================================
// REMINDERS GENERATOR
// ============================================================

function generateReminders(policies) {
  var now = new Date();
  var thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  var upcoming = [];
  for (var i = 0; i < policies.length; i++) {
    var p = policies[i];
    if (p.nextPaymentDate && p.status === 'Active') {
      var npd = new Date(p.nextPaymentDate);
      if (npd >= now && npd <= thirtyDays) {
        upcoming.push(p);
      }
    }
  }

  if (upcoming.length === 0) {
    return 'No upcoming premium payments in the next 30 days.\n\nReply "menu" for more options.';
  }

  upcoming.sort(function (a, b) {
    return new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate);
  });

  var lines = [];
  lines.push('UPCOMING PREMIUM PAYMENTS');
  lines.push('');

  var total = 0;
  for (var i = 0; i < upcoming.length; i++) {
    var p = upcoming[i];
    var dateStr = new Date(p.nextPaymentDate).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short'
    });
    lines.push((i + 1) + '. ' + p.policyNumber + ' (' + p.type + ')');
    lines.push('   BWP ' + p.premium + ' due ' + dateStr);
    total += p.premium || 0;
  }

  lines.push('');
  lines.push('Total Due: BWP ' + total.toLocaleString());
  lines.push('');
  lines.push('Reply "statements" for full details or "menu" for all options.');

  return lines.join('\n');
}

// ============================================================
// RESPONSE HELPER
// ============================================================

function makeResponse(customer, type, message, extra) {
  var resp = {
    action: 'reply',
    customerFound: true,
    customerName: customer.name,
    customerId: customer._id,
    type: type,
    message: message
  };
  if (extra) {
    var keys = Object.keys(extra);
    for (var i = 0; i < keys.length; i++) {
      resp[keys[i]] = extra[keys[i]];
    }
  }
  return resp;
}

// ============================================================
// COMMAND HANDLERS
// ============================================================

function handleMenu(customer) {
  return makeResponse(customer, 'menu',
    'Hello ' + customer.name + '! How can I help you?\n\n' +
    '1. My Policies\n' +
    '2. My Statements\n' +
    '3. File a Claim\n' +
    '4. Premium Reminders\n' +
    '5. Speak to an Agent\n\n' +
    'Reply with a number or keyword.'
  );
}

async function handlePolicies(customer, phone) {
  var result = await createAndSendOTP(customer, phone, 'policy_details');
  if (result.success) {
    return makeResponse(customer, 'otp_sent',
      'To protect your information, we need to verify your identity.\n\n' +
      'A 5-digit code has been sent to ' + phone + '.\n\n' +
      'Reply with the code to view your policies.'
    );
  }
  return makeResponse(customer, 'error',
    'Could not send verification code. Please try again later.'
  );
}

async function handleStatements(customer, phone) {
  var result = await createAndSendOTP(customer, phone, 'statement_retrieval');
  if (result.success) {
    return makeResponse(customer, 'otp_sent',
      'To protect your information, we need to verify your identity.\n\n' +
      'A 5-digit code has been sent to ' + phone + '.\n\n' +
      'Reply with the code to view your statements.'
    );
  }
  return makeResponse(customer, 'error',
    'Could not send verification code. Please try again later.'
  );
}

async function handleClaim(customer, phone) {
  var result = await createAndSendOTP(customer, phone, 'claim_info');
  if (result.success) {
    return makeResponse(customer, 'otp_sent',
      'To file a claim, we need to verify your identity.\n\n' +
      'A 5-digit code has been sent to ' + phone + '.\n\n' +
      'Reply with the code to continue.'
    );
  }
  return makeResponse(customer, 'error',
    'Could not send verification code. Please try again later.'
  );
}

async function handleReminders(customer) {
  var policies = await Policy.find({ customer: customer._id, status: 'Active' });
  var message = generateReminders(policies);
  return makeResponse(customer, 'reminders', message);
}

function handleAgent(customer) {
  return makeResponse(customer, 'agent',
    'Connecting you with an insurance agent. Please hold...\n\n' +
    'Our team typically responds within a few minutes during business hours (Mon-Fri, 8am-5pm CAT).\n\n' +
    'You can also email us at support@insurebot.co.bw'
  );
}

// ============================================================
// OTP VERIFICATION (routes to correct feature based on purpose)
// ============================================================

async function handleOTPVerification(customer, otpCode) {
  var otpRecord = await OTP.findOne({
    customerId: customer._id.toString(),
    otp: otpCode,
    used: false,
    expiresAt: { $gt: new Date() }
  });

  if (!otpRecord) {
    return makeResponse(customer, 'otp_invalid',
      'Invalid or expired code. Please request a new one by replying:\n' +
      '- "policies" to view policies\n' +
      '- "statements" to view statements\n' +
      '- "claim" to file a claim'
    );
  }

  await OTP.updateOne(
    { _id: otpRecord._id },
    { $set: { used: true }, $inc: { attempts: 1 } }
  );

  var policies = await Policy.find({ customer: customer._id });

  switch (otpRecord.purpose) {
    case 'policy_details':
      return handlePolicyDetails(customer, policies);

    case 'statement_retrieval':
      return handleStatementResponse(customer, policies);

    case 'claim_info':
      return handleClaimInit(customer, policies);

    default:
      return makeResponse(customer, 'otp_verified', 'Verified successfully.');
  }
}

function handlePolicyDetails(customer, policies) {
  if (policies.length === 0) {
    return makeResponse(customer, 'policy_list',
      'No active policies found on your account.\n\n' +
      'If you believe this is an error, reply "agent" to speak with us.',
      { policyCount: 0 }
    );
  }

  var lines = ['YOUR POLICIES', ''];
  var totalPremium = 0;

  for (var i = 0; i < policies.length; i++) {
    var p = policies[i];
    lines.push((i + 1) + '. ' + p.policyNumber + ' - ' + p.type);
    lines.push('   Status: ' + p.status);
    lines.push('   Premium: BWP ' + p.premium + '/month');
    lines.push('   Coverage: BWP ' + p.coverAmount.toLocaleString());

    if (p.type === 'Vehicle' && p.vehicleDetails) {
      lines.push('   Vehicle: ' + p.vehicleDetails.make + ' ' + p.vehicleDetails.model + ' (' + p.vehicleDetails.registration + ')');
    }
    if (p.type === 'Property' && p.propertyDetails) {
      lines.push('   Property: ' + p.propertyDetails.type + ' at ' + p.propertyDetails.address);
    }

    lines.push('');
    totalPremium += p.premium || 0;
  }

  lines.push('Total Premium: BWP ' + totalPremium.toLocaleString() + '/month');
  lines.push('');
  lines.push('Reply "menu" for more options.');

  return makeResponse(customer, 'policy_list', lines.join('\n'), {
    policyCount: policies.length
  });
}

function handleStatementResponse(customer, policies) {
  var message = generateStatement(customer, policies);
  return makeResponse(customer, 'statement', message, {
    policyCount: policies.length
  });
}

async function handleClaimInit(customer, policies) {
  if (policies.length === 0) {
    return makeResponse(customer, 'error',
      'No active policies found to file a claim against.\n\n' +
      'Reply "agent" to speak with our team.'
    );
  }

  await setSession(customer, 'awaiting_claim_policy', {});

  var lines = ['CLAIM FILING - Select a Policy', ''];

  for (var i = 0; i < policies.length; i++) {
    var p = policies[i];
    lines.push((i + 1) + '. ' + p.policyNumber + ' - ' + p.type + ' (' + p.status + ')');
  }

  lines.push('');
  lines.push('Reply with the policy number you want to file a claim on.');
  lines.push('Or reply "cancel" to cancel.');

  return makeResponse(customer, 'claim_select_policy', lines.join('\n'));
}

// ============================================================
// SESSION CONTINUATION (multi-turn flows)
// ============================================================

async function handleSessionContinuation(customer, text) {
  var session = await getSession(customer);
  if (!session) { return null; }

  switch (session.action) {
    case 'awaiting_claim_policy':
      return handleClaimPolicySelection(customer, text, session);

    case 'awaiting_claim_reason':
      return handleClaimReasonSubmission(customer, text, session);

    default:
      await clearSession(customer);
      return null;
  }
}

async function handleClaimPolicySelection(customer, text, session) {
  var policies = await Policy.find({ customer: customer._id, status: 'Active' });
  var selectedPolicy = null;

  var input = text.toUpperCase().trim();
  for (var i = 0; i < policies.length; i++) {
    if (policies[i].policyNumber.toUpperCase() === input) {
      selectedPolicy = policies[i];
      break;
    }
  }

  if (!selectedPolicy) {
    var num = parseInt(text, 10);
    if (num >= 1 && num <= policies.length) {
      selectedPolicy = policies[num - 1];
    }
  }

  if (!selectedPolicy) {
    return makeResponse(customer, 'claim_invalid_policy',
      'Policy "' + text + '" not found. Please reply with a valid policy number from the list.\n\nReply "cancel" to cancel.'
    );
  }

  await setSession(customer, 'awaiting_claim_reason', {
    policyNumber: selectedPolicy.policyNumber,
    policyType: selectedPolicy.type
  });

  return makeResponse(customer, 'claim_ask_reason',
    'You selected: ' + selectedPolicy.policyNumber + ' (' + selectedPolicy.type + ')\n\n' +
    'Please describe your claim in one message.\n\n' +
    'Example: "Windscreen cracked in parking lot on 5 July"\n\n' +
    'Or reply "cancel" to cancel.'
  );
}

async function handleClaimReasonSubmission(customer, text, session) {
  if (text.toLowerCase() === 'cancel') {
    await clearSession(customer);
    return makeResponse(customer, 'claim_cancelled',
      'Claim filing cancelled.\n\nReply "menu" to see other options.'
    );
  }

  var claimNumber = generateClaimNumber();

  try {
    await Claim.create({
      claimNumber: claimNumber,
      customerId: customer._id,
      customerPhone: customer.phone,
      policyNumber: session.data.policyNumber,
      policyType: session.data.policyType,
      description: text,
      status: 'Submitted'
    });
  } catch (err) {
    console.error('[Claim] Failed to save:', err.message);
    await clearSession(customer);
    return makeResponse(customer, 'error',
      'Something went wrong while filing your claim. Please try again or reply "agent" for help.'
    );
  }

  await clearSession(customer);

  return makeResponse(customer, 'claim_filed',
    'CLAIM FILED SUCCESSFULLY\n\n' +
    'Reference: ' + claimNumber + '\n' +
    'Policy: ' + session.data.policyNumber + ' (' + session.data.policyType + ')\n' +
    'Description: ' + text + '\n' +
    'Status: Submitted\n\n' +
    'Our team will review your claim within 3 business days.\n\n' +
    'Reply "menu" for more options or "agent" to speak with us.',
    { claimNumber: claimNumber }
  );
}

// ============================================================
// MAIN COMMAND ROUTER
// ============================================================

async function handleTextCommand(parsed) {
  var text = parsed.text;
  var customer = await findCustomer(parsed.phone);

  if (!customer) {
    return {
      action: 'reply',
      type: 'text',
      customerFound: false,
      message: 'Sorry, we could not find an account for ' + parsed.phone + '. Please contact support.',
      phone: parsed.phone
    };
  }

  // Check for active session (multi-turn flow like claim filing)
  if (text !== 'menu' && text !== 'hi' && text !== 'hello' && text !== 'cancel' && !/^\d{5}$/.test(text)) {
    var sessionResult = await handleSessionContinuation(customer, text);
    if (sessionResult) { return sessionResult; }
  }

  // Cancel clears any active session
  if (text === 'cancel') {
    await clearSession(customer);
    return makeResponse(customer, 'cancelled', 'Action cancelled.\n\nReply "menu" to see options.');
  }

  switch (text) {
    case 'hi':
    case 'hello':
    case 'menu':
      return handleMenu(customer);

    case '1':
    case 'policies':
    case 'my policies':
    case 'view policies':
      return handlePolicies(customer, parsed.phone);

    case '2':
    case 'statements':
    case 'my statements':
    case 'statement':
      return handleStatements(customer, parsed.phone);

    case '3':
    case 'claim':
    case 'claims':
    case 'file claim':
    case 'file a claim':
      return handleClaim(customer, parsed.phone);

    case '4':
    case 'reminders':
    case 'premium':
    case 'premium reminders':
      return handleReminders(customer);

    case '5':
    case 'agent':
    case 'speak to agent':
    case 'help':
      return handleAgent(customer);

    default:
      // Check if it's a 5-digit OTP code
      if (/^\d{5}$/.test(text)) {
        return handleOTPVerification(customer, text);
      }

      // Fallback
      return makeResponse(customer, 'fallback',
        'I didn\'t understand "' + text + '".\n\nReply "menu" to see available options.'
      );
  }
}

// ============================================================
// WEBHOOK ENDPOINT
// ============================================================

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

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', function (req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
