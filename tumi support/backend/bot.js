/**
 * Telegram Bot Handler for TumiCodes Support
 */

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');

class TelegramBotHandler {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.bot = null;
    this.setupBot();
  }

  setupBot() {
    if (!config.telegram.token) {
      console.error('❌ TELEGRAM_BOT_TOKEN is not set in .env file');
      return;
    }

    // Create bot instance
    this.bot = new TelegramBot(config.telegram.token, {
      polling: true
    });

    // Store all support agents who can respond
    this.supportAgents = new Set();

    this.setupHandlers();
    console.log('🤖 Telegram Bot started successfully');
  }

  setupHandlers() {
    // Handle /start command
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.supportAgents.add(chatId);
      
      const welcomeMessage = `
🎯 *TumiCodes Support Bot*
      
I will forward messages from your website users to this chat.

*Available Commands:*
/end - End current chat session
/queue - Check waiting queue
/status - Check system status

👤 A new user message will appear here when someone connects.
      `;
      
      this.bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    });

    // Handle /end command
    this.bot.onText(/\/end/, (msg) => {
      const chatId = msg.chat.id;
      this.wsManager.endCurrentSession('Support agent ended the chat');
      this.bot.sendMessage(chatId, '✅ Chat session ended successfully.');
    });

    // Handle /queue command
    this.bot.onText(/\/queue/, (msg) => {
      const chatId = msg.chat.id;
      const queueInfo = this.wsManager.getQueueInfo();
      const message = `📊 *Queue Status*
Active Users: ${queueInfo.active ? '1' : '0'}
Users in Queue: ${queueInfo.queueSize}
Queue Positions: ${queueInfo.queue.join(', ') || 'Empty'}`;
      
      this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    });

    // Handle /status command
    this.bot.onText(/\/status/, (msg) => {
      const chatId = msg.chat.id;
      const status = this.wsManager.getSystemStatus();
      this.bot.sendMessage(chatId, status, { parse_mode: 'Markdown' });
    });

    // Handle all other messages (forward to active user)
    this.bot.on('message', (msg) => {
      // Ignore commands and /start messages
      if (msg.text && msg.text.startsWith('/')) return;
      if (msg.text && msg.text.includes('TumiCodes user')) return;
      
      const chatId = msg.chat.id;
      const message = msg.text || (msg.caption || '');
      
      if (message.trim()) {
        // Forward message to active user
        const forwarded = this.wsManager.forwardToUser(message, `Support: ${message}`);
        
        if (forwarded) {
          this.bot.sendMessage(chatId, '✅ Message sent to user.');
        } else {
          this.bot.sendMessage(chatId, '❌ No active user to send message to.');
        }
      }
    });
  }

  // Send notification to all support agents
  sendToSupport(message, options = {}) {
    if (!this.bot) return;
    
    this.supportAgents.forEach(chatId => {
      try {
        this.bot.sendMessage(chatId, message, { 
          parse_mode: 'Markdown',
          ...options 
        });
      } catch (error) {
        console.error('Error sending to support:', error);
      }
    });
  }

  // Notify support about new user
  notifyNewUser(userId, isQueued = false, position = null) {
    let message = '';
    
    if (isQueued) {
      message = `🕒 *New User in Queue*
User ID: \`${userId}\`
Position in queue: #${position}

They will connect when current session ends.`;
    } else {
      message = `🎉 *New TumiCodes User Connected*
User ID: \`${userId}\`

Start chatting now! Your messages will be forwarded to them.`;
    }
    
    this.sendToSupport(message);
  }

  // Notify support about user disconnect
  notifyUserDisconnect(userId, reason = 'User disconnected') {
    const message = `👋 *User Disconnected*
User ID: \`${userId}\`
Reason: ${reason}`;
    
    this.sendToSupport(message);
  }

  // Notify support about queue update
  notifyQueueUpdate(queueSize, nextUserId) {
    if (queueSize > 0) {
      const message = `📋 *Queue Update*
Users waiting: ${queueSize}
Next user ID: \`${nextUserId}\``;
      
      this.sendToSupport(message);
    }
  }
}

module.exports = TelegramBotHandler;