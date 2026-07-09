const Policy = require('../models/Policy');
const Customer = require('../models/Customer');
const { formatCurrency, formatDate } = require('../utils/helpers');
const cron = require('node-cron');

const TIMEZONE = 'Africa/Gaborone';

/**
 * Check for policies with premiums due within 7 days.
 * In v2.0, this logs alerts but does NOT send WhatsApp messages directly.
 * In a production system, this would trigger the Respond.io workflow
 * or use the Response Mapping pattern.
 */
async function sendPremiumDueAlerts() {
  console.log(`[Cron] ${new Date().toISOString()} — Premium due check`);

  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const duePolicies = await Policy.find({
    status: 'Active',
    'premium.nextDue': {
      $lte: sevenDaysFromNow,
      $gte: new Date()
    }
  });

  if (duePolicies.length === 0) {
    console.log('[Cron] No premiums due in next 7 days');
    return 0;
  }

  console.log(`[Cron] Found ${duePolicies.length} policies with due premiums`);

  // Group by customerId to avoid duplicate customer lookups
  const customerCache = new Map();
  for (const policy of duePolicies) {
    if (!customerCache.has(policy.customerId)) {
      customerCache.set(policy.customerId, await Customer.findOne({ customerId: policy.customerId }));
    }
    const customer = customerCache.get(policy.customerId);
    if (customer) {
      console.log(
        `[Cron] ALERT: ${customer.name} — ${policy.policyId} (${policy.type}) ` +
        `premium P${policy.premium.amount} due ${formatDate(policy.premium.nextDue)}`
      );
      // In production: send via Respond.io API or trigger workflow here
    }
  }

  return duePolicies.length;
}

/**
 * Initialize all cron jobs.
 * Safe to call multiple times.
 */
let cronInitialized = false;

function initCronJobs() {
  if (cronInitialized) {
    console.log('[Cron] Already initialized, skipping');
    return;
  }

  // Daily premium due check at 08:00 CAT
  const valid = cron.validate('0 8 * * *');
  if (!valid) {
    console.error('[Cron] Invalid schedule expression');
    return;
  }

  cron.schedule('0 8 * * *', () => {
    sendPremiumDueAlerts().catch(err => {
      console.error('[Cron] Premium due alert error:', err.message);
    });
  }, {
    timezone: TIMEZONE
  });

  // Expired OTP cleanup at 03:00 CAT
  cron.schedule('0 3 * * *', () => {
    const OTP = require('../models/OTP');
    OTP.deleteMany({
      used: true,
      expiresAt: { $lt: new Date() }
    }).then(result => {
      console.log(`[Cron] Cleaned ${result.deletedCount} expired OTPs`);
    }).catch(err => {
      console.error('[Cron] OTP cleanup error:', err.message);
    });
  }, {
    timezone: TIMEZONE
  });

  cronInitialized = true;
  console.log(`[Cron] Jobs initialized (timezone: ${TIMEZONE})`);
}

/**
 * Manual trigger for claim update alerts.
 */
async function sendClaimUpdateAlert({ customerId, claimId, policyId, status, details }) {
  console.log(`[Alerts] Claim update: ${claimId} → ${status}`);
  // In v2.0, this would return data for Respond.io Response Mapping
  // For now, just log it
  return {
    message: `Claim ${claimId} on policy ${policyId} updated to ${status}.`,
    details
  };
}

module.exports = { initCronJobs, sendPremiumDueAlerts, sendClaimUpdateAlert };
