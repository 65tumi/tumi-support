// bot.js
const TelegramBot = require("node-telegram-bot-api");
const { sendSupportReply } = require("./ws");

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;

let bot;

// ------------------------------------------------------
// Init bot
// ------------------------------------------------------
function telegramInit() {
  bot = new TelegramBot(token, { polling: true });

  console.log("🤖 Telegram Bot Started");

  bot.on("message", msg => {
    const chatId = msg.chat.id;

    // ignore user join messages
    if (!msg.text) return;

    // message must be in format:
    // sessionId: reply text
    const parts = msg.text.split(":");
    if (parts.length < 2) {
      bot.sendMessage(chatId, "❌ Format:\n\n`sessionId: reply text`");
      return;
    }

    const sessionId = parts.shift().trim();
    const text = parts.join(":").trim();

    console.log(`📤 Support reply to ${sessionId}:`, text);

    // send back to website user
    sendSupportReply(sessionId, text);
  });
}

// ------------------------------------------------------
// Forward user message to Telegram admin
// ------------------------------------------------------
async function sendToTelegram(sessionId, text) {
  const msg = `💬 New message\n\nSession: *${sessionId}*\n\n${text}`;

  try {
    await bot.sendMessage(adminChatId, msg, { parse_mode: "Markdown" });
  } catch (e) {
    console.log("⚠️ Telegram send error:", e.message);
  }
}

module.exports = { telegramInit, sendToTelegram };
