// server.js — Production-ready entry point
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// Critical: Railway requires 0.0.0.0 binding
const HOST = '0.0.0.0';

// Middleware
app.use(express.json({ limit: '1mb' }));

// Health check (Railway uses this)
app.get('/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'ok',
    mongodb: dbStatus,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/webhooks/respondio', require('./routes/webhooks'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${err.message}`, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Connect to DB then start server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`[Server] Running on ${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error(`[FATAL] MongoDB connection failed: ${err.message}`);
    process.exit(1);
  });

// Don't crash on unhandled rejections in production
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
