/**
 * ws.js
 * WebSocket server for TumiCodes Support System
 */

const WebSocket = require('ws');

let wss = null;

// Store active sessions
const sessions = {}; // { sessionId: ws }
let activeSession = null;
const queue = [];

function setup(server, botModule) {
    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        let sessionId = null;

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                if (data.type === 'request_activation' && data.sessionId) {
                    sessionId = data.sessionId;
                    sessions[sessionId] = ws;

                    // Add to queue if not active
                    if (!activeSession) {
                        activeSession = sessionId;
                        ws.send(JSON.stringify({ type: 'connected' }));
                    } else {
                        if (!queue.includes(sessionId)) queue.push(sessionId);
                        ws.send(JSON.stringify({ type: 'queue_update', position: queue.indexOf(sessionId) + 1, queueSize: queue.length }));
                    }

                    // Notify Telegram bot of new session
                    botModule.notifyNewSession?.(sessionId);
                }

                // User chat message
                if (data.type === 'chat' && sessionId) {
                    const chatId = botModule.telegramSessionMap[sessionId];
                    if (chatId) botModule.bot.sendMessage(chatId, data.text);
                }

                // Typing indicator
                if (data.type === 'typing' && sessionId) {
                    // Optional: send typing notification to Telegram (not typical)
                }

            } catch (err) {
                console.error('WS message parse error:', err);
            }
        });

        ws.on('close', () => {
            if (!sessionId) return;

            // Remove from sessions and queue
            delete sessions[sessionId];
            const queueIndex = queue.indexOf(sessionId);
            if (queueIndex > -1) queue.splice(queueIndex, 1);

            if (activeSession === sessionId) {
                activeSession = queue.shift() || null;
                if (activeSession && sessions[activeSession]) {
                    sessions[activeSession].send(JSON.stringify({ type: 'connected' }));
                }
            }
        });
    });
}

// Send message to user by sessionId
function sendToUser(sessionId, data) {
    const ws = sessions[sessionId];
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// Create session helper
function createSession() {
    const sessionId = 'sess_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    if (!activeSession) activeSession = sessionId;
    else queue.push(sessionId);

    return {
        sessionId,
        status: activeSession === sessionId ? 'connected' : 'queued',
        position: queue.indexOf(sessionId) + 1
    };
}

// End session helper
function endSession(sessionId) {
    if (!sessionId) return;

    const ws = sessions[sessionId];
    if (ws) ws.close();

    delete sessions[sessionId];

    const queueIndex = queue.indexOf(sessionId);
    if (queueIndex > -1) queue.splice(queueIndex, 1);

    if (activeSession === sessionId) {
        activeSession = queue.shift() || null;
        if (activeSession && sessions[activeSession]) {
            sessions[activeSession].send(JSON.stringify({ type: 'connected' }));
        }
    }

    return { next: activeSession };
}

module.exports = {
    setup,
    sessions,
    queue,
    activeSession,
    sendToUser,
    createSession,
    endSession
};
