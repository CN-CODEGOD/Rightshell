// IPC surface between the settings framework / PTY / windows and the renderers.
const { ipcMain, clipboard, dialog, shell, app } = require('electron');
const { execFile } = require('child_process');
const store = require('./settings/store');
const actions = require('./settings/actions');
const pty = require('./pty');
const windows = require('./windows');
const hotkeys = require('./hotkeys');

function detectPwsh() {
  execFile('where.exe', ['pwsh'], { windowsHide: true }, (err, stdout) => {
    const found = !err && stdout.trim().length > 0;
    const profiles = store.get().profiles;
    const p = profiles.find((x) => x.id === 'pwsh');
    if (p && p.hidden !== !found) {
      p.hidden = !found;
      store.set('profiles', profiles);
    }
  });
}

const handledChannels = [];
const listenedChannels = [];

function register() {
  const handle = (ch, fn) => { handledChannels.push(ch); ipcMain.handle(ch, fn); };
  const on = (ch, fn) => { listenedChannels.push(ch); ipcMain.on(ch, fn); };
  handle('settings:get', () => store.get());
  handle('settings:set', (e, dotPath, value) => {
    store.set(dotPath, value);
    return store.get();
  });
  handle('settings:reset', () => {
    store.reset();
    return store.get();
  });
  handle('settings:open', () => {
    windows.openSettings();
  });

  handle('actions:list', () => actions.listForRenderer(store.get()));
  handle('actions:bindings', () => actions.resolveBindings(store.get().keybindings || {}));

  handle('pty:create', (e, opts) => pty.create(opts, e.sender));
  on('pty:write', (e, id, data) => pty.write(id, data));
  on('pty:resize', (e, id, cols, rows) => pty.resize(id, cols, rows));
  on('pty:kill', (e, id) => pty.kill(id));

  handle('clipboard:read', () => clipboard.readText());
  handle('clipboard:write', (e, text) => clipboard.writeText(text));

  handle('window:action', (e, action) => {
    const win = require('electron').BrowserWindow.fromWebContents(e.sender);
    if (win) windows.handleWindowAction(win, action);
  });

  handle('quake:toggle', () => windows.toggleQuake());
  handle('quake:hide', () => windows.hideQuake());
  handle('rightshell:summon', () => windows.summonRightShell());

  handle('dialog:openFile', async (e, opts) => {
    const win = require('electron').BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: opts?.filters || [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  handle('shell:openExternal', (e, url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  handle('shell:openPath', async (e, p) => {
    if (!p || typeof p !== 'string') return 'empty path';
    return shell.openPath(p);
  });

  handle('shell:showItemInFolder', (e, p) => {
    if (p && typeof p === 'string') shell.showItemInFolder(p);
  });

  handle('app:info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    userData: app.getPath('userData'),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }));
  handle('app:quit', () => {
    windows.setQuitting(true);
    app.quit();
  });

  handle('profiles:detect', () => {
    detectPwsh();
  });

  store.on('changed', (data) => {
    windows.broadcast('settings:changed', data);
    hotkeys.registerAll();
    windows.refreshMaterials();
  });

  detectPwsh();
}

// D1-APP fix: release ipcMain handlers/listeners on quit so no resident
// channel keeps the main process from draining.
function unregister() {
  for (const ch of handledChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* already removed */ }
  }
  handledChannels.length = 0;
  for (const ch of listenedChannels) ipcMain.removeAllListeners(ch);
  listenedChannels.length = 0;
}

module.exports = { register, unregister };