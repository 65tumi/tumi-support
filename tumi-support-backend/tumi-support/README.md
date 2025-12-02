TumiCodes Support Live Chat - Backend (Render-ready)

This package contains a production-ready Node.js backend that provides:
- WebSocket real-time chat
- Queue management (single active session, queued users)
- Two-way integration with a Telegram support chat via node-telegram-bot-api
- Health check endpoint, graceful shutdown, and logging

Files:
- backend/server.js        (main Express + WebSocket server)
- backend/bot.js           (Telegram bot bridge)
- backend/config.js        (configuration and env validation)
- websocket/ws.js          (WebSocket server manager)
- backend/package.json     (dependencies)
- render.yaml              (Render deployment config)
- Procfile                 (start command)
- .env.example             (example env vars)
- .gitignore

How to run locally:
1. Copy `.env.example` to `.env` and fill your values.
2. cd backend
3. npm install
4. npm start

Deploy to Render:
- Connect repo to Render, ensure environment variables are set on Render (do not commit secrets).
- Use provided render.yaml or create a Web Service with start command: `cd backend && node server.js`

