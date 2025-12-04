/**
 * ws.js
 * WebSocket manager for TumiCodes Support System
 *
 * Exports:
 *  - setup(server, botModule)
 *  - createSession()
 *  - endSession(sessionId)
 *  - sendToUser(sessionId, data)
 *  - sessions (object map)
 *  - queue (array)
 *  - activeSession
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const sessions = {};      // sessionId -> ws
let activeSession = null;
const queue = [];         // array of sessionIds

let botModule = null;     // set in setup so we can call botModule.sendToTelegram

function setup(server, bot) {
  botModule = bot;
  const wss = new WebSocket.Server({ server });

  console.log('WebSocket server started');

  wss.on('connection', (ws, req) => {
    let sessionId = null;
    console.log('New WS connection');

    ws.on('message', async (raw) => {
      let data;
      try { data = JSON.parse(raw); } catch (e) { console.warn('WS invalid JSON', e); return; }

      // request_activation: client tells backend which sessionId it owns
      if (data.type === 'request_activation' && data.sessionId) {
        sessionId = data.sessionId;
        sessions[sessionId] = ws;

        // If this session is new and not in queue, add it
        if (!queue.includes(sessionId) && activeSession !== sessionId) {
          if (!activeSession) {
            activeSession = sessionId;
            // set status: connected via createSession() already did; still ensure it's seen as active
          } else {
            queue.push(sessionId);
          }
        }

        // If active, notify connected; else send queue info
        if (activeSession === sessionId) {
          sendToUser(sessionId, { type: 'connected' });
        } else {
          sendToUser(sessionId, { type: 'queue_update', position: queue.indexOf(sessionId) + 1, queueSize: queue.length });
        }

        console.log(`WS activation: ${sessionId} (active: ${activeSession})`);
        return;
      }

      // chat messages from user
      if (data.type === 'chat' && data.sessionId && typeof data.text === 'string') {
        try {
          console.log(`User->backend [${data.sessionId}]:`, data.text);

          // acknowledge to frontend
          ws.send(JSON.stringify({ type: 'message_status', status: 'sent', timestamp: new Date().toISOString() }));

          // forward to Telegram via bot module
          try {
            if (botModule && typeof botModule.sendToTelegram === 'function') {
              await botModule.sendToTelegram(data.sessionId, data.text);
            } else {
              console.warn('botModule.sendToTelegram not available');
            }
          } catch (err) {
            console.error('Error sending to Telegram:', err);
          }
        } catch (err) {
          console.error('Error handling chat message', err);
        }
        return;
      }

      // typing indicator (optional)
      if (data.type === 'typing' && data.sessionId) {
        // could broadcast to agents or update state; currently ignored
        return;
      }

      // other types are ignored but logged
      console.log('Unhandled WS message type:', data.type);
    });

    ws.on('close', () => {
      if (sessionId) {
        console.log('WS closed for session:', sessionId);
        delete sessions[sessionId];

        // remove from queue if present
        const idx = queue.indexOf(sessionId);
        if (idx > -1) queue.splice(idx, 1);

        // if it was active, promote next
        if (activeSession === sessionId) {
          activeSession = queue.shift() || null;
          if (activeSession && sessions[activeSession]) {
            sendToUser(activeSession, { type: 'connected' });
          }
        }
      } else {
        console.log('WS closed for unknown session');
      }
    });

    ws.on('error', (err) => {
      console.error('WS error', err);
    });
  });
}

// createSession - returns session object for /api/start
function createSession() {
  const sessionId = 'sess_' + uuidv4().replace(/-/g, '').substr(0, 12);
  // If nothing active, immediately active; else add to queue
  if (!activeSession) {
    activeSession = sessionId;
  } else {
    queue.push(sessionId);
  }

  const status = activeSession === sessionId ? 'connected' : 'queued';
  console.log('createSession ->', { sessionId, status, position: queue.indexOf(sessionId) + (status === 'connected' ? 1 : 0) });

  return {
    sessionId,
    status,
    position: status === 'connected' ? 1 : queue.indexOf(sessionId) + 1
  };
}

// endSession - close session and promote next
function endSession(sessionId) {
  try {
    // remove from queue
    const qIdx = queue.indexOf(sessionId);
    if (qIdx > -1) queue.splice(qIdx, 1);

    // close ws connection if exists
    const ws = sessions[sessionId];
    if (ws) {
      try { ws.close(1000, 'session ended'); } catch (e) { /* ignore */ }
    }
    delete sessions[sessionId];

    if (activeSession === sessionId) {
      activeSession = queue.shift() || null;
      if (activeSession && sessions[activeSession]) {
        sendToUser(activeSession, { type: 'connected' });
      }
    }

    // inform bot mapping clean up (bot may hold mappings)
    try { botModule?.notifySessionEnded?.(sessionId); } catch (e) { /* ignore */ }

    return { next: activeSession };
  } catch (err) {
    console.error('endSession error', err);
    return { next: null };
  }
}

// sendToUser - send JSON payload to connected client
function sendToUser(sessionId, data) {
  const ws = sessions[sessionId];
  if (!ws) {
    console.warn('No websocket client for session', sessionId);
    return false;
  }
  try {
    ws.send(JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('sendToUser error', err);
    return false;
  }
}

module.exports = {
  setup,
  createSession,
  endSession,
  sendToUser,
  sessions,
  queue,
  get activeSession() { return activeSession; }
};
