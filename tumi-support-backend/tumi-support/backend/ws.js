/**
 * ws.js
 * WebSocket + queue/session manager
 */

const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

// ------------------
// State
// ------------------
let activeSession = null;           // sessionId of current active user
let sessions = {};                  // sessionId: { ws }
let queue = [];                     // waiting sessionIds

// ------------------
// Create new session
// ------------------
function createSession() {
    const sessionId = uuidv4();

    // if no one active -> activate now
    if (!activeSession) {
        activeSession = sessionId;
        sessions[sessionId] = { ws: null, status: "active" };

        return {
            status: "active",
            sessionId
        };
    }

    // otherwise -> push into queue
    queue.push(sessionId);
    sessions[sessionId] = { ws: null, status: "queued" };

    return {
        status: "queued",
        sessionId,
        position: queue.length
    };
}

// ------------------
// End session
// ------------------
function endSession(sessionId) {
    // if this is active
    if (activeSession === sessionId) {
        // close ws if exists
        try {
            sessions[sessionId]?.ws?.close();
        } catch (_) {}

        delete sessions[sessionId];
        activeSession = null;

        const next = queue.shift();

        if (next) {
            activeSession = next;
            sessions[next].status = "active";

            // tell frontend via ws if connected
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

    try {
        sessions[sessionId]?.ws?.close();
    } catch (_) {}

    delete sessions[sessionId];
    return { next: null };
}

// ------------------
// Attach WS Server
// ------------------
function setup(server, bot) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        // Expect sessionId from query
        const url = new URL(req.url, "http://localhost");
        const sessionId = url.searchParams.get("sessionId");

        if (!sessionId || !sessions[sessionId]) {
            ws.send(JSON.stringify({
                type: "error",
                message: "Invalid or expired session"
            }));
            ws.close();
            return;
        }

        // Attach ws to session
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

        // Receive messages
        ws.on("message", (raw) => {
            const msg = raw.toString();

            // forwarding:
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
            endSession(sessionId);
        });
    });

    console.log("WebSocket initialized");
}


// ----------------------
// Exports
// ----------------------
module.exports = {
    setup,

    // session systems used by server.js
    createSession,
    endSession,

    // state exported for server.js
    activeSession,
    queue,
    sessions
};
