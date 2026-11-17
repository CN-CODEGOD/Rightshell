// RightShell client: tabs + split panes + multimedia workspace.
// All capabilities are dispatched through the Action framework; key chords are
// resolved from the settings store (defaults + user overrides).
/* global rs, TermPane, SplitTree, Chords, schemeToTheme */

const state = {
  settings: null,
  actions: [],
  bindingMap: new Map(),
  tabs: [],
  activeTabId: null,
  focusedPane: null,
  zoomedPane: null,
};

const els = {};
let uidCounter = 0;
const uid = (p) => `${p}-${++uidCounter}-${Date.now().toString(36)}`;

// ---------- helpers ----------
const profileById = (id) => state.settings.profiles.find((p) => p.id === id);
const visibleProfiles = () => state.settings.profiles.filter((p) => !p.hidden);
const activeTab = () => state.tabs.find((t) => t.id === state.activeTabId);
const tabOfPane = (pane) => state.tabs.find((t) => SplitTree.leaves(t.root).includes(pane));

function effectiveOpacity(profile) {
  if ((profile.opacity ?? 100) < 100) return profile.opacity;
  const a = state.settings.appearance;
  if (a.backgroundImage) return a.backgroundOpacity;
  if (a.acrylic && document.body.classList.contains('acrylic')) return a.acrylicOpacity ?? 78;
  return 100;
}

function paneProfile(pane) {
  return profileById(pane.profile.id) || pane.profile;
}

// ---------- panes & tabs ----------
function createPane(profile, tab) {
  const pane = new TermPane({
    profile,
    settings: state.settings,
    opacityOverride: effectiveOpacity(profile),
    onTitle: (p, title) => {
      const t = tabOfPane(p);
      if (!t || t.customTitle) return;
      if (p === state.focusedPane || SplitTree.leaves(t.root).length === 1) {
        t.title = title || profile.name;
        renderTabs();
        updateTitlebar();
      }
    },
    onBell: (p) => ringBell(p),
    onFocus: (p) => {
      state.focusedPane = p;
      updateStatus();
    },
    onExit: () => updateStatus(),
  });
  pane.tabId = tab.id;
  return pane;
}

function newTab(profileId, opts = {}) {
  const profile = profileById(profileId) || profileById(state.settings.general.defaultProfile) || visibleProfiles()[0];
  const tab = { id: uid('tab'), title: profile.name, customTitle: null, profileId: profile.id, root: null };
  const pane = createPane(profile, tab);
  tab.root = SplitTree.leaf(pane);
  state.tabs.push(tab);
  switchTab(tab.id);
  if (!opts.silent) pane.term.focus();
  return tab;
}

function switchTab(id) {
  state.activeTabId = id;
  state.zoomedPane = null;
  renderWorkspace();
  renderTabs();
  updateTitlebar();
  const tab = activeTab();
  const panes = SplitTree.leaves(tab.root);
  const target = panes.includes(state.focusedPane) ? state.focusedPane : panes[0];
  if (target) target.term.focus();
  updateStatus();
}

function closeTab(tab) {
  for (const p of SplitTree.leaves(tab.root)) p.dispose();
  const idx = state.tabs.indexOf(tab);
  state.tabs.splice(idx, 1);
  if (!state.tabs.length) {
    rs.window.action('close');
    return;
  }
  if (state.activeTabId === tab.id) {
    switchTab(state.tabs[Math.min(idx, state.tabs.length - 1)].id);
  } else {
    renderTabs();
  }
}

function closePane(pane) {
  const tab = tabOfPane(pane);
  if (!tab) return;
  const node = SplitTree.findLeaf(tab.root, pane);
  if (tab.root === node) {
    closeTab(tab);
    return;
  }
  const parent = SplitTree.findParent(tab.root, node);
  const sibling = parent.a === node ? parent.b : parent.a;
  tab.root = SplitTree.replaceNode(tab.root, parent, sibling);
  pane.dispose();
  if (state.zoomedPane === pane) state.zoomedPane = null;
  renderWorkspace();
  SplitTree.firstLeaf(sibling).term.focus();
}

