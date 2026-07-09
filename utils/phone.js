// utils/phone.js
/**
 * Normalize phone numbers to a consistent format.
 * Respond.io may send: +267..., 267..., 00267...
 * MongoDB may store: +27..., +267...
 */
function normalizePhone(raw) {
  if (!raw) return null;
  // Strip all non-digits except leading +
  let cleaned = raw.replace(/[^\d+]/g, '');
  // Remove leading 00, replace with +
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
  // Add + if missing
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
}

/**
 * Try multiple phone formats when looking up a customer.
 * Botswana: +267 | South Africa: +27
 */
function getPhoneVariants(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  const digits = normalized.replace('+', '');
  const variants = [normalized];
  // Try without country code
  if (digits.length > 9) {
    variants.push('+' + digits.slice(-9)); // Just the local number
  }
  // Try common country code variants
  const countryCode = digits.slice(0, 3);
  const localNumber = digits.slice(3);
  if (countryCode === '267') {
    variants.push('+27' + localNumber); // Try SA format
  } else if (countryCode === '27') {
    variants.push('+267' + localNumber); // Try BW format
  }
  return [...new Set(variants)]; // Deduplicate
}

module.exports = { normalizePhone, getPhoneVariants };
