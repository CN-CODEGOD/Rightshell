// myShell client: focused single-pane quake terminal. No tabs, no splits —
// just the shell, summoned with Ctrl+` and dismissed on focus loss.
/* global rs, TermPane, Chords */

let pane = null;
let settings = null;
let bindingMap = new Map();

const profileById = (id) => settings.profiles.find((p) => p.id === id);

function opacity() {
  return settings.quake.opacity ?? 95;
}

async function rebuildBindings() {
  const bindings = await rs.actions.bindings();
  bindingMap = new Map();
  for (const b of bindings) bindingMap.set(b.keys, b);
}

function spawn() {
  const profile = profileById(settings.general.defaultProfile) || settings.profiles[0];
  pane = new TermPane({
    profile,
    settings,
    opacityOverride: opacity(),
    onTitle: (p, t) => {
      document.title = t ? `myShell — ${t}` : 'myShell';
    },
    onFocus: () => {},
    onBell: () => {
      const el = document.getElementById('quake-workspace');
      el.classList.remove('bell-flash');
      void el.offsetWidth;
      el.classList.add('bell-flash');
    },
  });
  document.getElementById('quake-workspace').appendChild(pane.el);
  pane.term.focus();
}

async function onSettingsChanged(s) {
  settings = s;
  await rebuildBindings();
  if (pane) pane.applyAppearance(profileById(pane.profile.id) || pane.profile, s, opacity());
}

function setupKeys() {
  window.addEventListener(
    'keydown',
    (e) => {
      const chord = Chords.fromEvent(e);
      if (!chord) return;
      if (chord === 'ctrl+c' && pane?.term.hasSelection()) {
        e.preventDefault();
        e.stopPropagation();
        pane.copy();
        return;
      }
      const binding = bindingMap.get(chord);
      if (!binding) return;
      // myShell only honors a focused subset of the action framework.
      const allowed = {
        'edit.copy': () => pane.copy(),
        'edit.paste': () => pane.paste(),
        'edit.selectAll': () => pane.term.selectAll(),
        'font.increase': () => pane.adjustFont(1),
        'font.decrease': () => pane.adjustFont(-1),
        'font.reset': () => pane.adjustFont(0),
        'buffer.clear': () => pane.term.clear(),
        'scroll.up': () => pane.term.scrollLines(-1),
        'scroll.down': () => pane.term.scrollLines(1),
        'scroll.pageUp': () => pane.term.scrollPages(-1),
        'scroll.pageDown': () => pane.term.scrollPages(1),
        'scroll.top': () => pane.term.scrollToTop(),
        'scroll.bottom': () => pane.term.scrollToBottom(),
        'app.openSettings': () => rs.settings.open(),
        'quake.hide': () => rs.quake.hide(),
        'quake.toggle': () => rs.quake.toggle(),
        'app.summonRightShell': () => rs.rightshell.summon(),
      };
      if (allowed[binding.action]) {
        e.preventDefault();
        e.stopPropagation();
        allowed[binding.action]();
      }
    },
    true
  );
}

async function init() {
  settings = await rs.settings.get();
  await rebuildBindings();
  setupKeys();
  spawn();

  rs.settings.onChange(onSettingsChanged);
  rs.quake.onState((s) => {
    if (s.visible && pane) {
      pane.scheduleFit();
      setTimeout(() => pane.term.focus(), 60);
    }
  });
}

init();