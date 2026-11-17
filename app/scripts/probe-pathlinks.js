// Probe: why does PathLinkProvider return no links?
const path = require('path');
const { app, BrowserWindow } = require('electron');
const store = require('../src/main/settings/store');
const ipc = require('../src/main/ipc');

app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  store.init();
  ipc.register();
  const win = new BrowserWindow({
    width: 1000, height: 700, show: true,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload', 'preload.js'), contextIsolation: true, sandbox: false },
  });
  win.webContents.on('console-message', (e, level, message) => console.log(`[r] ${message}`));
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 3000));
  const out = await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      RSDebug.dispatch('pane.split', { direction: 'right' });
      RSDebug.dispatch('app.commandPalette');
      setTimeout(() => {
        document.querySelector('.palette-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        rs.quake.toggle();
        setTimeout(() => {
          rs.quake.toggle();
          RSDebug.dispatch('media.toggle');
          RSDebug.dispatch('media.toggle');
          setTimeout(() => {
            const firstLeaf = (n) => (n.kind === 'leaf' ? n.pane : firstLeaf(n.a));
            const pane = firstLeaf(RSDebug.getTabs()[0].root);
            pane.term.write('C:\\\\Windows\\\\System32\\\\notepad.exe\\r\\n');
            setTimeout(() => {
              const buf = pane.term.buffer.active;
              const nonEmpty = [];
              let y = -1;
              for (let i = 0; i < buf.length; i++) {
                const l = buf.getLine(i);
                const t = l ? l.translateToString(true) : '';
                if (t) nonEmpty.push({ i, t });
                if (t.includes('notepad.exe')) y = i;
              }
              if (y < 0) return resolve({ bufLength: buf.length, nonEmpty, found: false, attached: !!pane.el.parentElement, cols: pane.term.cols });
              pane._pathProvider.provideLinks(y, (links) => {
                resolve({ bufLength: buf.length, y, found: true, links: links ? links.map((l) => l.text) : null });
              });
            }, 800);
          }, 1200);
        }, 1200);
      }, 400);
    })
  `);
  console.log('[probe]', JSON.stringify(out, null, 2));
  app.exit(0);
  setTimeout(() => process.exit(0), 2000);
});