function splitPane(direction = 'auto', profileId) {
  const tab = activeTab();
  const focused = state.focusedPane;
  if (!tab || !focused || !SplitTree.leaves(tab.root).includes(focused)) return;
  const node = SplitTree.findLeaf(tab.root, focused);
  let dir = direction;
  if (dir === 'auto') {
    const r = els.workspace.getBoundingClientRect();
    dir = r.width >= r.height ? 'right' : 'down';
  }
  const axis = dir === 'left' || dir === 'right' ? 'row' : 'col';
  const profile = profileById(profileId) || paneProfile(focused);
  const newPane = createPane(profile, tab);
  const oldLeaf = SplitTree.leaf(focused);
  const newLeaf = SplitTree.leaf(newPane);
  const first = dir === 'left' || dir === 'up';
  const split = { kind: 'split', dir: axis, a: first ? newLeaf : oldLeaf, b: first ? oldLeaf : newLeaf, ratio: 0.5 };
  tab.root = SplitTree.replaceNode(tab.root, node, split);
  state.zoomedPane = null;
  renderWorkspace();
  newPane.term.focus();
}

function moveFocus(direction) {
  const tab = activeTab();
  if (!tab || !state.focusedPane) return;
  const target = SplitTree.focusDirection(tab.root, state.focusedPane, direction);
  if (target) target.term.focus();
}

function resizePane(direction) {
  const tab = activeTab();
  if (!tab || !state.focusedPane) return;
  if (SplitTree.resizeDirection(tab.root, state.focusedPane, direction)) renderWorkspace();
}

// ---------- rendering ----------
function renderWorkspace() {
  const tab = activeTab();
  if (!tab) return;
  if (state.zoomedPane && SplitTree.leaves(tab.root).includes(state.zoomedPane)) {
    els.workspace.textContent = '';
    els.workspace.appendChild(state.zoomedPane.el);
    state.zoomedPane.scheduleFit();
  } else {
    state.zoomedPane = null;
    SplitTree.renderTree(tab.root, els.workspace, {});
  }
  if (searchEl) els.workspace.appendChild(searchEl);
}

function renderTabs() {
  els.tabs.textContent = '';
  for (const tab of state.tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === state.activeTabId ? ' active' : '');
    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.customTitle || tab.title;
    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.title = '关闭标签页';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab);
    });
    el.append(title, close);
    el.addEventListener('click', () => switchTab(tab.id));
    el.addEventListener('auxclick', (e) => {
      if (e.button === 1) closeTab(tab);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      tabContextMenu(e, tab);
    });
    els.tabs.appendChild(el);
  }
}

function updateTitlebar() {
  const tab = activeTab();
  els.appTitle.textContent = tab ? `${tab.customTitle || tab.title} — RightShell` : 'RightShell';
  document.title = els.appTitle.textContent;
}

function updateStatus() {
  const p = state.focusedPane;
  if (!p) {
    els.status.textContent = '';
    return;
  }
  const profile = paneProfile(p);
  const scheme = p.schemeOverride || profile.scheme;
  const size = `${p.term.cols}×${p.term.rows}`;
  els.status.textContent = `${profile.name}  ·  ${scheme}  ·  ${size}${p.dead ? '  ·  已退出' : ''}`;
}

function applyBackground() {
  const img = state.settings.appearance.backgroundImage;
  els.workspace.style.backgroundImage = img ? `url("${img.replace(/\\/g, '/')}")` : '';
}

function applyTheme() {
  document.body.dataset.theme = state.settings.general.theme || 'dark';
}

function ringBell(pane) {
  const style = paneProfile(pane).bellStyle || 'audible';
  if (style === 'none') return;
  pane.el.classList.remove('bell-flash');
  void pane.el.offsetWidth;
  pane.el.classList.add('bell-flash');
  if (style === 'audible') beep();
}

let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.16);
  } catch {
    /* audio unavailable */
  }
}

