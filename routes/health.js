const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

router.get('/', async (req, res) => {
  const checks = {
    server: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    mongodb: 'disconnected',
    dbHost: 'unknown'
  };

  if (mongoose.connection.readyState === 1) {
    checks.mongodb = 'connected';
    checks.dbHost = mongoose.connection.host || 'atlas';
  } else if (mongoose.connection.readyState === 2) {
    checks.mongodb = 'connecting';
  }

  try {
    const Customer = require('../models/Customer');
    const Policy = require('../models/Policy');
    const Statement = require('../models/Statement');
    checks.customers = await Customer.countDocuments();
    checks.policies = await Policy.countDocuments();
    checks.statements = await Statement.countDocuments();
  } catch (err) {
    checks.dbError = err.message;
  }

  const isHealthy = checks.mongodb === 'connected';
  res.status(isHealthy ? 200 : 503).json(checks);
});

module.exports = router;
