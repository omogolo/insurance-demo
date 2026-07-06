const Policy = require('../models/Policy');
const Customer = require('../models/Customer');
const { sendTemplateMessage } = require('./whatsapp');
const { formatCurrency, formatDate } = require('../utils/helpers');
const cron = require('node-cron');

/**
 * Check for policies with premiums due within the next 7 days
 * and send alert templates via WhatsApp.
 * Designed to run daily at 08:00.
 */
async function sendPremiumDueAlerts() {
  console.log('[Alerts] Checking for due premiums...');

  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const duePolicies = await Policy.find({
    status: 'Active',
    nextPremiumDue: {
      $lte: sevenDaysFromNow,
      $gte: new Date()
    }
  }).populate('customerId');

  if (duePolicies.length === 0) {
    console.log('[Alerts] No premiums due in next 7 days');
    return 0;
  }

  console.log(`[Alerts] Found ${duePolicies.length} policies with due premiums`);

  // Group by customer to avoid duplicate lookups
  const customerMap = new Map();
  for (const policy of duePolicies) {
    const custId = typeof policy.customerId === 'object' ? policy.customerId.customerId : policy.customerId;
    if (!customerMap.has(custId)) {
      const customer = await Customer.findOne({ customerId: custId });
      customerMap.set(custId, customer);
    }
  }

  let sent = 0;
  for (const policy of duePolicies) {
    const custId = typeof policy.customerId === 'object' ? policy.customerId.customerId : policy.customerId;
    const customer = customerMap.get(custId);
    if (!customer) continue;

    // In production, you'd look up the conversation ID from Respond.io
    // For now, we log and use a placeholder
    const conversationId = `conv_${custId}`; // Replace with actual lookup

    const result = await sendTemplateMessage(
      conversationId,
      'premium_due_alert',
      [
        customer.name,
        policy.type,
        policy.policyId,
        formatCurrency(policy.premium.amount),
        formatDate(policy.nextPremiumDue)
      ]
    );

    if (result.success || result.skipped) sent++;
  }

  console.log(`[Alerts] Sent ${sent} premium due alerts`);
  return sent;
}

/**
 * Manually trigger a claim update alert for a specific claim.
 * @param {string} customerId
 * @param {string} claimId
 * @param {string} policyId
 * @param {string} newStatus
 * @param {string} details
 */
async function sendClaimUpdateAlert(customerId, claimId, policyId, newStatus, details = '') {
  const customer = await Customer.findOne({ customerId });
  if (!customer) {
    console.error(`[Alerts] Customer ${customerId} not found`);
    return false;
  }

  const conversationId = `conv_${customerId}`; // Replace with actual lookup

  const result = await sendTemplateMessage(
    conversationId,
    'claim_update_alert',
    [
      customer.name,
      claimId,
      policyId,
      newStatus,
      details || 'Please contact support for more information.'
    ]
  );

  console.log(`[Alerts] Claim update alert sent for ${claimId}: ${newStatus}`);
  return result.success || result.skipped;
}

/**
 * Initialize cron jobs.
 * Call this once from server.js after DB connection.
 */
function initCronJobs() {
  // Daily at 08:00 — check for due premiums
  cron.schedule('0 8 * * *', () => {
    console.log('[Cron] 08:00 — Premium due check');
    sendPremiumDueAlerts().catch(err => {
      console.error('[Cron] Premium due alert error:', err.message);
    });
  }, {
    timezone: 'Asia/Kolkata'
  });

  // Daily at 03:00 — cleanup expired OTPs
  cron.schedule('0 3 * * *', async () => {
    const { cleanupExpiredOTPs } = require('./otp');
    await cleanupExpiredOTPs();
  }, {
    timezone: 'Asia/Kolkata'
  });

  console.log('[Cron] Jobs initialized (premium due at 08:00, OTP cleanup at 03:00 IST)');
}

module.exports = {
  sendPremiumDueAlerts,
  sendClaimUpdateAlert,
  initCronJobs
};