// WindowManager: the two clients of RightShell.
//  - RightShell: normal multi-window, tabs + split panes (the "multimedia" workspace)
//  - myShell:    a single quake-style dropdown window for focused terminal use
// Both share one process, one tray and the global summon hotkeys.
const { BrowserWindow, screen, app } = require('electron');
const path = require('path');
const store = require('./settings/store');
const pty = require('./pty');
const acrylic = require('./acrylic');

const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');
const RENDERER = path.join(__dirname, '..', 'renderer');
const ICON = path.join(__dirname, '..', '..', 'assets', 'icon.png');

let appQuitting = false;

class WindowManager {
  constructor() {
    this.rightshellWindows = new Set();
    this.quakeWindow = null;
    this._quakeAnim = null;
    this._quakeVisible = false;
    this._quakeHiding = false;
  }

  _baseWindowOpts(extra) {
    return {
      width: 1200,
      height: 800,
      minWidth: 420,
      minHeight: 300,
      backgroundColor: '#0C0C0C',
      frame: false,
      show: false,
      icon: ICON,
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
      },
      ...extra,
    };
  }

  // ---------- RightShell ----------
  _applyMaterial(win) {
    const a = store.get().appearance;
    let mode = 'opaque';
    if (a.acrylic) {
      mode = acrylic.applyToWindow(win, { tint: '#0c1016', alpha: (a.acrylicOpacity ?? 78) / 100 });
    }
    if (!win.isDestroyed()) win.webContents.send('window:material', { mode });
    return mode;
  }

  createRightShell() {
    const win = new BrowserWindow(
      this._baseWindowOpts({
        title: 'RightShell',
        transparent: true,
        backgroundColor: '#00000000',
      })
    );
    win.loadFile(path.join(RENDERER, 'index.html'));
    // Terminal output must never be timer-throttled when the window loses focus
    // (quake summon steals focus; background throttling stalls xterm writes).
    win.webContents.setBackgroundThrottling(false);
    win.once('ready-to-show', () => {
      this._applyMaterial(win);
      win.show();
    });

    win.on('close', (e) => {
      if (appQuitting) return;
      e.preventDefault();
      if (store.get().general.closeBehavior === 'quit') {
        appQuitting = true;
        app.quit();
      } else {
        win.hide();
      }
    });
    win.on('closed', () => {
      this.rightshellWindows.delete(win);
      pty.killOwnedBy(win.webContents.id);
    });
    win.on('maximize', () => win.webContents.send('window:state', { maximized: true }));
    win.on('unmaximize', () => win.webContents.send('window:state', { maximized: false }));
    win.on('enter-full-screen', () => win.webContents.send('window:state', { fullscreen: true }));
    win.on('leave-full-screen', () => win.webContents.send('window:state', { fullscreen: false }));

    this.rightshellWindows.add(win);
    return win;
  }

  summonRightShell() {
    let win = [...this.rightshellWindows].find((w) => !w.isDestroyed() && w.isVisible());
    if (!win) win = [...this.rightshellWindows].find((w) => !w.isDestroyed());
    if (!win) win = this.createRightShell();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send('window:summoned');
    return win;
  }

  toggleRightShell() {
    const win = [...this.rightshellWindows].find((w) => !w.isDestroyed() && w.isVisible());
    if (win && win.isFocused()) {
      win.hide();
    } else {
      this.summonRightShell();
    }
  }

  // ---------- myShell (quake) ----------
  _quakeBounds() {
    const display = screen.getPrimaryDisplay();
    const area = display.workArea;
    const q = store.get().quake;
    const height = Math.round(area.height * (q.heightPercent / 100));
    const y = q.edge === 'bottom' ? area.y + area.height - height : area.y;
    return { x: area.x, y, width: area.width, height };
  }

  ensureQuake() {
    if (this.quakeWindow && !this.quakeWindow.isDestroyed()) return this.quakeWindow;
    const win = new BrowserWindow(
      this._baseWindowOpts({
        title: 'myShell',
        skipTaskbar: true,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        transparent: true,
        backgroundColor: '#00000000',
        alwaysOnTop: store.get().quake.alwaysOnTop,
      })
    );
    win.loadFile(path.join(RENDERER, 'quake.html'));
    win.webContents.setBackgroundThrottling(false);
    win.on('close', (e) => {
      if (appQuitting) return;
      e.preventDefault();
      this.hideQuake();
    });
    win.on('blur', () => {
      if (store.get().quake.hideOnFocusLoss && this._quakeVisible && !this._quakeHiding) {
        this.hideQuake();
      }
    });
    win.on('closed', () => {
      if (this.quakeWindow === win) {
        this.quakeWindow = null;
        this._quakeVisible = false;
        pty.killOwnedBy(win.webContents.id);
      }
    });
    this.quakeWindow = win;
    return win;
  }

  _animateQuake(win, fromY, toY, done) {
    clearInterval(this._quakeAnim);
    const ms = Math.max(0, store.get().quake.animationMs);
    const bounds = win.getBounds();
    if (ms === 0) {
      win.setBounds({ ...bounds, y: toY });
      done && done();
      return;
    }
    const start = Date.now();
    this._quakeAnim = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const y = Math.round(fromY + (toY - fromY) * eased);
      if (!win.isDestroyed()) win.setBounds({ ...win.getBounds(), y });
      if (t >= 1) {
        clearInterval(this._quakeAnim);
        this._quakeAnim = null;
        done && done();
      }
    }, 16);
  }

  showQuake() {
    const win = this.ensureQuake();
    const target = this._quakeBounds();
    const q = store.get().quake;
    win.setAlwaysOnTop(q.alwaysOnTop, 'screen-saver');
    if (store.get().appearance.acrylic) {
      acrylic.applyToWindow(win, { tint: '#0c1016', alpha: (q.opacity ?? 95) / 100 });
    }
    const startY = q.edge === 'bottom' ? target.y + target.height : target.y - target.height;
    win.setBounds({ x: target.x, y: startY, width: target.width, height: target.height });
    win.show();
    win.focus();
    this._quakeVisible = true;
    this._quakeHiding = false;
    this._animateQuake(win, startY, target.y, () => {
      if (!win.isDestroyed()) win.webContents.send('quake:state', { visible: true });
    });
  }

  hideQuake() {
    const win = this.quakeWindow;
    if (!win || win.isDestroyed() || !this._quakeVisible) return;
    this._quakeHiding = true;
    const bounds = win.getBounds();
    const q = store.get().quake;
    const endY = q.edge === 'bottom' ? bounds.y + bounds.height : bounds.y - bounds.height;
    this._animateQuake(win, bounds.y, endY, () => {
      if (!win.isDestroyed()) win.hide();
      this._quakeVisible = false;
      this._quakeHiding = false;
      if (!win.isDestroyed()) win.webContents.send('quake:state', { visible: false });
    });
  }

  toggleQuake() {
    if (this._quakeVisible && !this._quakeHiding) this.hideQuake();
    else this.showQuake();
  }

  // ---------- settings (in-window overlay, no separate window) ----------
  openSettings() {
    const win = this.summonRightShell();
    win.webContents.send('settings:open');
    return win;
  }

  refreshMaterials() {
    for (const win of this.rightshellWindows) {
      if (!win.isDestroyed()) this._applyMaterial(win);
    }
    if (this.quakeWindow && !this.quakeWindow.isDestroyed() && this._quakeVisible) {
      const q = store.get().quake;
      if (store.get().appearance.acrylic) {
        acrylic.applyToWindow(this.quakeWindow, { tint: '#0c1016', alpha: (q.opacity ?? 95) / 100 });
      }
    }
  }

  // ---------- shared ----------
  broadcast(channel, ...args) {
    for (const win of [...this.rightshellWindows, this.quakeWindow]) {
      if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
    }
  }

  handleWindowAction(win, action) {
    switch (action) {
      case 'minimize':
        win.minimize();
        break;
      case 'maximize':
        win.isMaximized() ? win.unmaximize() : win.maximize();
        break;
      case 'close':
        win.close();
        break;
      case 'new':
        this.createRightShell();
        break;
      case 'toggleFullscreen':
        win.setFullScreen(!win.isFullScreen());
        break;
      case 'toggleAlwaysOnTop':
        win.setAlwaysOnTop(!win.isAlwaysOnTop());
        break;
      case 'quit':
        appQuitting = true;
        app.quit();
        break;
    }
  }

  setQuitting(v) {
    appQuitting = v;
  }
}

module.exports = new WindowManager();