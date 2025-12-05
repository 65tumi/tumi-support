/**
 * Updated server.js
 * Express + WebSocket backend for TumiCodes Support
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const websocket = require('./ws');
const bot = require('./bot');

const app = express();

// ----------------------
// CORS
// ----------------------
const allowed = [
  (config.FRONTEND_URL || '').trim(),
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
console.log("Allowed origins for CORS:", allowed);

app.use(cors({
  origin: allowed,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ----------------------
// Health Check
// ----------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'TumiCodes Support System',
    version: '1.0.1',
    queue: {
      active: websocket.activeSession || null,
      queueSize: websocket.queue.length,
      sessions: Object.keys(websocket.sessions).length
    }
  });
});

// ----------------------
// Start Session
// ----------------------
app.post('/api/start', (req, res) => {
  try {
    const data = websocket.createSession();
    bot.notifyNewSession(data.sessionId);

    res.json({
      status: data.status,
      sessionId: data.sessionId,
      position: data.position || null
    });

  } catch (err) {
    console.error('Error in /api/start:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// ----------------------
// End Session
// ----------------------
app.post('/api/end', (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    if (!websocket.sessions[sessionId] && websocket.activeSession !== sessionId) {
      return res.status(400).json({ error: 'Invalid or expired session' });
    }

    const result = websocket.endSession(sessionId);
    bot.notifySessionEnded(sessionId);

    res.json({
      status: 'ended',
      next: result?.next || null
    });

  } catch (err) {
    console.error('Error in /api/end:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// ----------------------
// Queue Status
// ----------------------
app.get('/api/queue-status', (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  // Validate session
  if (!websocket.sessions[sessionId] && websocket.activeSession !== sessionId) {
    return res.status(400).json({ error: 'Invalid or expired session' });
  }

  res.json({
    active: websocket.activeSession,
    queueSize: websocket.queue.length,
    queue: websocket.queue.slice(0, 50)
  });
});

// ----------------------
// Init HTTP + WS
// ----------------------
const server = http.createServer(app);
websocket.setup(server, bot);

const PORT = config.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TumiSupport backend listening on port ${PORT}`);
});

// ----------------------
// Graceful Shutdown
// ----------------------
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});


