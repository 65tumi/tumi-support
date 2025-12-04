/**
 * server.js
 * Express server + WebSocket initializer
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const websocket = require('./ws');
const bot = require('./bot');

const app = express();

// --------- Safe CORS (allow Netlify + localhost) ----------
const allowedOrigins = [
  (config.FRONTEND_URL || '').replace(/\/$/, ''), // configured frontend
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
].filter(Boolean);

console.log('Allowed origins for CORS:', allowedOrigins);

app.use(cors({
  origin: function(origin, callback) {
    // allow non-browser tools (no origin)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

app.use(express.json());

// ---------------- Health ----------------
app.get('/health', (req, res) => {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'TumiCodes Support System',
      version: '1.0.0',
      queue: {
        active: websocket.activeSession || null,
        queueSize: websocket.queue.length,
        sessions: Object.keys(websocket.sessions).length
      }
    });
  } catch (err) {
    console.error('Health error:', err);
    res.status(500).json({ status: 'error' });
  }
});

// ---------------- Start session ----------------
app.post('/api/start', (req, res) => {
  try {
    const data = websocket.createSession();
    // notify support/admin in Telegram (non-blocking)
    try { bot.notifyNewSession?.(data.sessionId); } catch (e) { console.warn('bot.notifyNewSession error', e); }
    res.json({
      success: true,
      status: data.status,
      sessionId: data.sessionId,
      position: data.position ?? null
    });
  } catch (err) {
    console.error('Error in /api/start:', err);
    res.status(500).json({ success: false, error: 'Failed to start session' });
  }
});

// ---------------- End session ----------------
app.post('/api/end', (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });

    const result = websocket.endSession(sessionId);
    try { bot.notifySessionEnded?.(sessionId); } catch (e) { console.warn('bot.notifySessionEnded error', e); }

    res.json({ success: true, status: 'ended', next: result?.next || null });
  } catch (err) {
    console.error('Error in /api/end:', err);
    res.status(500).json({ success: false, error: 'Failed to end session' });
  }
});

// ---------------- Queue status ----------------
app.get('/api/queue-status', (req, res) => {
  try {
    res.json({
      success: true,
      active: websocket.activeSession || null,
      queueSize: websocket.queue.length,
      queue: websocket.queue.slice(0, 50)
    });
  } catch (err) {
    console.error('Error /api/queue-status', err);
    res.status(500).json({ success: false, error: 'Failed to get queue status' });
  }
});

// ---------------- Start server and WS ----------------
const PORT = config.PORT || 3000;
const server = http.createServer(app);

websocket.setup(server, bot); // attach WS, also passes bot module for sending to Telegram if needed

server.listen(PORT, () => {
  console.log(`TumiSupport backend listening on port ${PORT}`);
});

// ---------------- graceful ----------------
process.on('SIGINT', () => { console.log('SIGINT received, shutting down'); process.exit(0); });
process.on('SIGTERM', () => { console.log('SIGTERM received, shutting down'); process.exit(0); });
process.on('uncaughtException', (err) => { console.error('uncaughtException', err); process.exit(1); });

module.exports = app;
