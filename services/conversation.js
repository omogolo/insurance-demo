const axios = require('axios');
require('dotenv').config();

const RESPONDIO_API_TOKEN = process.env.RESPONDIO_API_TOKEN;
const RESPONDIO_BASE = 'https://api.respond.io/v2';

/**
 * In-memory cache: phone → { contactId, channelId, conversationId, expiresAt }
 * TTL = 24 hours per entry.
 */
const cache = new Map();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Extract contactId and channelId from an incoming webhook payload
 * and store them in the cache keyed by phone number.
 */
function cacheFromWebhook(payload) {
  const phone = payload.contact?.phone;
  const contactId = payload.contact?.id;
  const channelId = payload.channel?.id || payload.message?.channelId;

  if (phone && contactId && channelId) {
    const existing = cache.get(phone);
    cache.set(phone, {
      contactId,
      channelId,
      conversationId: existing?.conversationId || null,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
  }
}

/**
 * Resolve a phone number to a Respond.io conversation ID.
 * 1. Check cache
 * 2. Call Respond.io API: GET /contacts/{contactId}/conversations?channelId={channelId}
 * 3. Cache the result
 *
 * @param {string} phone — e.g. "+919876543210"
 * @returns {string|null} — conversation ID or null if not found
 */
async function getConversationId(phone) {
  // Clean expired entries
  const now = Date.now();
  for (const [key, val] of cache) {
    if (val.expiresAt < now) cache.delete(key);
  }

  const cached = cache.get(phone);
  if (cached?.conversationId) {
    return cached.conversationId;
  }

  if (!cached?.contactId || !cached?.channelId) {
    console.warn(`[ConvCache] No contactId/channelId cached for ${phone}`);
    return null;
  }

  if (!RESPONDIO_API_TOKEN) {
    console.warn('[ConvCache] RESPONDIO_API_TOKEN not set, cannot resolve conversation');
    return null;
  }

  try {
    const response = await axios.get(
      `${RESPONDIO_BASE}/contacts/${cached.contactId}/conversations`,
      {
        headers: {
          'Authorization': `Bearer ${RESPONDIO_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        params: {
          channelId: cached.channelId
        },
        timeout: 10000
      }
    );

    const conversations = response.data?.data || [];
    const conv = conversations[0];

    if (conv?.id) {
      cache.set(phone, {
        ...cached,
        conversationId: String(conv.id),
        expiresAt: Date.now() + CACHE_TTL_MS
      });
      console.log(`[ConvCache] Resolved conversation ${conv.id} for ${phone}`);
      return String(conv.id);
    }

    console.warn(`[ConvCache] No conversation found for contact ${cached.contactId} on channel ${cached.channelId}`);
    return null;
  } catch (err) {
    console.error(`[ConvCache] API lookup failed for ${phone}:`, err.response?.data || err.message);
    return null;
  }
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