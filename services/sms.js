const axios = require('axios');

const TEXTBW_URL = 'https://api.textbw.com/web_rest/api/sendSMS';
const SMS_TIMEOUT_MS = 10000;

/**
 * Send OTP via TextBW SMS API.
 * Returns { success: boolean, errorReply?: string }
 */
async function sendSMS(mobileNumber, otp) {
  const username = process.env.TEXTBW_USERNAME;
  const password = process.env.TEXTBW_PASSWORD;
  const senderId = process.env.TEXTBW_SENDER_ID || 'Demo-OTP';

  // Validate config
  if (!username || !password) {
    console.error('[SMS] TEXTBW_USERNAME or TEXTBW_PASSWORD not set');
    return {
      success: false,
      errorReply: '⚠️ SMS service is not configured. Please contact support.'
    };
  }

  // TextBW requires country code only (no + sign)
  const cleanNumber = String(mobileNumber).replace('+', '');

  try {
    const response = await axios.post(TEXTBW_URL, {
      username,
      password,
      from: senderId,
      mobile_number: cleanNumber,
      data: `Your InsureBot verification code is ${otp}. Valid for 1 hour.`
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: SMS_TIMEOUT_MS
    });

    console.log(`[SMS] Sent to ${cleanNumber}, status: ${response.data?.status}`);

    switch (response.data?.status) {
      case 200:
      case '200':
        return { success: true };

      case 401:
      case '401':
        return {
          success: false,
          errorReply: '⚠️ SMS service authentication failed. Please contact support.'
        };

      case 500:
      case '500':
        return {
          success: false,
          errorReply: '⚠️ Could not send OTP due to a network error. Please try again.'
        };

      case 501:
      case '501':
        return {
          success: false,
          errorReply: '⚠️ SMS service is temporarily unavailable. Please try again later.'
        };

      default:
        console.error(`[SMS] Unexpected status: ${response.data?.status}`, response.data);
        return {
          success: false,
          errorReply: '⚠️ Could not send OTP. Please try again later.'
        };
    }
  } catch (error) {
    console.error(`[SMS] Request failed: ${error.message}`);
    return {
      success: false,
      errorReply: '⚠️ Could not send OTP due to a network error. Please try again.'
    };
  }
}

module.exports = { sendSMS };
