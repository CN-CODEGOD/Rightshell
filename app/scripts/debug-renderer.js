// Debug: capture the renderer error that prevents TermPane creation.
const path = require('path');
const { app, BrowserWindow } = require('electron');
const store = require('../src/main/settings/store');
const ipc = require('../src/main/ipc');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

app.whenReady().then(async () => {
  store.init();
  ipc.register();
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on('render-process-gone', (e, details) => {
    console.log('[render-process-gone]', JSON.stringify(details));
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 3000));
  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const out = {};
      try {
        out.panesBefore = document.querySelectorAll('.pane').length;
        const s = await rs.settings.get();
        out.profiles = s.profiles.map(p => p.id);
        const pane = new TermPane({ profile: s.profiles[0], settings: s, onTitle(){}, onBell(){}, onFocus(){}, onExit(){} });
        out.paneCreated = !!pane;
        out.termCols = pane.term.cols;
      } catch (e) {
        out.error = e.message;
        out.stack = e.stack;
      }
      try {
        newTab('powershell');
        out.tabsAfter = document.querySelectorAll('.tab').length;
        out.panesAfter = document.querySelectorAll('.pane').length;
      } catch (e) {
        out.newTabError = e.message;
        out.newTabStack = e.stack;
      }
      return out;
    })()
  `);
  console.log('[debug]', JSON.stringify(result, null, 2));
  app.exit(0);
});