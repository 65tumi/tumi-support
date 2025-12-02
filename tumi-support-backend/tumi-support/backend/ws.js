/**
 * ws.js
 * WebSocket manager for TumiCodes Support System
 */

const WebSocket = require('ws');
const botModule = require('./bot');

// Active sessions
const sessions = {};      // sessionId -> ws
let activeSession = null;
const queue = [];

// Map sessionId -> Telegram chatId
const sessionTelegramMap = {}; // { sessionId: chatId }

function setup(server, bot) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        let sessionId = null;

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                switch (data.type) {
                    case 'request_activation':
                        sessionId = data.userId;
                        sessions[sessionId] = ws;

                        // If there is a Telegram chatId stored, map it
                        const chatId = botModule.telegramSessionMap[sessionId];
                        if (chatId) sessionTelegramMap[sessionId] = chatId;

                        ws.send(JSON.stringify({ type: 'connected' }));
                        break;

                    case 'chat':
                        if (!sessionId) return;
                        handleUserMessage(sessionId, data.text);
                        break;

                    case 'typing':
                        // Optionally, broadcast typing indicator
                        break;
                }
            } catch (err) {
                console.error('Error handling WS message:', err);
            }
        });

        ws.on('close', () => {
            if (sessionId) delete sessions[sessionId];
        });
    });
}

// Create a new support session
function createSession() {
    const sessionId = generateSessionId();
    queue.push(sessionId);
    return {
        sessionId,
        status: 'queued',
        position: queue.length
    };
}

// End a session
function endSession(sessionId) {
    // Remove from queue
    const index = queue.indexOf(sessionId);
    if (index !== -1) queue.splice(index, 1);

    // Close WebSocket if connected
    const ws = sessions[sessionId];
    if (ws) ws.close();

    delete sessions[sessionId];
    delete sessionTelegramMap[sessionId];
    delete botModule.telegramSessionMap[sessionId];

    return { next: queue[0] || null };
}

// Send message to user
function sendToUser(sessionId, data) {
    const ws = sessions[sessionId];
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// Handle message from user and forward to Telegram
function handleUserMessage(sessionId, text) {
    const chatId = sessionTelegramMap[sessionId];

    if (!chatId) {
        console.warn('No Telegram chatId mapped for session', sessionId);
        return;
    }

    botModule.bot.sendMessage(chatId, text);
}

// Utility to generate session IDs
function generateSessionId() {
    return 'sess_' + Math.random().toString(36).substr(2, 9);
}

module.exports = {
    setup,
    createSession,
    endSession,
    sendToUser,
    activeSession,
    queue,
    sessions
};
