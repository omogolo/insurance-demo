/**
 * Format currency in Indian notation (₹1,23,456.00)
 */
function formatCurrency(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

/**
 * Format date to readable string
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

/**
 * Generate a random 5-digit OTP
 */
function generateOTP() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

/**
 * Truncate text for WhatsApp messages (keep under 4096 chars)
 */
function truncateForWhatsApp(text, maxLen = 4000) {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 50) + '\n\n_(Message truncated. Reply "full" for complete details.)_';
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
    `   Status: ${policy.status} | SI: ${formatCurrency(policy.sumInsured)}\n` +
    `   Premium: ${formatCurrency(policy.premium.amount)} (${policy.premium.frequency})`;
}

/**
 * Build a statement message for WhatsApp
 */
function buildStatementMessage(statement, customer) {
  let msg = `📋 *STATEMENT OF ACCOUNT*\n`;
  msg += `─────────────────────\n`;
  msg += `Customer: ${customer.name}\n`;
  msg += `Statement: ${statement.statementId}\n`;
  msg += `Period: ${formatDate(statement.period.from)} to ${formatDate(statement.period.to)}\n`;
  msg += `─────────────────────\n\n`;

  msg += `*Summary:*\n`;
  msg += `  Premium Paid: ${formatCurrency(statement.summary.totalPremiumPaid)}\n`;
  msg += `  Claims Settled: ${formatCurrency(statement.summary.totalClaimsSettled)}\n`;
  msg += `  Refunds: ${formatCurrency(statement.summary.totalRefunds)}\n`;
  msg += `  Outstanding: ${formatCurrency(statement.summary.outstandingBalance)}\n\n`;

  msg += `*Recent Transactions:*\n`;
  // Show last 8 transactions max for WhatsApp readability
  const recentTxns = statement.transactions.slice(-8);
  for (const txn of recentTxns) {
    const sign = txn.amount >= 0 ? '+' : '';
    msg += `${formatDate(txn.date)} | ${txn.type}\n`;
    msg += `  ${sign}${formatCurrency(txn.amount)} (Bal: ${formatCurrency(txn.runningBalance)})\n`;
  }

  if (statement.transactions.length > 8) {
    msg += `\n_...and ${statement.transactions.length - 8} earlier transactions_`;
  }

  return truncateForWhatsApp(msg);
}

module.exports = {
  formatCurrency,
  formatDate,
  generateOTP,
  truncateForWhatsApp,
  policySummaryLine,
  buildStatementMessage
};