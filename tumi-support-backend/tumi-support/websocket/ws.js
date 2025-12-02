/**
 * websocket/ws.js
 * WebSocket manager: attaches to HTTP server, manages sessions, queue, and message routing
 */
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const config = require('../backend/config');

// sessionId -> { ws, createdAt }
const sessions = {};

// Simple queue of sessionIds
const queue = [];

// single active session id
let activeSession = null;

// bot bridge (will be set in setup)
let botBridge = null;

function setup(server, bot) {
  botBridge = bot;
  // Register hooks so bot can call into ws manager
  if (botBridge) {
    botBridge._onSupportReply = (sessionId, text) => {
      sendToSession(sessionId, `[Support] ${text}`);
    };
    botBridge._onSupportEnd = (sessionId) => {
      endSession(sessionId);
    };
  }

  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('WebSocket connection established');

    // Expect the client to send an init message with sessionId after connecting
    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data && data.type === 'init' && data.sessionId) {
          const sid = data.sessionId;
          sessions[sid] = sessions[sid] || {};
          sessions[sid].ws = ws;
          sessions[sid].createdAt = sessions[sid].createdAt || Date.now();
          console.log('Session attached to ws', sid);

          // If this session is active, notify client
          if (sid === activeSession) {
            ws.send(JSON.stringify({ type: 'connected', status: 'active', sessionId: sid }));
          } else {
            const pos = queue.indexOf(sid);
            ws.send(JSON.stringify({ type: 'queued', position: pos >= 0 ? pos+1 : null, sessionId: sid }));
          }

          // heartbeat ping/pong handled by ws library default options
        } else if (data && data.type === 'message' && data.sessionId && data.text) {
          // Forward to Telegram via bot
          const sid = data.sessionId;
          const text = data.text;
          console.log('Message from user', sid, text);
          if (botBridge && typeof botBridge.botSendText === 'function') {
            // send the actual message to support so they can reply to it
            (async () => {
              try {
                const sent = await botBridge.botSendText(`User (${sid}): ${text}`);
                // map the sent message id -> sessionId is handled in bot.sendAndMap for new session notices
              } catch (err) {
                console.error('botSendText error', err);
              }
            })();
          } else {
            console.log('No botBridge available to forward message');
          }
        }
      } catch (err) {
        console.error('Error parsing ws message', err);
      }
    });

    ws.on('close', () => {
      // find which session had this ws and remove reference
      const sid = Object.keys(sessions).find(k => sessions[k].ws === ws);
      if (sid) {
        console.log('WebSocket closed for session', sid);
        delete sessions[sid].ws;
        // If it was active, end session
        if (sid === activeSession) {
          endSession(sid);
        } else {
          // remove from queue if present
          const idx = queue.indexOf(sid);
          if (idx >= 0) queue.splice(idx, 1);
        }
      }
    });

  });

  console.log('WebSocket server setup complete');
}

// Create a new session (called by REST /api/start)
function createSession() {
  const sessionId = uuidv4();
  // attach to queue or make active
  if (!activeSession) {
    activeSession = sessionId;
    sessions[sessionId] = { createdAt: Date.now(), ws: null };
    console.log('Session started as active', sessionId);
    return { status: 'connected', sessionId };
  } else {
    if (queue.length >= config.MAX_QUEUE) {
      return { status: 'rejected', sessionId };
    }
    queue.push(sessionId);
    sessions[sessionId] = { createdAt: Date.now(), ws: null };
    console.log('Session queued', sessionId, 'position', queue.length);
    return { status: 'queued', sessionId, position: queue.length };
  }
}

// End a session
function endSession(sessionId) {
  if (!sessionId) return null;
  let next = null;
  if (sessionId === activeSession) {
    // remove active
    activeSession = null;
    // assign next
    if (queue.length > 0) {
      next = queue.shift();
      activeSession = next;
      // notify the newly active user's ws if connected
      if (sessions[next] && sessions[next].ws) {
        sessions[next].ws.send(JSON.stringify({ type: 'connected', status: 'active', sessionId: next }));
      }
      // notify support via bot
      botBridge && botBridge.notifyNewSession(next);
    }
  } else {
    // remove from queue if present
    const idx = queue.indexOf(sessionId);
    if (idx >= 0) queue.splice(idx, 1);
  }

  // cleanup session record
  if (sessions[sessionId]) {
    if (sessions[sessionId].ws) {
      try { sessions[sessionId].ws.close(); } catch(e){}
    }
    delete sessions[sessionId];
  }
  console.log('Ended session', sessionId, 'next', next);
  return { next };
}

// send text to a session (called by bot when support replies)
function sendToSession(sessionId, text) {
  const sess = sessions[sessionId];
  if (sess && sess.ws) {
    sess.ws.send(JSON.stringify({ type: 'message', from: 'support', text }));
    return true;
  }
  console.warn('Session ws not connected for', sessionId);
  return false;
}

module.exports = {
  setup,
  createSession,
  endSession,
  sendToSession,
  sessions,
  queue,
  get activeSession() { return activeSession; }
};
