// RightShell entry point. One process hosts both clients:
//   RightShell (tabs/splits/multimedia workspace) and myShell (quake focus mode).
// Launch with --client=myshell (or name the exe myShell.exe) to start in quake mode.
const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const store = require('./settings/store');
const windows = require('./windows');
const hotkeys = require('./hotkeys');
const ipc = require('./ipc');
const pty = require('./pty');
const mediaIpc = require('./media-ipc');

// Software rendering fallback for remote/headless sessions or broken GPU drivers.
if (process.argv.includes('--disable-gpu')) {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}

const ICON = path.join(__dirname, '..', '..', 'assets', 'icon.png');

function clientFromArgv(argv) {
  const arg = argv.find((a) => a.startsWith('--client='));
  if (arg) return arg.split('=')[1];
  // Portable builds extract to a temp dir under a fixed name, so identify the
  // client by the original launcher path the portable wrapper exposes.
  const exe = (process.env.PORTABLE_EXECUTABLE_FILE || process.execPath).toLowerCase();
  if (exe.includes('myshell')) return 'myshell';
  return 'rightshell';
}

let tray = null;

function buildTray() {
  const image = nativeImage.createFromPath(ICON);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 }));
  tray.setToolTip('RightShell — Win+` 召唤 RightShell · Ctrl+` 召唤 myShell');
  const menu = Menu.buildFromTemplate([
    { label: '显示 RightShell', click: () => windows.summonRightShell() },
    { label: '显示 myShell (Quake)', click: () => windows.showQuake() },
    { type: 'separator' },
    { label: '设置', click: () => windows.openSettings() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        windows.setQuitting(true);
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => windows.summonRightShell());
}

// D1-APP fix: resident native handles (tray icon, ipc channels, keep-alive
// sockets) kept the loop from draining — app.quit()/process.exit() hung with
// all windows closed (matrix A/B 4/4 HANG). Release them explicitly.
// Exported because process.exit() bypasses before-quit: smoke's finish() must
// call this itself or it hangs the same way (matrix d1 FORCE-KILL evidence).
function releaseHandles() {
  hotkeys.unregisterAll();
  pty.killAll();
  mediaIpc.stop();
  ipc.unregister();
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function bootstrap(opts = {}) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.on('second-instance', (e, argv) => {
    const client = clientFromArgv(argv);
    if (client === 'myshell') windows.showQuake();
    else windows.summonRightShell();
  });

  app.on('window-all-closed', () => {
    // Tray app: keep running so summon hotkeys stay alive.
  });

  app.on('before-quit', () => {
    windows.setQuitting(true);
    releaseHandles();
    // Backstop if native drain still blocks: app.exit terminates immediately.
    // unref() so the timer itself never keeps the loop alive.
    setTimeout(() => app.exit(0), 3000).unref();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.rightshell.app');
    store.init();
    ipc.register();
    buildTray();
    mediaIpc.start(() => {
      const win = [...windows.rightshellWindows].find((w) => !w.isDestroyed());
      return win ? win.webContents : null;
    });
    const hotkeyStatus = hotkeys.registerAll();

    const client = opts.client || clientFromArgv(process.argv);
    if (client === 'myshell') windows.showQuake();
    else windows.summonRightShell();

    if (opts.smoke) opts.smoke({ windows, pty, store, hotkeyStatus, mediaIpc });
  });
}

if (require.main === module) {
  bootstrap();
}

module.exports = { bootstrap, releaseHandles };