// ============================================================
// ws.js – WebSocket server for live notifications & comments
// ============================================================
const { WebSocketServer } = require('ws');

let wss = null;
// Map postId → Set of ws clients subscribed to that post
const postSubs = new Map();
// Map userId → ws client
const userSubs = new Map();

function initWS(server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        // Client sends { type:'subscribe_post', postId } or { type:'subscribe_user', userId }
        if (msg.type === 'subscribe_post' && msg.postId) {
          if (!postSubs.has(msg.postId)) postSubs.set(msg.postId, new Set());
          postSubs.get(msg.postId).add(ws);
          ws._postId = msg.postId;
        }
        if (msg.type === 'subscribe_user' && msg.userId) {
          userSubs.set(msg.userId, ws);
          ws._userId = msg.userId;
        }
      } catch {}
    });

    ws.on('close', () => {
      if (ws._postId && postSubs.has(ws._postId)) postSubs.get(ws._postId).delete(ws);
      if (ws._userId) userSubs.delete(ws._userId);
    });
  });

  // Heartbeat every 30s
  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));
  console.log('  WebSocket server ready');
}

// Broadcast to all clients subscribed to a post, or all clients
function broadcast(payload) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  if (payload.postId && postSubs.has(payload.postId)) {
    postSubs.get(payload.postId).forEach(ws => {
      if (ws.readyState === 1) ws.send(msg);
    });
  }
  // For notifications, target specific user
  if (payload.type === 'notification' && payload.userId) {
    const ws = userSubs.get(payload.userId);
    if (ws && ws.readyState === 1) ws.send(msg);
  }
  // For reactions/likes broadcast to all
  if (['reaction'].includes(payload.type) && payload.postId) {
    // already done above
  }
}

// Notify specific user via WS (called from notificationController)
function notifyUser(userId, payload) {
  const ws = userSubs.get(userId);
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type:'notification', ...payload }));
}

module.exports = { initWS, broadcast, notifyUser };
