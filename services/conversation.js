require('dotenv').config();

/**
 * In-memory cache: phone -> { contactId, channelId, conversationId, expiresAt }
 * TTL = 24 hours per entry.
 */
const cache = new Map();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Extract contactId, channelId, and conversationId from an incoming webhook payload
 * and store them in the cache keyed by phone number.
 */
function cacheFromWebhook(payload) {
  const phone = payload.contact?.phone;
  const contactId = payload.contact?.id;
  
  // Handle channel ID mapping (fallback to env if Workflow fails to map $channel.id)
  let channelId = payload.channel?.id || payload.message?.channelId;
  if (typeof channelId === 'string' && channelId.startsWith('$')) {
    channelId = process.env.RESPONDIO_WHATSAPP_CHANNEL_ID;
  }

  // GRAB THE CONVERSATION ID DIRECTLY FROM THE WORKFLOW PAYLOAD
  const conversationId = payload.conversationId || null;

  if (phone && contactId && channelId) {
    const existing = cache.get(phone);
    cache.set(phone, {
      contactId,
      channelId,
      conversationId: conversationId || existing?.conversationId || null,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
  }
}

/**
 * Resolve a phone number to a Respond.io conversation ID.
 * 
 * V2.0 Architecture: We no longer make an API call to Respond.io to look up the 
 * conversation ID. The Respond.io Workflow now passes the conversationId 
 * directly in the webhook payload, which we cache and use here.
 * 
 * @param {string} phone — e.g. "+26771234567"
 * @returns {string|null} — conversation ID or null if not found
 */
async function getConversationId(phone) {
  // Clean expired entries
  const now = Date.now();
  for (const [key, val] of cache) {
    if (val.expiresAt < now) cache.delete(key);
  }

  const cached = cache.get(phone);
  
  // Return the conversation ID if the Workflow successfully passed it to us
  if (cached?.conversationId) {
    return cached.conversationId;
  }

  // If we don't have it, we can't proceed with sending the message
  console.warn(`[ConvCache] No conversation ID found for ${phone}. Ensure the Workflow JSON includes "conversationId": "$conversation.id"`);
  return null;
}

/**
 * Debug helper: dump cache contents
 */
function getCacheStats() {
  return {
    size: cache.size,
    entries: Array.from(cache.entries()).map(([phone, data]) => ({
      phone,
      contactId: data.contactId,
      channelId: data.channelId,
      hasConversationId: !!data.conversationId,
      expiresAt: new Date(data.expiresAt).toISOString()
    }))
  };
}

module.exports = {
  cache: cache,
  cacheFromWebhook,
  getConversationId,
  getCacheStats
};
