const axios = require('axios');
const { getConversationId } = require('./conversation');
require('dotenv').config();

const RESPONDIO_API_TOKEN = process.env.RESPONDIO_API_TOKEN;
const RESPONDIO_BASE = 'https://api.respond.io/v2';

/**
 * Send a plain text message via Respond.io.
 * Resolves conversation ID from phone number automatically.
 *
 * @param {string} phone — Customer phone number (e.g. "+919876543210")
 * @param {string} text — Message text with WhatsApp formatting
 */
async function sendTextMessage(phone, text) {
  if (!RESPONDIO_API_TOKEN) {
    console.warn('[WhatsApp] Skipping send — RESPONDIO_API_TOKEN not configured');
    return { skipped: true, reason: 'not_configured' };
  }

  const conversationId = await getConversationId(phone);
  if (!conversationId) {
    console.error(`[WhatsApp] Cannot resolve conversation ID for ${phone}`);
    return { skipped: true, reason: 'no_conversation_id' };
  }

  // Get channelId from cache for the send payload
  const { cache: convCache } = require('./conversation');
  const cached = convCache.get(phone);
  const channelId = cached?.channelId;

  try {
    const body = {
      message: {
        type: 'text',
        payload: { text }
      }
    };
    // Include channelId if available (some Respond.io versions require it)
    if (channelId) {
      body.channelId = channelId;
    }

    const response = await axios.post(
      `${RESPONDIO_BASE}/conversations/${conversationId}/messages`,
      body,
      {
        headers: {
          'Authorization': `Bearer ${RESPONDIO_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    console.log(`[WhatsApp] Text sent to ${phone} (conv: ${conversationId})`);
    return { success: true, data: response.data };
  } catch (err) {
    console.error(`[WhatsApp] Send failed for ${phone}:`, err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a Meta-approved WhatsApp template message via Respond.io.
 * Falls back to plain text if the template send fails (common during dev
 * before Meta approves your templates).
 *
 * @param {string} phone — Customer phone number
 * @param {string} templateName — e.g. "otp_delivery", "premium_due_alert"
 * @param {string[]} parameters — Template parameter values
 */
async function sendTemplateMessage(phone, templateName, parameters = []) {
  if (!RESPONDIO_API_TOKEN) {
    console.warn('[WhatsApp] Skipping template send — not configured');
    return { skipped: true, reason: 'not_configured' };
  }

  const conversationId = await getConversationId(phone);
  if (!conversationId) {
    console.error(`[WhatsApp] Cannot resolve conversation ID for ${phone}`);
    return { skipped: true, reason: 'no_conversation_id' };
  }

  const { cache: convCache } = require('./conversation');
  const cached = convCache.get(phone);
  const channelId = cached?.channelId;

  const bodyComponents = parameters.map(param => ({
    type: 'text',
    text: String(param)
  }));

  try {
    const body = {
      message: {
        type: 'hsm',
        payload: {
          templateName: templateName,
          language: { code: 'en', policy: 'deterministic' },
          components: [
            {
              type: 'body',
              parameters: bodyComponents
            }
          ]
        }
      }
    };
    if (channelId) {
      body.channelId = channelId;
    }

    const response = await axios.post(
      `${RESPONDIO_BASE}/conversations/${conversationId}/messages`,
      body,
      {
        headers: {
          'Authorization': `Bearer ${RESPONDIO_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    console.log(`[WhatsApp] Template "${templateName}" sent to ${phone} (conv: ${conversationId})`);
    return { success: true, data: response.data };
  } catch (err) {
    console.error(`[WhatsApp] Template "${templateName}" failed for ${phone}:`, err.response?.data || err.message);

    // ─── Fallback: plain text ────────────────────────────────────────────
    console.log(`[WhatsApp] Falling back to plain text for template "${templateName}"...`);
    let fallbackText = buildFallbackText(templateName, parameters);
    if (fallbackText) {
      return await sendTextMessage(phone, fallbackText);
    }
    return { success: false, error: err.message };
  }
}

/**
 * Build human-readable fallback text when Meta template is unavailable.
 */
function buildFallbackText(templateName, params) {
  switch (templateName) {
    case 'otp_delivery':
      return (
        `🔐 *Verification Code*\n\n` +
        `Your verification code is *${params[0]}*. Valid for 1 hour.\n\n` +
        `Do not share this code with anyone.`
      );
    case 'premium_due_alert':
      return (
        `💰 *Premium Due Reminder*\n\n` +
        `Hi ${params[0]}, your ${params[1]} policy (${params[2]}) premium of ${params[3]} is due on ${params[4]}.\n\n` +
        `Pay now to keep your coverage active.`
      );
    case 'claim_update_alert':
      return (
        `📄 *Claim Update*\n\n` +
        `Hi ${params[0]}, your claim ${params[1]} on policy ${params[2]} has been updated to: *${params[3]}*\n\n` +
        `Details: ${params[4]}`
      );
    default:
      return null;
  }
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage
};