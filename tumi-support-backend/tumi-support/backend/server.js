/**
 * server.js
 * Main Express server + WebSocket initializer
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const websocket = require('./ws'); // WebSocket manager
const bot = require('./bot');

const app = express();

// ----------------------
// Safe CORS setup
// ----------------------
const allowedOrigins = [
  'https://support-tumicodes.netlify.app',
  'http://localhost:5500'
];

console.log('🌐 FRONTEND_URL used for CORS:', config.FRONTEND_URL);

app.use(cors({
  origin: function(origin, callback){
    // allow requests with no origin (like curl, postman)
    if(!origin) return callback(null, true);

    // allow only configured origins
    if(allowedOrigins.includes(origin)){
      return callback(null, true);
    } else {
      console.warn('❌ CORS blocked for origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

app.use(express.json());

// ----------------------
// Health Check Endpoint
// ----------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'TumiCodes Support System',
    version: '1.0.0',
    queue: {
      active: websocket.activeSession || null,
      queueSize: websocket.queue?.length || 0,
      sessions: Object.keys(websocket.sessions || {}).length
    }
  });
});

// ----------------------
// Start Support Session
// ----------------------
app.post('/api/start', (req, res) => {
  try {
    const data = websocket.createSession();
    bot.notifyNewSession?.(data.sessionId);
    res.json({
      status: data.status,
      sessionId: data.sessionId,
      position: data.position ?? null
    });
  } catch (err) {
    console.error('Error in /api/start:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// ----------------------
// End Support Session
// ----------------------
app.post('/api/end', (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const result = websocket.endSession(sessionId);
    bot.notifySessionEnded?.(sessionId);

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
  res.json({
    active: websocket.activeSession || null,
    queueSize: websocket.queue?.length || 0,
    queue: websocket.queue?.slice(0, 50) || []
  });
});

// ----------------------
// Start HTTP + WebSocket Server
// ----------------------
const server = http.createServer(app);
websocket.setup?.(server, bot);

const PORT = config.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TumiSupport backend listening on port ${PORT}`);
});

// ----------------------
// Graceful Shutdown
// ----------------------
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});


