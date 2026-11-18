// Local control endpoint: lets any shell running inside RightShell drive the
// app (media player, notifications, Explorer) via the bundled `rsctl` helper.
// Bound to loopback only; every request must carry the per-process token that
// is injected into each PTY session's environment.
const http = require('http');
const { shell } = require('electron');
const { uid } = require('./util');

class MediaIpc {
  constructor() {
    this.port = 0;
    this.token = uid();
    this.server = null;
    this.target = null; // webContents of the RightShell window hosting the player
  }

  start(getTarget) {
    this.getTarget = getTarget;
    this.server = http.createServer((req, res) => this._handle(req, res));
    this.server.listen(0, '127.0.0.1', () => {
      this.port = this.server.address().port;
      console.log(`[media-ipc] listening on 127.0.0.1:${this.port}`);
    });
  }

  _send(command) {
    const target = this.getTarget && this.getTarget();
    if (target && !target.isDestroyed()) {
      target.send('media:command', command);
      return true;
    }
    return false;
  }

  _handle(req, res) {
    const done = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.headers['x-rs-token'] !== this.token) return done(403, { ok: false, error: 'bad token' });
    const url = new URL(req.url, 'http://localhost');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const arg = params.get('arg') || url.searchParams.get('arg') || '';
      switch (url.pathname) {
        case '/play':
          done(200, { ok: this._send({ type: 'play', path: arg }) });
          break;
        case '/enqueue':
          done(200, { ok: this._send({ type: 'enqueue', path: arg }) });
          break;
        case '/open':
          shell.openPath(arg);
          done(200, { ok: true });
          break;
        case '/notify':
          done(200, { ok: this._send({ type: 'notify', message: arg }) });
          break;
        case '/ping':
          done(200, { ok: true, app: 'RightShell' });
          break;
        default:
          done(404, { ok: false, error: 'unknown command' });
      }
    });
  }

  env() {
    return { RS_IPC_PORT: String(this.port), RS_IPC_TOKEN: this.token };
  }

  stop() {
    if (this.server) {
      // keep-alive sockets otherwise keep server.close() pending forever (D1-APP)
      if (typeof this.server.closeAllConnections === 'function') this.server.closeAllConnections();
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = new MediaIpc();