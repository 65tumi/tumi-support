// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const { setupWebSocket } = require("./ws");
const { telegramInit } = require("./bot");

const app = express();
const PORT = process.env.PORT || 3000;

// ----------- MIDDLEWARE --------------
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
app.use(bodyParser.json());

// ----------- MEMORY DB ---------------
global.sessions = new Map();   // sessionId => { status, queue }
global.queue = [];             // waiting users
global.activeSession = null;   // current sessionId

// ------------------------------------
// API: Start support session
// ------------------------------------
app.post("/api/start", (req, res) => {
  const sessionId = Math.random().toString(36).substring(2, 12);

  sessions.set(sessionId, { status: "waiting" });
  queue.push(sessionId);

  console.log(`🟢 New session: ${sessionId}`);

  // If none online, activate
  if (!activeSession) {
    activeSession = sessionId;
    sessions.get(sessionId).status = "connected";
    console.log(`🎯 Session ${sessionId} active`);

    return res.json({
      sessionId,
      status: "connected",
      position: 1
    });
  }

  return res.json({
    sessionId,
    status: "waiting",
    position: queue.length
  });
});

// ------------------------------------
// API: Queue poll
// ------------------------------------
app.get("/api/queue-status", (req, res) => {
  const sessionId = req.query.sessionId;

  return res.json({
    active: activeSession,
    queue,
    queueSize: queue.length
  });
});

// ------------------------------------
// API: End session
// ------------------------------------
app.post("/api/end", (req, res) => {
  const { sessionId } = req.body;

  queue = queue.filter(id => id !== sessionId);
  sessions.delete(sessionId);

  if (activeSession === sessionId) {
    activeSession = queue.length ? queue.shift() : null;
    if (activeSession) {
      sessions.get(activeSession).status = "connected";
    }
  }

  console.log(`🔴 Session ended: ${sessionId}`);

  return res.json({ status: "ended" });
});

// ------------------------------------
// Health
// ------------------------------------
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ------------------------------------
// Start HTTP
// ------------------------------------
const server = app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);

// ------------------------------------
// Init WebSocket + Telegram Bot
// ------------------------------------
setupWebSocket(server);
telegramInit();

module.exports = app;
