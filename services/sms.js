const axios = require('axios');

const TEXTBW_URL = 'https://api.textbw.com/web_rest/api/sendSMS';
const USERNAME = process.env.TEXTBW_USERNAME || 'demo_otp';
const PASSWORD = process.env.TEXTBW_PASSWORD || '4eb:a901%14';
const SENDER_ID = process.env.TEXTBW_SENDER_ID || 'Demo-OTP';

/**
 * Send OTP via TextBW SMS API
 * @param {string} phone - Phone number from DB (e.g., "+26771234567")
 * @param {string} otp - 5-digit OTP
 * @returns {object} - { success: boolean, message: string }
 */
async function sendOTPSMS(phone, otp) {
  // TextBW requires country code only (no '+')
  const cleanPhone = phone.replace(/^\+/, '');

  const payload = {
    username: USERNAME,
    password: PASSWORD,
    from: SENDER_ID,
    mobile_number: cleanPhone,
    data: `Your InsureBot verification code is ${otp}. Valid for 1 hour.`
  };

  try {
    const response = await axios.post(TEXTBW_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    const status = response.data?.status;

    if (status === 200 || status === '200') {
      console.log(`[SMS] OTP sent successfully to ${cleanPhone}`);
      return { success: true, message: 'SMS sent' };
    } 
    
    // Handle specific TextBW error codes
    if (status === 401 || status === '401') {
      return { success: false, message: '⚠️ SMS service authentication failed. Please contact support.' };
    }
    if (status === 501 || status === '501') {
      return { success: false, message: '⚠️ Our SMS service is temporarily unavailable. Please try again later.' };
    }
    if (status === 500 || status === '500') {
      return { success: false, message: "⚠️ We couldn't send your OTP due to a network error. Please try again." };
    }

    // Fallback for unknown statuses
    console.error(`[SMS] Unknown status from TextBW:`, response.data);
    return { success: false, message: "⚠️ An unknown SMS error occurred. Please try again." };

  } catch (err) {
    console.error(`[SMS] Network error sending to ${cleanPhone}:`, err.message);
    return { success: false, message: "⚠️ We couldn't send your OTP due to a network error. Please try again." };
  }
}

module.exports = { sendOTPSMS };
