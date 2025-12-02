/**
 * Main Server File for TumiCodes Support System
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
require('dotenv').config();

const config = require('./config');
const WebSocketManager = require('../websocket/ws');
const TelegramBotHandler = require('./bot');


// Load environment variables
require('dotenv').config();

// Add production error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

class SupportServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.port = config.server.port;
    
    // Initialize components
    this.telegramBot = null;
    this.wsManager = null;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // CORS configuration
    this.app.use(cors({
      origin: config.server.frontendUrl,
      credentials: true
    }));
    
    // Body parser
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Static files (for frontend if served from backend)
    this.app.use(express.static(path.join(__dirname, '../frontend')));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'TumiCodes Support System'
      });
    });
    
    // API Routes
    this.app.post('/api/start', (req, res) => {
      try {
        // Generate user ID (in production, this would come from auth)
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Check if we can activate immediately
        const canActivate = !this.wsManager || !this.wsManager.activeUser;
        
        if (canActivate) {
          // User will be activated when they connect via WebSocket
          res.json({
            success: true,
            status: 'connected',
            userId: userId,
            message: 'Connecting you to support...'
          });
        } else {
          // User needs to go to queue
          const queueSize = this.wsManager ? this.wsManager.queue.length + 1 : 1;
          res.json({
            success: true,
            status: 'queued',
            userId: userId,
            position: queueSize,
            message: 'You have been added to the queue'
          });
        }
      } catch (error) {
        console.error('Error in /start:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to start session'
        });
      }
    });
    
    this.app.post('/api/end', (req, res) => {
      try {
        const { userId } = req.body;
        
        if (this.wsManager) {
          if (userId && this.wsManager.activeUser === userId) {
            this.wsManager.endCurrentSession('User ended the chat');
          }
        }
        
        res.json({
          success: true,
          message: 'Session ended'
        });
      } catch (error) {
        console.error('Error in /end:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to end session'
        });
      }
    });
    
    this.app.get('/api/queue-status', (req, res) => {
      try {
        const queueInfo = this.wsManager ? this.wsManager.getQueueInfo() : {
          active: null,
          queue: [],
          queueSize: 0,
          sessions: 0
        };
        
        res.json({
          success: true,
          ...queueInfo
        });
      } catch (error) {
        console.error('Error getting queue status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get queue status'
        });
      }
    });
    
    // Frontend routes
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/index.html'));
    });
    
    this.app.get('/loading', (req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/loading.html'));
    });
    
    this.app.get('/chat', (req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/chat.html'));
    });
    
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    });
  }

  setupErrorHandling() {
    // Error handling middleware
    this.app.use((err, req, res, next) => {
      console.error('Server error:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
      });
    });
  }

  start() {
    // Start HTTP server
    this.server.listen(this.port, () => {
      console.log(`🚀 Server running on port ${this.port}`);
      console.log(`🌐 Frontend URL: ${config.server.frontendUrl}`);
      console.log(`📡 Health check: http://localhost:${this.port}/health`);
      
      // Initialize WebSocket manager
      this.wsManager = new WebSocketManager(this.server);
      
      // Initialize Telegram bot (if token is provided)
      if (config.telegram.token) {
        this.telegramBot = new TelegramBotHandler(this.wsManager);
        this.wsManager.telegramBot = this.telegramBot;
      } else {
        console.warn('⚠️  Telegram bot token not provided. Bot functionality disabled.');
        console.warn('   Set TELEGRAM_BOT_TOKEN in .env file to enable bot features.');
      }
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  shutdown() {
    console.log('🛑 Shutting down server...');
    
    if (this.wsManager) {
      // Close all WebSocket connections
      this.wsManager.wss.close(() => {
        console.log('🌐 WebSocket server closed');
      });
    }
    
    this.server.close(() => {
      console.log('🚪 HTTP server closed');
      process.exit(0);
    });
  }
}

// Start the server
const server = new SupportServer();
server.start();