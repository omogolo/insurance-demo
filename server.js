require('dotenv').config();

// Crash handlers for clean Railway logs
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

const express = require('express');
const mongoose = require('mongoose');
const healthRoutes = require('./routes/health');
const webhookRoutes = require('./routes/webhooks');
const { initCronJobs } = require('./services/alerts');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use('/health', healthRoutes);
app.use('/webhooks', webhookRoutes);

app.get('/', (req, res) => {
  res.json({ service: 'Insurance Demo v2.0 — BWP', status: 'alive' });
});

// Admin routes removed for clean demo, add back if needed

async function start() {
  if (!process.env.MONGO_URI) {
    console.error('FATAL: MONGO_URI not set');
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`[DB] Connected to MongoDB`);
    initCronJobs();
    
    // THE RAILWAY FIX: Must bind to '0.0.0.0'
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Running on port ${PORT}`);
    });
  } catch (err) {
    console.error('FATAL: DB Connection failed:', err.message);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => { await mongoose.disconnect(); process.exit(0); });
process.on('SIGINT', async () => { await mongoose.disconnect(); process.exit(0); });

start();
