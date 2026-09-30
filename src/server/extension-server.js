// WebSocket & HTTP Server for Chrome Extension Communication

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

class ExtensionServer {
  constructor(port = 48123) {
    this.port = port;
    this.httpServer = null;
    this.wss = null;
    this.clients = new Set();
    this.onViolationCallback = null;
    this.onSecurityBlockedCallback = null;
    this.activeSession = null;
    this.securityRules = { blockedDomains: [], blockAdultContent: false };
  }

  start() {
    if (this.httpServer) return;

    this.httpServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          connectedClients: this.clients.size,
          activeSession: this.activeSession
        }));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    this.httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[DayArc Server] Port ${this.port} is already in use by background process. Skipping re-bind.`);
      } else {
        console.error('[DayArc Server] HTTP Server error:', err);
      }
    });

    try {
      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on('error', (err) => {
        console.warn('[DayArc Server] WebSocket Server error:', err.message);
      });

      this.wss.on('connection', (ws) => {
        this.clients.add(ws);
        console.log(`[DayArc Server] Chrome Extension connected (${this.clients.size} client(s))`);

        // Immediately sync current state
        if (this.activeSession) {
          ws.send(JSON.stringify({
            type: 'START_SESSION',
            ...this.activeSession
          }));
        }

        ws.send(JSON.stringify({
          type: 'SYNC_SECURITY_RULES',
          ...this.securityRules
        }));

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            this.handleClientMessage(msg, ws);
          } catch (e) {
            console.error('[DayArc Server] Error parsing client message:', e);
          }
        });

        ws.on('close', () => {
          this.clients.delete(ws);
          console.log(`[DayArc Server] Chrome Extension disconnected (${this.clients.size} client(s))`);
        });

        ws.on('error', (err) => {
          console.warn('[DayArc Server] Client socket error:', err.message);
          this.clients.delete(ws);
        });
      });

      this.httpServer.listen(this.port, '127.0.0.1', () => {
        console.log(`[DayArc Server] Listening on http://127.0.0.1:${this.port} for Chrome Extension`);
      });
    } catch (err) {
      console.warn('[DayArc Server] Failed to initialize WebSocket server:', err.message);
    }
  }

  handleClientMessage(msg, ws) {
    if (msg.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG' }));
    } else if (msg.type === 'URL_VIOLATION') {
      console.log('[DayArc Server] URL violation received:', msg.url);
      if (this.onViolationCallback) {
        this.onViolationCallback(msg);
      }
    } else if (msg.type === 'SECURITY_BLOCKED') {
      console.log('[DayArc Server] Security site blocked:', msg.url);
      if (this.onSecurityBlockedCallback) {
        this.onSecurityBlockedCallback(msg);
      }
    } else if (msg.type === 'MINIMIZE_DETECTED' || msg.type === 'ESCAPE_ATTEMPT') {
      console.log('[DayArc Server] Minimize escape detected from extension:', msg);
      if (this.onMinimizeEscapeCallback) {
        this.onMinimizeEscapeCallback(msg);
      }
    }
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  startSession(sessionData) {
    this.activeSession = sessionData;
    this.broadcast({
      type: 'START_SESSION',
      ...sessionData
    });
  }

  stopSession() {
    this.activeSession = null;
    this.broadcast({
      type: 'STOP_SESSION'
    });
  }

  restoreBrowserWindow() {
    this.broadcast({
      type: 'RESTORE_BROWSER_WINDOW'
    });
  }

  syncSecurityRules(blockedDomains, blockAdultContent) {
    this.securityRules = { blockedDomains, blockAdultContent };
    this.broadcast({
      type: 'SYNC_SECURITY_RULES',
      blockedDomains,
      blockAdultContent
    });
  }

  onViolation(callback) {
    this.onViolationCallback = callback;
  }

  onSecurityBlocked(callback) {
    this.onSecurityBlockedCallback = callback;
  }

  onMinimizeEscape(callback) {
    this.onMinimizeEscapeCallback = callback;
  }

  stop() {
    if (this.wss) this.wss.close();
    if (this.httpServer) this.httpServer.close();
    this.clients.clear();
  }
}

module.exports = new ExtensionServer();
