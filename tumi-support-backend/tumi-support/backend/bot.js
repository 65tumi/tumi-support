/**
 * bot.js
 * Telegram bot integration for TumiCodes Support System
 */

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const websocket = require('./ws');

// Create bot
const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

// Map to link Telegram chatIds to sessionIds
const telegramSessionMap = {}; // { sessionId: chatId }

// Handle incoming Telegram messages
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ignore messages from support/admin chat
    if (chatId.toString() === config.TELEGRAM_SUPPORT_CHAT_ID) return;

    // Find existing session linked to this Telegram chat
    let sessionId = Object.keys(telegramSessionMap).find(
        id => telegramSessionMap[id] === chatId
    );

    // If no session linked, map to first active session
    if (!sessionId) {
        const queuedSessions = Object.keys(websocket.sessions);
        if (!queuedSessions.length) {
            bot.sendMessage(chatId, '⚠️ No active user session to connect.');
            return;
        }
        sessionId = queuedSessions[0];
        telegramSessionMap[sessionId] = chatId;
    }

    // Forward Telegram message to the user via WebSocket
    websocket.sendToUser(sessionId, {
        type: 'support_message',
        text,
        timestamp: new Date().toISOString()
    });
});

// Notify bot of new session (optional)
function notifyNewSession(sessionId) {
    const chatId = config.TELEGRAM_SUPPORT_CHAT_ID;
    bot.sendMessage(chatId, `🟢 New user session started: ${sessionId}`);
}

// Notify bot when session ends
function notifySessionEnded(sessionId) {
    const chatId = telegramSessionMap[sessionId];
    if (chatId) bot.sendMessage(chatId, '🔴 Your support session has ended.');
    delete telegramSessionMap[sessionId];
}

module.exports = {
    bot,
    telegramSessionMap,
    notifyNewSession,
    notifySessionEnded
};
