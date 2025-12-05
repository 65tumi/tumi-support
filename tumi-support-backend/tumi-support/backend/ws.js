/**
 * Updated ws.js
 * WebSocket + queue/session manager
 */

const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

// ------------------
// State
// ------------------
let activeSession = null;           // sessionId of current active user
let sessions = {};                  // sessionId: { ws, status }
let queue = [];                     // waiting sessionIds

// ------------------
// Create new session
// ------------------
function createSession() {
    const sessionId = uuidv4();

    if (!activeSession) {
        activeSession = sessionId;
        sessions[sessionId] = { ws: null, status: "active" };

        return { status: "active", sessionId };
    }

    queue.push(sessionId);
    sessions[sessionId] = { ws: null, status: "queued" };

    return { status: "queued", sessionId, position: queue.length };
}

// ------------------
// End session
// ------------------
function endSession(sessionId) {
    if (!sessions[sessionId] && activeSession !== sessionId) return { next: null };

    // if active
    if (activeSession === sessionId) {
        try { sessions[sessionId]?.ws?.close(); } catch (_) {}
        delete sessions[sessionId];
        activeSession = null;

        const next = queue.shift();
        if (next) {
            activeSession = next;
            sessions[next].status = "active";

            try {
                sessions[next]?.ws?.send(JSON.stringify({
                    type: "system",
                    message: "Support is available now, you are connected."
                }));
            } catch (_) {}

            return { next };
        }

        return { next: null };
    }

    // remove from queue
    queue = queue.filter(id => id !== sessionId);
    try { sessions[sessionId]?.ws?.close(); } catch (_) {}
    delete sessions[sessionId];
    return { next: null };
}

// ------------------
// Attach WS Server
// ------------------
function setup(server, bot) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const sessionId = url.searchParams.get("sessionId");

        if (!sessionId || !sessions[sessionId]) {
            ws.send(JSON.stringify({
                type: "error",
                message: "Invalid or expired session"
            }));
            ws.close();
            return;
        }

        // attach ws
        sessions[sessionId].ws = ws;

        if (activeSession === sessionId) {
            ws.send(JSON.stringify({
                type: "system",
                message: "You are connected to TumiCodes Support."
            }));
        } else {
            const position = queue.indexOf(sessionId) + 1;
            ws.send(JSON.stringify({
                type: "system",
                message: `You are in queue. Position: ${position}`
            }));
        }

        // Handle incoming messages
        ws.on("message", (raw) => {
            const msg = raw.toString();

            if (activeSession === sessionId) {
                bot.sendMessageToTelegram(sessionId, msg);
            }

            ws.send(JSON.stringify({
                type: "user",
                message: msg
            }));
        });

        // Disconnect handler
        ws.on("close", () => {
            // Only remove from active/queue if the ws is actually gone
            if (sessions[sessionId]?.ws === ws) {
                endSession(sessionId);
            }
        });
    });

    console.log("WebSocket initialized");
}

// ----------------------
// Exports
// ----------------------
module.exports = {
    setup,
    createSession,
    endSession,
    get activeSession() { return activeSession; },
    get queue() { return queue; },
    get sessions() { return sessions; }
};

