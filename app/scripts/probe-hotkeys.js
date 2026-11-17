// Probe: which global hotkey accelerators can actually be registered?
const { app, globalShortcut } = require('electron');
app.whenReady().then(() => {
  const candidates = [
    'Super+`',
    'CommandOrControl+`',
    'Super+Backquote',
    'CommandOrControl+Backquote',
    'Super+F1',
    'CommandOrControl+Shift+`',
    'Alt+`',
  ];
  for (const a of candidates) {
    let result;
    try {
      result = globalShortcut.register(a, () => {});
    } catch (e) {
      result = 'THREW: ' + e.message;
    }
    console.log(`${a} => ${result}`);
    if (result === true) globalShortcut.unregister(a);
  }
  console.log('isRegistered Super+` after unregister:', globalShortcut.isRegistered('Super+`'));
  app.exit(0);
});