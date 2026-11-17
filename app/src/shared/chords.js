// Shared chord codec used by main (global hotkeys) and renderer (key dispatch).
// Canonical chord form: "ctrl+alt+shift+win+<key>" (lowercase, fixed modifier order).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Chords = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MOD_ORDER = ['ctrl', 'alt', 'shift', 'win'];

  const EVENT_KEY_MAP = {
    ' ': 'space',
    '`': 'backquote',
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
    escape: 'esc',
    delete: 'del',
    insert: 'insert',
    '+': 'plus',
    '-': 'minus',
    '=': 'equals',
    '_': 'minus',
    pageup: 'pgup',
    pagedown: 'pgdn',
    contextmenu: 'menu',
  };

  const ACCEL_KEY_MAP = {
    space: 'Space',
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    esc: 'Escape',
    del: 'Delete',
    insert: 'Insert',
    plus: 'Plus',
    minus: '-',
    equals: '=',
    backquote: '`',
    comma: ',',
    period: '.',
    slash: '/',
    backslash: '\\',
    semicolon: ';',
    quote: "'",
    bracketleft: '[',
    bracketright: ']',
    pgup: 'PageUp',
    pgdn: 'PageDown',
    home: 'Home',
    end: 'End',
    tab: 'Tab',
    enter: 'Enter',
    backspace: 'Backspace',
    menu: 'ContextMenu',
  };

  function canonicalKey(raw) {
    const k = String(raw).toLowerCase();
    if (EVENT_KEY_MAP[k]) return EVENT_KEY_MAP[k];
    if (/^f\d{1,2}$/.test(k)) return k;
    if (k.length === 1) return k;
    return k;
  }

  function normalize(parts) {
    const mods = new Set();
    let key = null;
    for (const p of parts) {
      const v = String(p).toLowerCase().trim();
      if (MOD_ORDER.includes(v)) mods.add(v);
      else if (v === 'cmd' || v === 'meta' || v === 'super') mods.add('win');
      else if (v === 'commandorcontrol') mods.add('ctrl');
      else if (v) key = canonicalKey(v);
    }
    if (!key) return null;
    return [...MOD_ORDER.filter((m) => mods.has(m)), key].join('+');
  }

  function fromEvent(e) {
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null;
    const parts = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    if (e.metaKey) parts.push('win');
    parts.push(e.key);
    return normalize(parts);
  }

  function parse(chord) {
    if (!chord) return null;
    return normalize(String(chord).split('+'));
  }

  function toAccelerator(chord) {
    const norm = parse(chord);
    if (!norm) return null;
    const parts = norm.split('+');
    const key = parts.pop();
    const mods = parts.map((m) => {
      if (m === 'ctrl') return 'CommandOrControl';
      if (m === 'win') return 'Super';
      if (m === 'alt') return 'Alt';
      if (m === 'shift') return 'Shift';
      return m;
    });
    let accelKey = ACCEL_KEY_MAP[key];
    if (!accelKey) accelKey = key.length === 1 ? key.toUpperCase() : key;
    return [...mods, accelKey].join('+');
  }

  function pretty(chord) {
    const norm = parse(chord);
    if (!norm) return '';
    const names = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', win: 'Win' };
    return norm
      .split('+')
      .map((p) => names[p] || (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
      .join(' + ');
  }

  return { normalize, fromEvent, parse, toAccelerator, pretty, MOD_ORDER };
});