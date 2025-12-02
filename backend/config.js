// backend/config.js - Production updates
module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5500',
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  
  // Telegram Bot configuration - Updated for production
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    supportChatId: process.env.TELEGRAM_SUPPORT_CHAT_ID,
    polling: process.env.NODE_ENV === 'production',
    webhook: process.env.NODE_ENV === 'production' ? {
      port: process.env.PORT || 3000,
      host: process.env.RENDER_EXTERNAL_HOSTNAME || '0.0.0.0'
    } : null,
    pollingInterval: 300,
    timeout: 60000
  },
  
  // ... rest of the config remains same
};