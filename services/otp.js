const OTP = require('../models/OTP');
const { generateOTP } = require('../utils/helpers');

/**
 * Generate and store a new 5-digit OTP for a customer.
 * Returns the OTP string (to be sent via WhatsApp template).
 */
async function createOTP(customerId, purpose = 'statement_retrieval') {
  // Invalidate any existing unused OTPs for this customer + purpose
  await OTP.updateMany(
    { customerId, purpose, used: false, expiresAt: { $gt: new Date() } },
    { used: true, usedReason: 'superseded' }
  );

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const record = new OTP({
    customerId,
    otp,
    purpose,
    expiresAt,
    used: false,
    attempts: 0,
    maxAttempts: 3
  });

  await record.save();
  console.log(`[OTP] Created ${otp} for ${customerId} (${purpose}), expires ${expiresAt.toISOString()}`);
  return otp;
}

/**
 * Validate an OTP attempt.
 * Returns { valid: boolean, reason: string }
 */
async function validateOTP(customerId, otpInput, purpose = 'statement_retrieval') {
  const record = await OTP.findOne({
    customerId,
    purpose,
    used: false,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 }); // Get the latest active OTP

  if (!record) {
    return { valid: false, reason: 'no_active_otp' };
  }

  // Increment attempt counter
  record.attempts += 1;

  if (record.attempts > record.maxAttempts) {
    record.used = true;
    record.usedReason = 'max_attempts_exceeded';
    await record.save();
    return { valid: false, reason: 'max_attempts_exceeded' };
  }

  if (record.otp !== otpInput.trim()) {
    await record.save();
    const remaining = record.maxAttempts - record.attempts;
    return { valid: false, reason: 'incorrect', remainingAttempts: remaining };
  }

  // Valid OTP — mark as used
  record.used = true;
  record.usedReason = 'validated';
  await record.save();
  console.log(`[OTP] Validated ${otpInput} for ${customerId}`);
  return { valid: true, reason: 'validated' };
}

/**
 * Clean up expired OTPs (called by cron or manually)
 */
async function cleanupExpiredOTPs() {
  const result = await OTP.deleteMany({ expiresAt: { $lte: new Date() } });
  console.log(`[OTP] Cleaned up ${result.deletedCount} expired OTPs`);
  return result.deletedCount;
}

module.exports = {
  createOTP,
  validateOTP,
  cleanupExpiredOTPs
};