/**
 * WebSocket Manager for TumiCodes Support System
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class WebSocketManager {
  constructor(server, telegramBot) {
    this.wss = new WebSocket.Server({ server });
    this.telegramBot = telegramBot;
    
    // Store active connections
    this.activeUser = null;
    this.queue = [];
    this.sessions = new Map(); // userId -> {ws, userData}
    
    this.setupWebSocket();
    console.log('🌐 WebSocket server started');
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      // Generate unique user ID
      const userId = uuidv4();
      const userIp = req.socket.remoteAddress;
      
      console.log(`🔗 New WebSocket connection: ${userId} from ${userIp}`);
      
      // Store session
      this.sessions.set(userId, {
        ws,
        userData: {
          id: userId,
          ip: userIp,
          connectedAt: new Date(),
          isActive: false
        }
      });
      
      // Send user their ID
      this.sendToUser(userId, {
        type: 'connection',
        userId: userId,
        message: 'Connected to TumiCodes Support'
      });
      
      // Handle incoming messages from user
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleUserMessage(userId, message);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });
      
      // Handle disconnection
      ws.on('close', () => {
        this.handleDisconnect(userId);
      });
      
      ws.on('error', (error) => {
        console.error(`WebSocket error for ${userId}:`, error);
        this.handleDisconnect(userId);
      });
    });
  }

  handleUserMessage(userId, message) {
    const session = this.sessions.get(userId);
    if (!session) return;
    
    switch (message.type) {
      case 'chat':
        // Forward user message to Telegram
        if (this.telegramBot && session.userData.isActive) {
          this.telegramBot.sendToSupport(
            `💬 *User Message* (ID: \`${userId}\`)\n\n${message.text}`,
            { parse_mode: 'Markdown' }
          );
          
          // Send confirmation to user
          this.sendToUser(userId, {
            type: 'message_status',
            status: 'sent',
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'typing':
        // User is typing indicator
        if (this.telegramBot && session.userData.isActive) {
          this.telegramBot.sendToSupport(
            `✍️ User \`${userId}\` is typing...`,
            { parse_mode: 'Markdown' }
          );
        }
        break;
        
      case 'request_activation':
        // User requests to become active (from queue)
        this.activateUser(userId);
        break;
    }
  }

  // Activate a user (make them the active chat session)
  activateUser(userId) {
    // If there's already an active user, add to queue
    if (this.activeUser && this.activeUser !== userId) {
      if (!this.queue.includes(userId)) {
        this.queue.push(userId);
        this.updateQueuePositions();
        
        // Notify user they're in queue
        this.sendToUser(userId, {
          type: 'queue_update',
          position: this.queue.indexOf(userId) + 1,
          queueSize: this.queue.length
        });
        
        // Notify Telegram about new user in queue
        if (this.telegramBot) {
          this.telegramBot.notifyNewUser(userId, true, this.queue.indexOf(userId) + 1);
        }
      }
      return false;
    }
    
    // Set as active user
    this.activeUser = userId;
    const session = this.sessions.get(userId);
    if (session) {
      session.userData.isActive = true;
      session.userData.activatedAt = new Date();
    }
    
    // Remove from queue if they were in it
    const queueIndex = this.queue.indexOf(userId);
    if (queueIndex > -1) {
      this.queue.splice(queueIndex, 1);
      this.updateQueuePositions();
    }
    
    // Notify user they're connected
    this.sendToUser(userId, {
      type: 'connected',
      message: 'Connected to TumiCodes Support Team',
      timestamp: new Date().toISOString()
    });
    
    // Notify Telegram
    if (this.telegramBot) {
      this.telegramBot.notifyNewUser(userId, false);
    }
    
    console.log(`✅ User activated: ${userId}`);
    return true;
  }

  // Forward message from Telegram to active user
  forwardToUser(message, originalMessage) {
    if (!this.activeUser) return false;
    
    const success = this.sendToUser(this.activeUser, {
      type: 'support_message',
      text: message,
      original: originalMessage,
      timestamp: new Date().toISOString()
    });
    
    return success;
  }

  // End current session
  endCurrentSession(reason = 'Session ended') {
    if (!this.activeUser) return;
    
    const userId = this.activeUser;
    
    // Notify user
    this.sendToUser(userId, {
      type: 'session_end',
      reason: reason,
      timestamp: new Date().toISOString()
    });
    
    // Close connection
    const session = this.sessions.get(userId);
    if (session && session.ws) {
      session.ws.close(1000, 'Session ended by support');
    }
    
    // Cleanup
    this.sessions.delete(userId);
    this.activeUser = null;
    
    // Activate next user in queue
    this.activateNextUser();
    
    // Notify Telegram
    if (this.telegramBot) {
      this.telegramBot.notifyUserDisconnect(userId, reason);
    }
    
    console.log(`❌ Session ended for: ${userId}`);
  }

  // Activate next user in queue
  activateNextUser() {
    if (this.queue.length > 0) {
      const nextUserId = this.queue.shift();
      this.updateQueuePositions();
      
      // Notify next user
      setTimeout(() => {
        this.sendToUser(nextUserId, {
          type: 'queue_advance',
          message: 'You are now connecting to support...',
          position: 0
        });
        
        // Activate after short delay
        setTimeout(() => {
          this.activateUser(nextUserId);
        }, 2000);
      }, 1000);
      
      // Notify Telegram
      if (this.telegramBot) {
        this.telegramBot.notifyQueueUpdate(this.queue.length, nextUserId);
      }
    }
  }

  // Update positions for all users in queue
  updateQueuePositions() {
    this.queue.forEach((userId, index) => {
      this.sendToUser(userId, {
        type: 'queue_update',
        position: index + 1,
        queueSize: this.queue.length,
        estimatedWait: (index + 1) * 2 // Rough estimate in minutes
      });
    });
  }

  // Handle user disconnect
  handleDisconnect(userId) {
    // If active user disconnects
    if (this.activeUser === userId) {
      this.endCurrentSession('User disconnected');
    } else {
      // Remove from queue
      const queueIndex = this.queue.indexOf(userId);
      if (queueIndex > -1) {
        this.queue.splice(queueIndex, 1);
        this.updateQueuePositions();
      }
      
      // Cleanup session
      this.sessions.delete(userId);
      console.log(`🔌 User disconnected: ${userId}`);
    }
  }

  // Send message to specific user
  sendToUser(userId, data) {
    const session = this.sessions.get(userId);
    if (session && session.ws.readyState === WebSocket.OPEN) {
      try {
        session.ws.send(JSON.stringify(data));
        return true;
      } catch (error) {
        console.error(`Error sending to user ${userId}:`, error);
        return false;
      }
    }
    return false;
  }

  // Get queue information
  getQueueInfo() {
    return {
      active: this.activeUser,
      queue: [...this.queue],
      queueSize: this.queue.length,
      sessions: this.sessions.size
    };
  }

  // Get system status
  getSystemStatus() {
    const queueInfo = this.getQueueInfo();
    return `🏥 *TumiCodes Support System Status*
    
Active Users: ${queueInfo.active ? '1 (Connected)' : 'None'}
Users in Queue: ${queueInfo.queueSize}
Total Sessions: ${queueInfo.sessions}

Server Time: ${new Date().toLocaleTimeString()}`;
  }
}

module.exports = WebSocketManager;