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

function register() {
  ipcMain.handle('settings:get', () => store.get());
  ipcMain.handle('settings:set', (e, dotPath, value) => {
    store.set(dotPath, value);
    return store.get();
  });
  ipcMain.handle('settings:reset', () => {
    store.reset();
    return store.get();
  });
  ipcMain.handle('settings:open', () => {
    windows.openSettings();
  });

  ipcMain.handle('actions:list', () => actions.listForRenderer(store.get()));
  ipcMain.handle('actions:bindings', () => actions.resolveBindings(store.get().keybindings || {}));

  ipcMain.handle('pty:create', (e, opts) => pty.create(opts, e.sender));
  ipcMain.on('pty:write', (e, id, data) => pty.write(id, data));
  ipcMain.on('pty:resize', (e, id, cols, rows) => pty.resize(id, cols, rows));
  ipcMain.on('pty:kill', (e, id) => pty.kill(id));

  ipcMain.handle('clipboard:read', () => clipboard.readText());
  ipcMain.handle('clipboard:write', (e, text) => clipboard.writeText(text));

  ipcMain.handle('window:action', (e, action) => {
    const win = require('electron').BrowserWindow.fromWebContents(e.sender);
    if (win) windows.handleWindowAction(win, action);
  });

  ipcMain.handle('quake:toggle', () => windows.toggleQuake());
  ipcMain.handle('quake:hide', () => windows.hideQuake());
  ipcMain.handle('rightshell:summon', () => windows.summonRightShell());

  ipcMain.handle('dialog:openFile', async (e, opts) => {
    const win = require('electron').BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: opts?.filters || [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('shell:openExternal', (e, url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  ipcMain.handle('shell:openPath', async (e, p) => {
    if (!p || typeof p !== 'string') return 'empty path';
    return shell.openPath(p);
  });

  ipcMain.handle('shell:showItemInFolder', (e, p) => {
    if (p && typeof p === 'string') shell.showItemInFolder(p);
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    userData: app.getPath('userData'),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }));
  ipcMain.handle('app:quit', () => {
    windows.setQuitting(true);
    app.quit();
  });

  ipcMain.handle('profiles:detect', () => {
    detectPwsh();
  });

  store.on('changed', (data) => {
    windows.broadcast('settings:changed', data);
    hotkeys.registerAll();
    windows.refreshMaterials();
  });

  detectPwsh();
}

module.exports = { register };