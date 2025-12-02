/**
 * bot.js
 * Telegram bot integration for TumiCodes Support System
 */

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const websocket = require('./ws'); // Import WebSocket manager

// Initialize Telegram bot
const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

// Map Telegram chatId <-> sessionId
const telegramSessionMap = {}; // { chatId: sessionId }

// Notify admin/support when a new session is created
function notifyNewSession(sessionId) {
    if (!config.TELEGRAM_SUPPORT_CHAT_ID) return;
    bot.sendMessage(
        config.TELEGRAM_SUPPORT_CHAT_ID,
        `🆕 New support session started. Session ID: ${sessionId}`
    );
}

// Notify admin/support when a session ends
function notifySessionEnded(sessionId) {
    if (!config.TELEGRAM_SUPPORT_CHAT_ID) return;
    bot.sendMessage(
        config.TELEGRAM_SUPPORT_CHAT_ID,
        `❌ Support session ended. Session ID: ${sessionId}`
    );
}

// Handle incoming messages from Telegram
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ignore messages from support chat for now
    if (chatId.toString() === config.TELEGRAM_SUPPORT_CHAT_ID) return;

    const sessionId = telegramSessionMap[chatId];
    if (!sessionId) {
        bot.sendMessage(chatId, "⚠️ You don't have an active support session.");
        return;
    }

    // Forward Telegram message to the website user via WebSocket
    websocket.sendToUser(sessionId, {
        type: 'support_message',
        text,
        timestamp: new Date().toISOString()
    });
});

// Export functions for use in backend
module.exports = {
    bot,
    notifyNewSession,
    notifySessionEnded,
    telegramSessionMap
};
