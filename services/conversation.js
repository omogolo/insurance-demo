require('dotenv').config();
const axios = require('axios');

const RESPONDIO_API_TOKEN = process.env.RESPONDIO_API_TOKEN;
const RESPONDIO_BASE = 'https://api.respond.io/v2';

const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheFromWebhook(payload) {
  const phone = payload.contact?.phone;
  const contactId = payload.contact?.id;
  
  let channelId = payload.channel?.id || payload.message?.channelId;
  if (typeof channelId === 'string' && channelId.startsWith('$')) {
    channelId = process.env.RESPONDIO_WHATSAPP_CHANNEL_ID;
  }

  // Global Webhook doesn't pass conversationId, so we set it to null here
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

async function getConversationId(phone) {
  const now = Date.now();
  for (const [key, val] of cache) {
    if (val.expiresAt < now) cache.delete(key);
  }

  const cached = cache.get(phone);
  
  // If we already have it cached, return it immediately
  if (cached?.conversationId) {
    return cached.conversationId;
  }

  if (!cached?.contactId || !cached?.channelId) {
    console.warn(`[ConvCache] Missing contactId or channelId for ${phone}`);
    return null;
  }

  if (!RESPONDIO_API_TOKEN) {
    console.warn('[ConvCache] RESPONDIO_API_TOKEN not set');
    return null;
  }

  try {
    // CORRECTED Respond.io v2 API Endpoint for fetching conversations
    const url = `${RESPONDIO_BASE}/conversations`;
    console.log(`[ConvCache] Fetching via API -> contactId: ${cached.contactId}, channelId: ${cached.channelId}`);
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${RESPONDIO_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        contactId: String(cached.contactId),
        channelId: String(cached.channelId)
      },
      timeout: 10000
    });

    const conversations = response.data?.data || [];
    const conv = conversations[0];

    if (conv?.id) {
      cache.set(phone, {
        ...cached,
        conversationId: String(conv.id),
        expiresAt: Date.now() + CACHE_TTL_MS
      });
      console.log(`[ConvCache] SUCCESS! Resolved conversation ${conv.id} for ${phone}`);
      return String(conv.id);
    }

    // If we get here, the API worked but returned 0 conversations
    console.warn(`[ConvCache] API returned 0 conversations. Full response:`, JSON.stringify(response.data));
    return null;

  } catch (err) {
    // If we get here, the API rejected the request (404, 401, etc.)
    console.error(`[ConvCache] API FAILED for ${phone}. Status: ${err.response?.status}, Error:`, JSON.stringify(err.response?.data));
    return null;
  }
}

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
