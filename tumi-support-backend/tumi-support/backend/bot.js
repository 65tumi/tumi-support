/**
 * bot.js
 * Telegram bot integration
 *
 * Behavior:
 *  - When a website user sends a message, ws.js calls sendToTelegram(sessionId, text).
 *  - This function forwards the message to the configured support/admin Telegram chat.
 *  - Support staff can reply in two ways to send message back to the website:
 *      A) Reply to the forwarded message in Telegram -> we detect reply_to_message and extract sessionId
 *      B) Send a message starting with: sessionId: your reply text
 *
 * Exports:
 *  - notifyNewSession(sessionId)
 *  - notifySessionEnded(sessionId)
 *  - sendToTelegram(sessionId, text)
 *  - Internal `bot` instance
 */

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const ws = require('./ws');

const TOKEN = config.TELEGRAM_BOT_TOKEN;
const SUPPORT_CHAT_ID = String(config.TELEGRAM_SUPPORT_CHAT_ID); // admin/support group or user
if (!TOKEN) console.warn('TELEGRAM_BOT_TOKEN missing in env');
if (!SUPPORT_CHAT_ID) console.warn('TELEGRAM_SUPPORT_CHAT_ID missing in env');

const bot = new TelegramBot(TOKEN, { polling: true });

// Map sessionId -> telegram chatId when needed (not used for web->telegram forwarding but handy)
const telegramSessionMap = {}; // sessionId -> chatId (optional)

bot.on('polling_error', (err) => {
  console.warn('Telegram polling error', err);
});

// When support replies in SUPPORT_CHAT_ID, forward to website session
bot.on('message', async (msg) => {
  try {
    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();
    if (!text) return;

    // If message comes from someone other than support/admin chat, ignore (we only forward to admin)
    if (chatId !== SUPPORT_CHAT_ID) {
      // Optionally: handle direct messages to bot if you want to map Telegram users to sessions
      return;
    }

    // Case A: support replied to a forwarded message (reply_to_message exists)
    if (msg.reply_to_message && msg.reply_to_message.text) {
      // Expect the forwarded message includes "Session: <sessionId>"
      const original = msg.reply_to_message.text;
      const match = original.match(/Session:\s*([a-zA-Z0-9_\-]{8,})/);
      if (match) {
        const sessionId = match[1];
        const replyText = text;
        console.log(`Support reply (reply_to) -> session ${sessionId}:`, replyText);
        ws.sendToUser(sessionId, { type: 'support_message', text: replyText, timestamp: new Date().toISOString() });
        return;
      }
    }

    // Case B: support wrote "sessionId: message"
    // Accept formats like: sess_abc123: Hello
    const colonIndex = text.indexOf(':');
    if (colonIndex > 0) {
      const possibleId = text.slice(0, colonIndex).trim();
      const replyText = text.slice(colonIndex + 1).trim();
      if (possibleId && replyText) {
        // basic validation: sessionId starts with "sess_" or alnum
        if (/^[a-zA-Z0-9_\-]{6,}$/.test(possibleId)) {
          const sessionId = possibleId;
          console.log(`Support reply (prefix) -> session ${sessionId}:`, replyText);
          ws.sendToUser(sessionId, { type: 'support_message', text: replyText, timestamp: new Date().toISOString() });
          return;
        }
      }
    }

    // If we get here, support message wasn't parseable -> send instruction
    await bot.sendMessage(SUPPORT_CHAT_ID, 'Reply to a forwarded message or send `sessionId: your message`');
  } catch (err) {
    console.error('Error in bot.on(message):', err);
  }
});

// notify support when a new session is created
function notifyNewSession(sessionId) {
  try {
    const msg = `🆕 New support session started\n\nSession: ${sessionId}\n\nReply to this message to reply to the user (or send "${sessionId}: your message").`;
    bot.sendMessage(SUPPORT_CHAT_ID, msg);
  } catch (err) {
    console.warn('notifyNewSession error', err);
  }
}

// notify support when a session ends
function notifySessionEnded(sessionId) {
  try {
    const msg = `🔴 Session ended: ${sessionId}`;
    bot.sendMessage(SUPPORT_CHAT_ID, msg);
  } catch (err) {
    console.warn('notifySessionEnded error', err);
  }
}

// sendToTelegram - called by ws.js when a website user sends a message
async function sendToTelegram(sessionId, text) {
  try {
    const formatted = `💬 New message\n\nSession: ${sessionId}\n\n${text}`;
    // forward to support chat
    await bot.sendMessage(SUPPORT_CHAT_ID, formatted);
  } catch (err) {
    console.error('sendToTelegram error', err);
  }
}

module.exports = {
  bot,
  telegramSessionMap,
  notifyNewSession,
  notifySessionEnded,
  sendToTelegram
};
