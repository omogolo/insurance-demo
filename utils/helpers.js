function formatCurrency(amount) {
  // Changed to BWP (Pula) formatting
  return 'P' + Number(amount).toLocaleString('en-BW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function generateOTP() { return String(Math.floor(10000 + Math.random() * 90000)); }

function truncateForWhatsApp(text, maxLen = 4000) {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 50) + '\n\n_(Message truncated)_';
}

function policySummaryLine(policy) {
  const statusEmoji = { 'Active': '🟢', 'Pending': '🟡', 'Lapsed': '🔴', 'Claimed': '🟠', 'Matured': '🔵', 'Cancelled': '⚫' };
  const emoji = statusEmoji[policy.status] || '⚪';
  return `${emoji} *${policy.policyId}* — ${policy.type}\n   Status: ${policy.status} | SI: ${formatCurrency(policy.sumInsured)}\n   Premium: ${formatCurrency(policy.premium.amount)} (${policy.premium.frequency})`;
}

function buildStatementMessage(statement, customer) {
  let msg = `📋 *STATEMENT OF ACCOUNT*\n─────────────────────\nCustomer: ${customer.name}\nStatement: ${statement.statementId}\nPeriod: ${formatDate(statement.period.from)} to ${formatDate(statement.period.to)}\n─────────────────────\n\n`;
  msg += `*Summary:*\n  Premium Paid: ${formatCurrency(statement.summary.totalPremiumPaid)}\n  Claims Settled: ${formatCurrency(statement.summary.totalClaimsSettled)}\n  Outstanding: ${formatCurrency(statement.summary.outstandingBalance)}\n\n*Recent Transactions:*\n`;
  const recentTxns = statement.transactions.slice(-6);
  for (const txn of recentTxns) {
    const sign = txn.amount >= 0 ? '+' : '';
    msg += `${formatDate(txn.date)} | ${txn.type}\n  ${sign}${formatCurrency(txn.amount)} (Bal: ${formatCurrency(txn.runningBalance)})\n`;
  }
  return truncateForWhatsApp(msg);
}

module.exports = { formatCurrency, formatDate, generateOTP, truncateForWhatsApp, policySummaryLine, buildStatementMessage };
