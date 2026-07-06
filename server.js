require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const healthRoutes = require('./routes/health');
const webhookRoutes = require('./routes/webhooks');
const { initCronJobs, sendClaimUpdateAlert } = require('./services/alerts');
const { cleanupExpiredOTPs } = require('./services/otp');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/health', healthRoutes);
app.use('/webhooks', webhookRoutes);

// Root — basic info
app.get('/', (req, res) => {
  res.json({
    service: 'Insurance Demo — WhatsApp Chatbot',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      webhook: '/webhooks/respondio (POST)'
    },
    timestamp: new Date().toISOString()
  });
});

// Manual trigger endpoints (for testing without cron)
app.post('/admin/trigger-premium-alerts', async (req, res) => {
  const { sendPremiumDueAlerts } = require('./services/alerts');
  const count = await sendPremiumDueAlerts();
  res.json({ triggered: true, alertsSent: count });
});

app.post('/admin/trigger-claim-alert', async (req, res) => {
  const { customerId, claimId, policyId, status, details } = req.body;
  if (!customerId || !claimId || !policyId || !status) {
    return res.status(400).json({ error: 'Missing required fields: customerId, claimId, policyId, status' });
  }
  const result = await sendClaimUpdateAlert(customerId, claimId, policyId, status, details);
  res.json({ triggered: true, result });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Start server ─────────────────────────────────────────────────────────────
async function start() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('FATAL: MONGO_URI not set in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log(`[DB] Connected to MongoDB (${mongoose.connection.host})`);

    // Initialize cron jobs
    initCronJobs();

    app.listen(PORT, () => {
      console.log(`[Server] Running on port ${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/health`);
      console.log(`[Server] Webhook: http://localhost:${PORT}/webhooks/respondio`);
    });
  } catch (err) {
    console.error('FATAL: Failed to start:', err.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down...');
  await mongoose.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n[Server] SIGINT received, shutting down...');
  await mongoose.disconnect();
  process.exit(0);
});

start();