// ---------- actions ----------
const handlers = {
  'app.commandPalette': () => togglePalette(),
  'tab.new': (args) => newTab(args?.profile),
  'tab.close': () => activeTab() && closeTab(activeTab()),
  'tab.closeOthers': () => {
    const keep = activeTab();
    for (const t of [...state.tabs]) if (t !== keep) closeTab(t);
  },
  'tab.next': () => {
    const i = state.tabs.findIndex((t) => t.id === state.activeTabId);
    switchTab(state.tabs[(i + 1) % state.tabs.length].id);
  },
  'tab.prev': () => {
    const i = state.tabs.findIndex((t) => t.id === state.activeTabId);
    switchTab(state.tabs[(i - 1 + state.tabs.length) % state.tabs.length].id);
  },
  'tab.duplicate': () => activeTab() && newTab(activeTab().profileId),
  'tab.switch': (args) => {
    const i = args?.index ?? 0;
    const tab = i === -1 ? state.tabs[state.tabs.length - 1] : state.tabs[i];
    if (tab) switchTab(tab.id);
  },
  'tab.rename': () => renameTab(activeTab()),
  'tab.moveForward': () => moveTab(1),
  'tab.moveBackward': () => moveTab(-1),
  'pane.split': (args) => splitPane(args?.direction || 'auto', args?.profile),
  'pane.close': () => state.focusedPane && closePane(state.focusedPane),
  'pane.focus': (args) => moveFocus(args?.direction || 'right'),
  'pane.resize': (args) => resizePane(args?.direction || 'right'),
  'pane.zoom': () => {
    state.zoomedPane = state.zoomedPane ? null : state.focusedPane;
    renderWorkspace();
    state.focusedPane?.term.focus();
  },
  'edit.copy': () => state.focusedPane?.copy(),
  'edit.paste': () => state.focusedPane?.paste(),
  'edit.selectAll': () => state.focusedPane?.term.selectAll(),
  'find.toggle': () => openSearch(),
  'scroll.up': () => state.focusedPane?.term.scrollLines(-1),
  'scroll.down': () => state.focusedPane?.term.scrollLines(1),
  'scroll.pageUp': () => state.focusedPane?.term.scrollPages(-1),
  'scroll.pageDown': () => state.focusedPane?.term.scrollPages(1),
  'scroll.top': () => state.focusedPane?.term.scrollToTop(),
  'scroll.bottom': () => state.focusedPane?.term.scrollToBottom(),
  'buffer.clear': () => state.focusedPane?.term.clear(),
  'font.increase': () => state.focusedPane?.adjustFont(1),
  'font.decrease': () => state.focusedPane?.adjustFont(-1),
  'font.reset': () => state.focusedPane?.adjustFont(0),
  'scheme.set': (args) => args?.name && state.focusedPane?.setScheme(args.name),
  'opacity.adjust': (args) => {
    const p = state.focusedPane;
    if (!p) return;
    const cur = p.opacityOverride ?? 100;
    p.opacityOverride = Math.max(10, Math.min(100, cur + (args?.delta ?? -10)));
    p.applyAppearance(paneProfile(p), state.settings);
  },
  'media.toggle': () => window.MediaPlayer && MediaPlayer.toggle(),
  'media.playPause': () => window.MediaPlayer && MediaPlayer.playPause(),
  'media.next': () => window.MediaPlayer && MediaPlayer.next(),
  'media.prev': () => window.MediaPlayer && MediaPlayer.prev(),
};

const mainActions = {
  'app.newWindow': () => rs.window.action('new'),
  'app.closeWindow': async () => {
    if (await confirmClose()) rs.window.action('close');
  },
  'app.quit': () => rs.app.quit(),
  'app.toggleFullscreen': () => rs.window.action('toggleFullscreen'),
  'app.toggleAlwaysOnTop': () => rs.window.action('toggleAlwaysOnTop'),
  'app.openSettings': () => window.SettingsUI && SettingsUI.open(),
  'app.summonRightShell': () => rs.rightshell.summon(),
  'app.summonMyShell': () => rs.quake.toggle(),
  'quake.toggle': () => rs.quake.toggle(),
  'quake.hide': () => rs.quake.hide(),
};

