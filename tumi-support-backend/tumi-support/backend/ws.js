// ws.js
const WebSocket = require("ws");
const { sendToTelegram } = require("./bot");

let clients = new Map(); // sessionId => ws connection

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  console.log("🔌 WebSocket server initialized");

  wss.on("connection", ws => {
    console.log("🟢 WS client connected");

    ws.on("message", async raw => {
      let data;

      try { data = JSON.parse(raw); }
      catch { return; }

      // ---------------------------
      // Register user connection
      // ---------------------------
      if (data.type === "request_activation") {
        clients.set(data.sessionId, ws);
        console.log(`🔗 Active WS: ${data.sessionId}`);

        ws.send(JSON.stringify({
          type: "connected"
        }));

        // Activate session if none is active
        if (!global.activeSession) {
          global.activeSession = data.sessionId;
          sessions.get(data.sessionId).status = "connected";
        }

        return;
      }

      // ---------------------------
      // User sent chat message
      // ---------------------------
      if (data.type === "chat") {
        console.log(`📥 Message from user ${data.sessionId}:`, data.text);

        ws.send(JSON.stringify({
          type: "message_status",
          status: "sent"
        }));

        // forward to telegram
        await sendToTelegram(data.sessionId, data.text);
        return;
      }
    });

    ws.on("close", () => {
      for (let [sessionId, socket] of clients.entries()) {
        if (socket === ws) {
          clients.delete(sessionId);
          console.log(`🔴 WS disconnected: ${sessionId}`);
        }
      }
    });
  });
}

// --------------------------------------------------------
// Send message from support to frontend
// --------------------------------------------------------
function sendSupportReply(sessionId, text) {
  const client = clients.get(sessionId);
  if (!client) {
    console.log("⚠️ No active WS client for", sessionId);
    return;
  }

  client.send(JSON.stringify({
    type: "support_message",
    text,
    timestamp: new Date().toISOString()
  }));
}

// --------------------------------------------------------

module.exports = { setupWebSocket, sendSupportReply };
