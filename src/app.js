/**
 * Main application entry point.
 * Exports the Express `app` so it can be imported in tests without
 * binding to a network port.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const sessionRoutes = require('./routes/sessions');
const campaignRoutes = require('./routes/campaign');

const app = express();
app.use(express.json());

// Apply a global rate limit to protect all auth-bearing routes from brute-force
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

app.use('/sessions', sessionRoutes);
app.use('/campaign', campaignRoutes);

// Health-check
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

module.exports = app;