function dispatch(actionId, args) {
  if (handlers[actionId]) handlers[actionId](args);
  else if (mainActions[actionId]) mainActions[actionId](args);
}

async function rebuildBindings() {
  const bindings = await rs.actions.bindings();
  state.bindingMap = new Map();
  for (const b of bindings) state.bindingMap.set(b.keys, b);
}

function setupKeys() {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.target.closest && e.target.closest('.overlay, .modal, .popup-menu')) return;
      const chord = Chords.fromEvent(e);
      if (!chord) return;
      const pane = state.focusedPane;
      if (chord === 'ctrl+c' && pane?.term.hasSelection()) {
        e.preventDefault();
        e.stopPropagation();
        pane.copy();
        return;
      }
      if (chord === 'enter' && pane?.term.hasSelection()) {
        e.preventDefault();
        e.stopPropagation();
        pane.copy();
        return;
      }
      const binding = state.bindingMap.get(chord);
      if (binding) {
        e.preventDefault();
        e.stopPropagation();
        dispatch(binding.action, binding.args);
      }
    },
    true
  );
}

// ---------- command palette ----------
let paletteEl = null;
function paletteItems() {
  const items = [];
  for (const a of state.actions) {
    if (a.id === 'scheme.set' || a.id === 'tab.switch') continue;
    items.push({
      label: a.name,
      hint: a.keys[0] ? Chords.pretty(a.keys[0]) : '',
      group: a.category,
      run: () => dispatch(a.id, a.id === 'pane.split' ? { direction: 'auto' } : undefined),
    });
  }
  for (const p of visibleProfiles()) {
    items.push({ label: `新建标签页: ${p.name}`, group: '配置文件', run: () => newTab(p.id) });
    items.push({ label: `拆分窗格: ${p.name}`, group: '配置文件', run: () => splitPane('auto', p.id) });
  }
  for (const s of state.settings.schemes) {
    items.push({ label: `配色方案: ${s.name}`, group: '配色', run: () => dispatch('scheme.set', { name: s.name }) });
  }
  return items;
}

function togglePalette() {
  if (paletteEl) {
    paletteEl.remove();
    paletteEl = null;
    state.focusedPane?.term.focus();
    return;
  }
  const items = paletteItems();
  paletteEl = document.createElement('div');
  paletteEl.className = 'overlay palette';
  paletteEl.innerHTML = `
    <div class="palette-box">
      <input class="palette-input" placeholder="输入命令… (Esc 关闭)" />
      <div class="palette-list"></div>
    </div>`;
  document.body.appendChild(paletteEl);
  const input = paletteEl.querySelector('.palette-input');
  const list = paletteEl.querySelector('.palette-list');
  let filtered = items;
  let sel = 0;

  const renderList = () => {
    list.textContent = '';
    filtered.slice(0, 60).forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'palette-item' + (i === sel ? ' selected' : '');
      const label = document.createElement('span');
      label.textContent = item.label;
      const hint = document.createElement('span');
      hint.className = 'palette-hint';
      hint.textContent = item.hint || item.group;
      row.append(label, hint);
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        item.run();
        togglePalette();
      });
      list.appendChild(row);
    });
  };
  const filter = () => {
    const q = input.value.trim().toLowerCase();
    filtered = q
      ? items.filter((it) => it.label.toLowerCase().includes(q) || (it.group || '').toLowerCase().includes(q))
      : items;
    sel = 0;
    renderList();
  };
  input.addEventListener('input', filter);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      togglePalette();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      sel = Math.min(sel + 1, filtered.length - 1);
      renderList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(sel - 1, 0);
      renderList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[sel];
      togglePalette();
      if (item) item.run();
    }
  });
  paletteEl.addEventListener('mousedown', (e) => {
    if (e.target === paletteEl) togglePalette();
  });
  filter();
  input.focus();
}

