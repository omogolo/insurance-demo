require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const healthRoutes = require('./routes/health');
const webhookRoutes = require('./routes/webhooks');
const { initCronJobs } = require('./services/alerts');

const app = express();
const HOST = '0.0.0.0';  // Railway requirement
const PORT = process.env.PORT || 3000;

// ─── Error Logging (non-fatal) ─────────────────────────────────────────
// DO NOT call process.exit() here. Railway restarts are expensive.
process.on('uncaughtException', (err) => {
  console.error('[FATAL] UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
  // Let the process continue — Railway will detect unhealthiness via its own mechanisms
});

process.on('unhandledRejection', (reason) => {
  console.error('[WARN] UNHANDLED REJECTION:', reason);
  // Don't exit. Log and continue.
});

// ─── Middleware ───────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request timeout (30 seconds)
app.use((req, res, next) => {
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────
app.use('/health', healthRoutes);
app.use('/webhooks', webhookRoutes);

// Root — basic info
app.get('/', (req, res) => {
  res.json({
    service: 'InsureBot v2.0 — BWP',
    version: '2.0.0',
    endpoints: {
      health: '/health',
      webhook: '/webhooks/respondio (POST)'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server FIRST, then connect DB ──────────────────────────────
// This ensures Railway's proxy can reach the /health endpoint immediately,
// even if MongoDB takes a few seconds to connect.
app.listen(PORT, HOST, () => {
  console.log(`[Server] Running on ${HOST}:${PORT}`);

  // Connect DB after server is listening
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      console.log('[DB] Connected to MongoDB');
      initCronJobs();  // Safe now that DB is connected
    })
    .catch((err) => {
      console.error(`[DB] Connection failed: ${err.message}`);
      // Don't exit — /health will report 'disconnected' and Railway/admin can see it
    });
});

// ─── Graceful Shutdown ────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);
  app.close(() => {
    console.log('[Server] HTTP server closed');
    mongoose.connection.close(() => {
      console.log('[DB] MongoDB connection closed');
      process.exit(0);
    });
  });
  // Force exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
