/**
 * bot.js
 * Telegram bot bridge for TumiCodes Support
 *
 * Behavior:
 * - When server notifies a new session, the bot will message the support chat:
 *   "New user connected: <sessionId>" and include the forwarded message id mapping.
 * - When support replies to that message in Telegram, the bot will forward the reply to the correct session.
 * - Support can run /end to close the active session.
 */

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');

if (!config.TELEGRAM_BOT_TOKEN) {
  console.warn('No TELEGRAM_BOT_TOKEN set — bot disabled');
}

const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

// mapping from telegram message_id -> sessionId so replies map correctly
const tgMessageMap = new Map();

// Helper to send a message and map it
async function sendAndMap(text) {
  const sent = await bot.sendMessage(config.TELEGRAM_SUPPORT_CHAT_ID, text);
  // map the sent message id to the last session mentioned in text if possible
  // extract sessionId from text using regex
  const m = text.match(/sessionId: (\S+)/);
  if (m) {
    const sid = m[1];
    tgMessageMap.set(sent.message_id, sid);
  }
  return sent;
}

// When bot receives any message
bot.on('message', (msg) => {
  try {
    // Only accept messages from support chat
    const fromSupportChat = String(msg.chat.id) === String(config.TELEGRAM_SUPPORT_CHAT_ID);
    if (!fromSupportChat) return;

    // If support replied to a message we sent, map reply to session
    if (msg.reply_to_message && msg.reply_to_message.message_id) {
      const repliedId = msg.reply_to_message.message_id;
      const sessionId = tgMessageMap.get(repliedId);
      if (sessionId) {
        // Forward text to session (via websocket manager)
        const text = msg.text || '';
        // send to session (ws manager handles if offline)
        module.exports._onSupportReply && module.exports._onSupportReply(sessionId, text);
        return;
      }
    }

    // Handle commands
    const text = (msg.text || '').trim();
    if (text.startsWith('/end')) {
      const parts = text.split(' ');
      const sid = parts[1];
      if (sid) {
        module.exports._onSupportEnd && module.exports._onSupportEnd(sid);
        bot.sendMessage(config.TELEGRAM_SUPPORT_CHAT_ID, `Session ${sid} ended by support.`);
      } else {
        bot.sendMessage(config.TELEGRAM_SUPPORT_CHAT_ID, `Usage: /end <sessionId>`);
      }
      return;
    }

    // Unrecognized messages can be ignored or handled
  } catch (err) {
    console.error('Error in bot.on.message', err);
  }
});

// Exposed functions used by server/ws manager
module.exports = {
  // Notify support chat about a new session (returns promise)
  async notifyNewSession(sessionId) {
    try {
      const text = `🔔 New user connected — sessionId: ${sessionId}\nReply to this message to send a reply to the user.`;
      const sent = await sendAndMap(text);
      return sent;
    } catch (err) {
      console.error('notifyNewSession error', err);
    }
  },

  // Send arbitrary text and map (used for user message follow-ups)
  async botSendText(text) {
    try {
      const sent = await bot.sendMessage(config.TELEGRAM_SUPPORT_CHAT_ID, text);
      return sent;
    } catch (err) {
      console.error('botSendText error', err);
      throw err;
    }
  },

  // Notify session ended
  async notifySessionEnded(sessionId) {
    try {
      const text = `ℹ️ Session ended — sessionId: ${sessionId}`;
      await bot.sendMessage(config.TELEGRAM_SUPPORT_CHAT_ID, text);
    } catch (err) {
      console.error('notifySessionEnded error', err);
    }
  },

  // Hooks set by ws manager
  _onSupportReply: null,
  _onSupportEnd: null,

  // Export bot for direct use if necessary
  bot
};