// ---------- search ----------
let searchEl = null;
function openSearch() {
  const pane = state.focusedPane;
  if (!pane) return;
  if (searchEl) {
    searchEl.querySelector('input').focus();
    return;
  }
  searchEl = document.createElement('div');
  searchEl.className = 'overlay search-box';
  searchEl.innerHTML = `
    <input placeholder="查找" />
    <button data-act="prev" title="上一个 (Shift+Enter)">↑</button>
    <button data-act="next" title="下一个 (Enter)">↓</button>
    <button data-act="case" title="区分大小写">Aa</button>
    <button data-act="close" title="关闭 (Esc)">×</button>`;
  els.workspace.appendChild(searchEl);
  const input = searchEl.querySelector('input');
  let caseSensitive = false;
  const opts = () => {
    const termOpts = { caseSensitive, incremental: true };
    return termOpts;
  };
  const find = (dir) => {
    if (!input.value) return;
    if (dir === 'prev') pane.searchAddon.findPrevious(input.value, opts());
    else pane.searchAddon.findNext(input.value, opts());
  };
  input.addEventListener('input', () => find('next'));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
    else if (e.key === 'Enter') {
      e.preventDefault();
      find(e.shiftKey ? 'prev' : 'next');
    }
  });
  searchEl.addEventListener('click', (e) => {
    const act = e.target.dataset?.act;
    if (act === 'prev') find('prev');
    else if (act === 'next') find('next');
    else if (act === 'case') {
      caseSensitive = !caseSensitive;
      e.target.classList.toggle('on', caseSensitive);
      find('next');
    } else if (act === 'close') closeSearch();
  });
  if (pane.term.hasSelection()) input.value = pane.term.getSelection().split('\n')[0];
  input.focus();
  input.select();
}

function closeSearch() {
  if (!searchEl) return;
  searchEl.remove();
  searchEl = null;
  state.focusedPane?.term.focus();
}

// ---------- menus & modals ----------
function popupMenu(x, y, entries) {
  document.querySelectorAll('.popup-menu').forEach((m) => m.remove());
  const menu = document.createElement('div');
  menu.className = 'popup-menu';
  for (const entry of entries) {
    if (entry === '-') {
      menu.appendChild(document.createElement('hr'));
      continue;
    }
    const item = document.createElement('div');
    item.className = 'popup-item';
    item.textContent = entry.label;
    item.addEventListener('click', () => {
      menu.remove();
      entry.run();
    });
    menu.appendChild(item);
  }
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  setTimeout(() => {
    const dismiss = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        window.removeEventListener('mousedown', dismiss);
      }
    };
    window.addEventListener('mousedown', dismiss);
  }, 0);
}

function tabContextMenu(e, tab) {
  popupMenu(e.clientX, e.clientY, [
    { label: '重命名', run: () => renameTab(tab) },
    { label: '复制标签页', run: () => newTab(tab.profileId) },
    { label: '左移', run: () => moveTabObj(tab, -1) },
    { label: '右移', run: () => moveTabObj(tab, 1) },
    '-',
    { label: '关闭', run: () => closeTab(tab) },
    { label: '关闭其他', run: () => {
      for (const t of [...state.tabs]) if (t !== tab) closeTab(t);
    } },
  ]);
}

function moveTab(delta) {
  const tab = activeTab();
  if (tab) moveTabObj(tab, delta);
}

function moveTabObj(tab, delta) {
  const i = state.tabs.indexOf(tab);
  const j = i + delta;
  if (j < 0 || j >= state.tabs.length) return;
  state.tabs.splice(i, 1);
  state.tabs.splice(j, 0, tab);
  renderTabs();
}

function renameTab(tab) {
  if (!tab) return;
  showInputModal('重命名标签页', tab.customTitle || tab.title).then((value) => {
    if (value === null) return;
    tab.customTitle = value.trim() || null;
    renderTabs();
    updateTitlebar();
  });
}

