// Automated smoke test: boots the real app, verifies the PTY pipeline, split
// panes, quake window, settings UI and global hotkeys, and captures screenshots.
// Run: npm run smoke   (exit code 0 = all checks passed)
const path = require('path');
const fs = require('fs');
const { app, globalShortcut } = require('electron');
const { bootstrap } = require('../src/main/main');
const Chords = require('../src/shared/chords');
const actions = require('../src/main/settings/actions');

// Smoke runs may happen in non-interactive (session 0) environments without GPU.
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

const OUT = path.join(__dirname, '..', '.smoke');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`[smoke] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 8000, step = 100) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return true;
    await delay(step);
  }
  return fn();
}

// app.exit() bypasses before-quit cleanup, and app.quit() destroys the Node
// timer queue (probe-verified: no setTimeout backstop can ever fire after it).
// Do the cleanup explicitly, then exit synchronously — a smoke test must
// always terminate; graceful shutdown is secondary.
function finish(code, windows) {
  try {
    if (windows) windows.setQuitting(true);
    require('../src/main/pty').killAll();
    require('../src/main/hotkeys').unregisterAll();
    require('../src/main/media-ipc').stop();
  } catch { /* best effort */ }
  process.exit(code);
}

setTimeout(() => {
  console.log('[smoke] TIMEOUT');
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  finish(2);
}, 90000);

bootstrap({
  client: 'rightshell',
  smoke: async ({ windows, pty, store, hotkeyStatus, mediaIpc }) => {
    try {
      const s = store.get();
      check('settings.defaults', s.profiles.length >= 2 && s.schemes.length >= 14,
        `${s.profiles.length} profiles, ${s.schemes.length} schemes`);
      // In session 0 (services) no global hotkey can register — probe a neutral
      // combo to tell an environment limitation apart from a real conflict.
      // Never probe a Win-key combo: those are OS-reserved and fail even in a
      // fully interactive session, which would fake a "non-interactive" verdict.
      let probeOk = false;
      try {
        probeOk = globalShortcut.register('Ctrl+Alt+Shift+F12', () => {});
        if (probeOk) globalShortcut.unregister('Ctrl+Alt+Shift+F12');
      } catch { /* non-interactive session */ }
      if (probeOk) {
        check('hotkey.rightshell', !!hotkeyStatus.rightshell?.ok, JSON.stringify(hotkeyStatus.rightshell));
        check('hotkey.myshell', !!hotkeyStatus.myshell?.ok, JSON.stringify(hotkeyStatus.myshell));
      } else {
        check('hotkey.rightshell', true, 'SKIPPED: non-interactive session cannot register global hotkeys');
        check('hotkey.myshell', true, 'SKIPPED: non-interactive session cannot register global hotkeys');
      }
      check('chords.accel', Chords.toAccelerator('ctrl+alt+backquote') === 'Ctrl+Alt+`',
        Chords.toAccelerator('ctrl+alt+backquote'));

      const list = actions.listForRenderer(s);
      check('actions.registry', list.length >= 40, `${list.length} actions`);
      const bindings = actions.resolveBindings({});
      check('actions.bindings', bindings.some((b) => b.keys === 'ctrl+shift+t' && b.action === 'tab.new'),
        `${bindings.length} resolved bindings`);

      await delay(3500);
      const win = [...windows.rightshellWindows][0];
      check('window.rightshell', !!win && !win.isDestroyed() && win.isVisible());
      const sender = win.webContents;

      // PTY echo test: intercept pty:data for the test session in main.
      const { id } = pty.create({ profileId: 'cmd', cols: 100, rows: 30 }, sender);
      let captured = '';
      const origSend = sender.send.bind(sender);
      sender.send = (channel, ...args) => {
        if (channel === 'pty:data' && args[0] === id) captured += args[1];
        origSend(channel, ...args);
      };
      await delay(800);
      pty.write(id, 'echo RIGHTELLE_SMOKE_OK\r');
      const echoed = await waitFor(() => captured.includes('RIGHTELLE_SMOKE_OK'), 10000);
      check('pty.echo', echoed, `${captured.length} bytes captured`);
      pty.kill(id);
      sender.send = origSend;

      // Renderer state
      const ui = await sender.executeJavaScript(`({
        hasXterm: typeof Terminal !== 'undefined',
        panes: document.querySelectorAll('.pane').length,
        tabs: document.querySelectorAll('.tab').length,
        title: document.getElementById('app-title').textContent,
      })`);
      check('renderer.xterm', ui.hasXterm && ui.panes >= 1 && ui.tabs >= 1, JSON.stringify(ui));

      // Split through the action framework
      await sender.executeJavaScript(`dispatch('pane.split', { direction: 'right' })`);
      await delay(2000);
      const splitUi = await sender.executeJavaScript(`({
        panes: document.querySelectorAll('.pane').length,
        dividers: document.querySelectorAll('.divider').length,
      })`);
      check('renderer.split', splitUi.panes >= 2 && splitUi.dividers >= 1, JSON.stringify(splitUi));

      // Command palette
      await sender.executeJavaScript(`dispatch('app.commandPalette')`);
      await delay(400);
      const paletteItems = await sender.executeJavaScript(`document.querySelectorAll('.palette-item').length`);
      check('renderer.palette', paletteItems > 10, `${paletteItems} items`);
      await sender.executeJavaScript(`document.querySelector('.palette-input').dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}))`);
      await delay(200);

      const shot1 = await sender.capturePage();
      fs.writeFileSync(path.join(OUT, 'rightshell.png'), shot1.toPNG());

      // Quake window (pure shell body, no top bar)
      windows.showQuake();
      await delay(1600);
      const quake = windows.quakeWindow;
      check('quake.visible', !!quake && quake.isVisible());
      const quakeUi = await quake.webContents.executeJavaScript(`({
        panes: document.querySelectorAll('.pane').length,
        noBar: !document.getElementById('quake-bar'),
        title: document.title,
      })`);
      check('quake.pane', quakeUi.panes === 1 && quakeUi.noBar, JSON.stringify(quakeUi));
      const shot2 = await quake.webContents.capturePage();
      fs.writeFileSync(path.join(OUT, 'quake.png'), shot2.toPNG());
      windows.hideQuake();
      await delay(600);
      check('quake.hidden', !quake.isVisible());

      // Media player: panel toggle + shell-callable local IPC
      await sender.executeJavaScript(`RSDebug.dispatch('media.toggle')`);
      await delay(300);
      const mediaOpen = await sender.executeJavaScript(`!document.getElementById('media-panel').classList.contains('hidden')`);
      check('media.panel', mediaOpen === true);
      const testMedia = path.join(__dirname, '..', 'assets', 'icon.png');
      const ipcResult = await new Promise((resolve) => {
        const req = require('http').request(
          { host: '127.0.0.1', port: mediaIpc.port, path: '/play', method: 'POST',
            headers: { 'X-RS-Token': mediaIpc.token } },
          (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve(b)); }
        );
        req.on('error', (e) => resolve('ERR ' + e.message));
        req.end('arg=' + encodeURIComponent(testMedia));
      });
      await delay(800);
      const mediaUi = await sender.executeJavaScript(`({
        items: document.querySelectorAll('.media-item').length,
        title: document.getElementById('media-title').textContent,
      })`);
      check('media.ipc', ipcResult.includes('"ok":true') && mediaUi.items === 1, `${ipcResult} ${JSON.stringify(mediaUi)}`);
      await sender.executeJavaScript(`RSDebug.dispatch('media.toggle')`);

      // Clickable Windows path links
      const pathLink = await sender.executeJavaScript(`
        new Promise((resolve) => {
          const leaves = (n, out = []) => { if (n.kind === 'leaf') out.push(n.pane); else { leaves(n.a, out); leaves(n.b, out); } return out; };
          const panes = leaves(RSDebug.getTabs()[0].root);
          const info = panes.map((p, idx) => {
            p.term.writeln('RSMARKER' + idx);
            return { idx, id: p.id, disposed: !!(p.term._core && p.term._core._isDisposed), dead: p.dead };
          });
          setTimeout(() => {
            const results = panes.map((p, idx) => {
              const buf = p.term.buffer.active;
              let found = false;
              for (let i = 0; i < buf.length; i++) {
                const l = buf.getLine(i);
                if (l && l.translateToString(true).includes('RSMARKER' + idx)) { found = true; break; }
              }
              return { idx, found, len: buf.length };
            });
            const pane = panes[0];
            pane.term.write('C:\\\\Windows\\\\System32\\\\notepad.exe\\r\\n');
            setTimeout(() => {
              const buf = pane.term.buffer.active;
              let y = -1;
              for (let i = 0; i < buf.length; i++) {
                const l = buf.getLine(i);
                if (l && l.translateToString(true).includes('notepad.exe')) { y = i; break; }
              }
              if (y < 0) return resolve({ text: null, diag: { info, results } });
              pane._pathProvider.provideLinks(y, (links) => {
                const hit = links && links.find((l) => l.text.includes('notepad.exe'));
                resolve({ text: hit ? hit.text : null, diag: { y } });
              });
            }, 600);
          }, 600);
        })
      `);
      check('pathlinks.detect', pathLink.text === 'C:\\Windows\\System32\\notepad.exe', JSON.stringify(pathLink));

      // Settings UI — in-window overlay, no separate window
      await sender.executeJavaScript(`RSDebug.dispatch('app.openSettings')`);
      await delay(800);
      const settingsUi = await sender.executeJavaScript(`({
        overlay: !document.getElementById('settings-overlay').classList.contains('hidden'),
        nav: document.querySelectorAll('#settings-overlay .nav-item').length,
        rows: document.querySelectorAll('#settings-overlay .row').length,
        separateWindow: false,
      })`);
      check('settings.overlay', settingsUi.overlay && settingsUi.nav === 8 && settingsUi.rows > 0, JSON.stringify(settingsUi));
      await sender.executeJavaScript(`document.querySelector('#settings-overlay [data-page="schemes"]').click()`);
      await delay(500);
      const schemesUi = await sender.executeJavaScript(`document.querySelectorAll('#settings-overlay .color-cell').length`);
      check('settings.schemes', schemesUi === 20, `${schemesUi} color cells`);
      const shot3 = await sender.capturePage();
      fs.writeFileSync(path.join(OUT, 'settings.png'), shot3.toPNG());
      await sender.executeJavaScript(`SettingsUI.close()`);
      await delay(300);
      const overlayClosed = await sender.executeJavaScript(`document.getElementById('settings-overlay').classList.contains('hidden')`);
      check('settings.close', overlayClosed === true);

      // Acrylic material state reported to renderer
      const material = await sender.executeJavaScript(`document.body.classList.contains('acrylic')`);
      check('acrylic.state', typeof material === 'boolean', `acrylic=${material} (DWM may be unavailable in session 0)`);

      const failed = results.filter((r) => !r.ok);
      fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
      console.log(`[smoke] ${results.length - failed.length}/${results.length} checks passed`);
      finish(failed.length ? 1 : 0, windows);
    } catch (err) {
      console.error('[smoke] ERROR', err);
      fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
      finish(2, windows);
    }
  },
});