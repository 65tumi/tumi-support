/**
 * config.js
 * Central configuration loader and validator
 */
const dotenv = require('dotenv');
dotenv.config();

const required = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_SUPPORT_CHAT_ID',
  'SESSION_SECRET'
];

const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.warn('Warning: missing env vars:', missing.join(', '));
  // Not throwing — allows local testing with .env.example
}

module.exports = {
  PORT: process.env.PORT || 3000,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5500',
  NODE_ENV: process.env.NODE_ENV || 'development',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_SUPPORT_CHAT_ID: process.env.TELEGRAM_SUPPORT_CHAT_ID,
  SESSION_SECRET: process.env.SESSION_SECRET,
  // Queue settings
  MAX_QUEUE: parseInt(process.env.MAX_QUEUE || '100', 10),
  SESSION_TIMEOUT_MS: parseInt(process.env.SESSION_TIMEOUT_MS || 30*60*1000, 10)
};
