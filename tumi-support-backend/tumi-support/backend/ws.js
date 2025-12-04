/**
 * ws.js
 * WebSocket session + message routing
 */

const { WebSocketServer } = require('ws');
const { v4: uuid } = require('uuid');

// State
let wss = null;

let sessions = {};       // sessionId -> websocket
let queue = [];          // queued sessionIds
let activeSession = null;
let bot = null;

// ----------------------
// Create a new support session
// ----------------------
function createSession() {
  const sessionId = uuid();
  queue.push(sessionId);

  const position = queue.length - 1;

  if (!activeSession) promoteNextSession();

  return {
    status: "pending",
    sessionId,
    position
  };
}

// ----------------------
// Promote next session
// ----------------------
function promoteNextSession() {
  if (activeSession || queue.length === 0) return;

  activeSession = queue.shift();

  if (bot) {
    bot.notifyNextUp(activeSession);
  }
}

// ----------------------
// End a support session
// ----------------------
function endSession(sessionId) {
  if (sessions[sessionId]) {
    try { sessions[sessionId].close(); } catch {}
    delete sessions[sessionId];
  }

  if (activeSession === sessionId) {
    activeSession = null;
    promoteNextSession();
  }

  return { next: activeSession };
}

// ----------------------
// Send a message to user
// ----------------------
function sendToUser(sessionId, text) {
  const ws = sessions[sessionId];
  if (!ws || ws.readyState !== 1) return;

  ws.send(JSON.stringify({
    from: "support",
    text,
    time: Date.now()
  }));
}

// ----------------------
// WebSocket setup
// ----------------------
function setup(server, botModule) {
  bot = botModule;

  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    // client must send sessionId first
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        // register socket with sessionId
        if (msg.type === "init") {
          sessions[msg.sessionId] = ws;
          return;
        }

        // incoming user message
        if (msg.type === "msg") {
          const sessionId = msg.sessionId;
          const text = msg.text;

          if (bot) bot.relayToTelegram(sessionId, text);
        }

      } catch (err) {
        console.error("WS message error:", err);
      }
    });

    ws.on('close', () => {
      // Remove session
      const id = Object.keys(sessions).find(s => sessions[s] === ws);
      if (id) delete sessions[id];
    });
  });
}

// ----------------------
// Export
// ----------------------
module.exports = {
  setup,
  createSession,
  endSession,
  sendToUser,
  sessions,
  queue,
  get activeSession() {
    return activeSession;
  }
};
