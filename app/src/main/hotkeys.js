// Global summon hotkeys: Ctrl+Alt+` -> RightShell, Ctrl+` -> myShell (defaults,
// rebindable in the settings UI). Registered process-wide via globalShortcut.
const { globalShortcut } = require('electron');
const Chords = require('../shared/chords');
const store = require('./settings/store');
const windows = require('./windows');

function registerAll() {
  globalShortcut.unregisterAll();
  const summon = store.get().summon;
  const results = {};

  const tryRegister = (name, chord, handler) => {
    const accel = Chords.toAccelerator(chord);
    if (!accel) {
      results[name] = { ok: false, chord, error: 'invalid chord' };
      return;
    }
    try {
      const ok = globalShortcut.register(accel, handler);
      results[name] = { ok, chord, accel };
      if (!ok) console.warn(`[hotkeys] failed to register ${name}: ${accel}`);
    } catch (err) {
      results[name] = { ok: false, chord, accel, error: err.message };
      console.warn(`[hotkeys] error registering ${name}:`, err.message);
    }
  };

  tryRegister('rightshell', summon.rightshell, () => windows.toggleRightShell());
  tryRegister('myshell', summon.myshell, () => windows.toggleQuake());
  windows.broadcast('hotkeys:status', results);
  return results;
}

function unregisterAll() {
  globalShortcut.unregisterAll();
}

module.exports = { registerAll, unregisterAll };