function showInputModal(title, initialValue) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'overlay modal';
    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title"></div>
        <input class="modal-input" />
        <div class="modal-buttons">
          <button data-act="cancel">取消</button>
          <button data-act="ok" class="primary">确定</button>
        </div>
      </div>`;
    modal.querySelector('.modal-title').textContent = title;
    const input = modal.querySelector('.modal-input');
    input.value = initialValue || '';
    document.body.appendChild(modal);
    const done = (v) => {
      modal.remove();
      resolve(v);
      state.focusedPane?.term.focus();
    };
    modal.querySelector('[data-act="ok"]').addEventListener('click', () => done(input.value));
    modal.querySelector('[data-act="cancel"]').addEventListener('click', () => done(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value);
      if (e.key === 'Escape') done(null);
    });
    input.focus();
    input.select();
  });
}

function confirmClose() {
  if (state.tabs.length <= 1 || !state.settings.general.confirmCloseAllTabs) return Promise.resolve(true);
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'overlay modal';
    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">关闭 RightShell？</div>
        <div class="modal-text">当前有 ${state.tabs.length} 个标签页，关闭后所有会话将结束。</div>
        <div class="modal-buttons">
          <button data-act="cancel">取消</button>
          <button data-act="ok" class="primary">全部关闭</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const done = (v) => {
      modal.remove();
      resolve(v);
    };
    modal.querySelector('[data-act="ok"]').addEventListener('click', () => done(true));
    modal.querySelector('[data-act="cancel"]').addEventListener('click', () => done(false));
  });
}

// ---------- settings sync ----------
async function onSettingsChanged(settings) {
  state.settings = settings;
  await rebuildBindings();
  applyTheme();
  applyBackground();
  for (const tab of state.tabs) {
    for (const pane of SplitTree.leaves(tab.root)) {
      pane.applyAppearance(paneProfile(pane), settings, effectiveOpacity(paneProfile(pane)));
    }
  }
  renderTabs();
  updateStatus();
}

// ---------- boot ----------
async function init() {
  els.tabs = document.getElementById('tabs');
  els.workspace = document.getElementById('workspace');
  els.status = document.getElementById('status');
  els.appTitle = document.getElementById('app-title');

  state.settings = await rs.settings.get();
  state.actions = await rs.actions.list();
  await rebuildBindings();
  applyTheme();
  applyBackground();
  setupKeys();

  document.getElementById('btn-new-tab').addEventListener('click', () => newTab());
  document.getElementById('btn-new-tab-dropdown').addEventListener('click', (e) => {
    const r = e.target.getBoundingClientRect();
    popupMenu(r.left, r.bottom + 4, visibleProfiles().map((p) => ({ label: p.name, run: () => newTab(p.id) })));
  });
  document.getElementById('btn-min').addEventListener('click', () => rs.window.action('minimize'));
  document.getElementById('btn-max').addEventListener('click', () => rs.window.action('maximize'));
  document.getElementById('btn-close').addEventListener('click', async () => {
    if (await confirmClose()) rs.window.action('close');
  });
  document.getElementById('btn-settings').addEventListener('click', () => SettingsUI.open());
  document.getElementById('btn-palette').addEventListener('click', () => togglePalette());
  document.getElementById('btn-media').addEventListener('click', () => MediaPlayer.toggle());

  if (window.MediaPlayer) MediaPlayer.init();
  if (window.SettingsUI) SettingsUI.init();

  rs.window.onState((s) => {
    document.body.classList.toggle('maximized', !!s.maximized);
  });
  rs.window.onSummoned(() => {
    if (!state.tabs.length) newTab(state.settings.general.defaultProfile);
  });
  rs.window.onMaterial(({ mode }) => {
    document.body.classList.toggle('acrylic', mode === 'acrylic');
    for (const tab of state.tabs) {
      for (const pane of SplitTree.leaves(tab.root)) {
        pane.applyAppearance(paneProfile(pane), state.settings, effectiveOpacity(paneProfile(pane)));
      }
    }
  });
  rs.settings.onOpen(() => SettingsUI.open());
  rs.settings.onChange(onSettingsChanged);

  window.TerminalFocus = () => state.focusedPane?.term.focus();
  window.RSDebug = {
    getTabs: () => state.tabs,
    getFocusedPane: () => state.focusedPane,
    dispatch,
  };
  window.RSToast = (msg) => {
    let toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add('hidden'), 3500);
  };

  newTab(state.settings.general.defaultProfile);
}

init();