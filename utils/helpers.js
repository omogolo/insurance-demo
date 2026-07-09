/**
 * Format currency in Botswana Pula (P1,234.00)
 */
function formatCurrency(amount) {
  return 'P' + Number(amount).toLocaleString('en-BW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Format date to readable string
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Generate a random 5-digit OTP
 */
function generateOTP() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

/**
 * Truncate text for WhatsApp (max 4096 chars)
 */
function truncateForWhatsApp(text, maxLen = 4000) {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 50) +
    '\n\n_(Message truncated. Reply "full" for complete details.)_';
}

/**
 * Normalize phone number to +267XXXXXXXX format
 */
function normalizePhone(raw) {
  if (!raw) return null;
  let cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
}

/**
 * Generate phone number variants for DB lookup.
 * Handles cases where DB might store +267... or 267...
 */
function getPhoneVariants(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  const digits = normalized.replace('+', '');
  const variants = new Set([normalized]);

  // Without +
  variants.add(digits);

  // Just local number (last 8 digits for Botswana)
  if (digits.length >= 11) {
    variants.add('+' + digits.slice(-11));  // +267XXXXXXXX
    variants.add(digits.slice(-11));         // 267XXXXXXXX
  }

  return [...variants];
}

/**
 * Build a policy summary line for WhatsApp
 */
function policySummaryLine(policy) {
  const statusEmoji = {
    'Active': '🟢', 'Pending': '🟡', 'Lapsed': '🔴',
    'Claimed': '🟠', 'Matured': '🔵', 'Cancelled': '⚫'
  };
  const emoji = statusEmoji[policy.status] || '⚪';

  return `${emoji} *${policy.policyId}* — ${policy.type}\n` +
    `   Status: ${policy.status} | SI: P${policy.coverage.sumInsured?.toLocaleString() || 'N/A'}\n` +
    `   Premium: P${policy.premium.amount.toLocaleString()} (${policy.premium.frequency})`;
}

/**
 * Build a statement message for WhatsApp
 */
function buildStatementMessage(customer, statement) {
  let msg = `📋 *STATEMENT OF ACCOUNT*\n`;
  msg += `──────────────────────\n`;
  msg += `Customer: *${customer.name}*\n`;
  msg += `Statement: ${statement.statementId}\n`;
  msg += `Policy: ${statement.policyId}\n`;
  msg += `Period: ${formatDate(statement.period.from)} to ${formatDate(statement.period.to)}\n`;
  msg += `──────────────────────\n\n`;

  if (statement.transactions && statement.transactions.length > 0) {
    statement.transactions.forEach((txn) => {
      msg += `📅 ${formatDate(txn.date)} | ${txn.type}\n`;
      msg += `   ${txn.description}\n`;
      msg += `   Amount: P${txn.amount.toFixed(2)} | Balance: P${txn.runningBalance.toFixed(2)}\n\n`;
    });
  }

  if (statement.summary) {
    msg += `──────────────────────\n`;
    msg += `*Summary:*\n`;
    msg += `  Premiums Paid: P${statement.summary.totalPremiumPaid.toFixed(2)}\n`;
    msg += `  Claims Settled: P${statement.summary.totalClaimsSettled.toFixed(2)}\n`;
    msg += `  Outstanding: *P${statement.summary.outstandingBalance.toFixed(2)}*\n`;
  }

  return msg;
}

module.exports = {
  formatCurrency,
  formatDate,
  generateOTP,
  truncateForWhatsApp,
  normalizePhone,
  getPhoneVariants,
  policySummaryLine,
  buildStatementMessage
};
