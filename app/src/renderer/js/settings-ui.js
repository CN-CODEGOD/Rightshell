// RightShell settings UI — the ONLY settings surface. Profiles, schemes,
// actions/keybindings and summon hotkeys are framework objects edited here;
// changes apply live to all open windows through the settings store.
// IIFE-scoped: classic scripts share one global scope with app.js.
/* global rs, Chords */
(function () {
const state = {
  settings: null,
  actions: [],
  info: null,
  page: 'general',
  selectedProfile: null,
  selectedScheme: null,
  hotkeyStatus: {},
};

// ---------- tiny DOM helpers ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}

function getPath(dot) {
  return dot.split('.').reduce((o, k) => (o == null ? undefined : o[k]), state.settings);
}

function set(dot, value) {
  const parts = dot.split('.');
  let obj = state.settings;
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
  obj[parts[parts.length - 1]] = value;
  rs.settings.set(dot, value);
}

function commitArray(dot, arr) {
  set(dot, arr);
}

// ---------- form controls ----------
function row(label, control, hint) {
  return h('div', { class: 'row' },
    h('div', { class: 'row-label' }, label, hint ? h('div', { class: 'row-hint' }, hint) : null),
    h('div', { class: 'row-control' }, control));
}

function textInput(value, onCommit, opts = {}) {
  const input = h('input', { type: 'text', class: 'input', value: value ?? '', placeholder: opts.placeholder || '' });
  const commit = () => onCommit(input.value);
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commit();
      input.blur();
    }
  });
  return input;
}

function numberInput(value, min, max, onCommit) {
  const input = h('input', { type: 'number', class: 'input input-num', value, min, max });
  input.addEventListener('change', () => {
    const v = Math.max(min, Math.min(max, Number(input.value) || min));
    input.value = v;
    onCommit(v);
  });
  return input;
}

function select(options, value, onChange) {
  const sel = h('select', { class: 'input' });
  for (const o of options) {
    const opt = h('option', { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function checkbox(checked, onChange) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'switch' }, input, h('span', { class: 'slider' }));
}

function range(min, max, value, onChange, unit = '') {
  const label = h('span', { class: 'range-value' }, `${value}${unit}`);
  const input = h('input', { type: 'range', min, max, value });
  input.addEventListener('input', () => {
    label.textContent = `${input.value}${unit}`;
    onChange(Number(input.value));
  });
  return h('div', { class: 'range-wrap' }, input, label);
}

function button(text, onClick, cls = '') {
  return h('button', { class: 'btn ' + cls, onclick: onClick }, text);
}

function section(title, ...rows) {
  return h('div', { class: 'card' }, h('div', { class: 'card-title' }, title), ...rows);
}

function pageHeader(title, desc) {
  return h('div', { class: 'page-header' }, h('h1', {}, title), desc ? h('p', {}, desc) : null);
}

// ---------- chord recorder ----------
function chordRecorder(getChords, onCommit, opts = {}) {
  const wrap = h('div', { class: 'chord-recorder' });
  const render = () => {
    wrap.textContent = '';
    const chords = getChords() || [];
    if (!chords.length) wrap.appendChild(h('span', { class: 'chord-none' }, '未绑定'));
    for (const c of chords) wrap.appendChild(h('span', { class: 'chord-chip' + (opts.conflicts?.has(c) ? ' conflict' : '') }, Chords.pretty(c)));
    wrap.appendChild(button('录制', () => startRecording(), 'btn-small'));
    if (opts.onReset && chords.length) wrap.appendChild(button('重置', opts.onReset, 'btn-small'));
  };
  const startRecording = () => {
    wrap.textContent = '';
    wrap.appendChild(h('span', { class: 'chord-recording' }, '按下快捷键… (Esc 取消，Backspace 清除)'));
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', handler, true);
        render();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        window.removeEventListener('keydown', handler, true);
        onCommit([]);
        render();
        return;
      }
      const chord = Chords.fromEvent(e);
      if (!chord) return;
      window.removeEventListener('keydown', handler, true);
      onCommit([chord]);
      render();
    };
    window.addEventListener('keydown', handler, true);
  };
  render();
  return wrap;
}

// ---------- pages ----------
function renderGeneral() {
  const g = state.settings.general;
  return [
    pageHeader('常规', 'RightShell 与 myShell 共享的全局行为。'),
    section('启动与窗口',
      row('默认配置文件', select(
        state.settings.profiles.filter((p) => !p.hidden).map((p) => ({ value: p.id, label: p.name })),
        g.defaultProfile,
        (v) => set('general.defaultProfile', v))),
      row('主题', select(
        [{ value: 'dark', label: '深色' }, { value: 'light', label: '浅色' }],
        g.theme,
        (v) => set('general.theme', v))),
      row('关闭 RightShell 窗口时', select(
        [{ value: 'hide', label: '隐藏到托盘（保持召唤热键）' }, { value: 'quit', label: '退出程序' }],
        g.closeBehavior,
        (v) => set('general.closeBehavior', v))),
      row('关闭多标签窗口前确认', checkbox(g.confirmCloseAllTabs, (v) => set('general.confirmCloseAllTabs', v)))),
    section('终端行为',
      row('选中即复制', checkbox(g.copyOnSelect, (v) => set('general.copyOnSelect', v)),
        '选中文字后自动写入剪贴板'),
      row('Windows 路径可点击', checkbox(g.clickablePaths, (v) => set('general.clickablePaths', v)),
        '输出中的 C:\\… 与 UNC 路径显示为链接，Ctrl+点击用资源管理器/默认程序打开')),
    section('重置',
      row('恢复全部默认设置', button('恢复默认', async () => {
        if (!confirm('确定恢复全部默认设置？ profiles、配色方案与快捷键都将被重置。')) return;
        state.settings = await rs.settings.reset();
        state.actions = await rs.actions.list();
        render();
      }, 'btn-danger'), '此操作不可撤销')),
  ];
}

function renderSummon() {
  const s = state.settings.summon;
  const statusLine = (name) => {
    const st = state.hotkeyStatus[name];
    if (!st) return '';
    return st.ok ? `已注册: ${st.accel}` : `注册失败: ${st.accel || st.chord}（可能被其他程序占用）`;
  };
  return [
    pageHeader('召唤快捷键', '全局热键：无论焦点在哪个程序，按下即可召唤对应客户端。再次按下隐藏。'),
    section('RightShell — 多媒体工作区',
      row('召唤 / 隐藏', chordRecorder(() => [s.rightshell], (chords) => {
        set('summon.rightshell', chords[0] || '');
      })),
      row('状态', h('span', { class: 'hint-text' }, statusLine('rightshell'))),
      row('测试', button('召唤 RightShell', () => rs.rightshell.summon()))),
    section('myShell — 专注 Quake 终端',
      row('召唤 / 隐藏', chordRecorder(() => [s.myshell], (chords) => {
        set('summon.myshell', chords[0] || '');
      })),
      row('状态', h('span', { class: 'hint-text' }, statusLine('myshell'))),
      row('测试', button('召唤 myShell', () => rs.quake.toggle()))),
    h('p', { class: 'page-note' }, '默认：Win+` 召唤 RightShell，Ctrl+` 召唤 myShell。录制时直接按下想要的组合键即可。'),
  ];
}

function renderProfiles() {
  const profiles = state.settings.profiles;
  if (!state.selectedProfile || !profiles.find((p) => p.id === state.selectedProfile)) {
    state.selectedProfile = profiles[0]?.id;
  }
  const profile = profiles.find((p) => p.id === state.selectedProfile);
  const save = () => commitArray('profiles', profiles);

  const list = h('div', { class: 'item-list' },
    ...profiles.map((p) =>
      h('div', {
        class: 'item-list-entry' + (p.id === state.selectedProfile ? ' selected' : ''),
        onclick: () => {
          state.selectedProfile = p.id;
          render();
        },
      },
        h('span', {}, p.name + (p.hidden ? '（隐藏）' : '')),
        p.id === state.settings.general.defaultProfile ? h('span', { class: 'badge' }, '默认') : null)),
    h('div', { class: 'item-list-actions' },
      button('+ 新建配置文件', () => {
        const p = {
          id: 'profile-' + Date.now().toString(36),
          name: '新配置文件',
          commandline: 'cmd.exe',
          startingDirectory: '%USERPROFILE%',
          scheme: 'Campbell',
          fontFace: 'Cascadia Mono',
          fontSize: 12,
          cursorShape: 'bar',
          bellStyle: 'audible',
          opacity: 100,
          backgroundImage: '',
          hidden: false,
        };
        profiles.push(p);
        state.selectedProfile = p.id;
        save();
        render();
      })));

  if (!profile) return [pageHeader('配置文件'), list];

  const schemeOptions = state.settings.schemes.map((s) => ({ value: s.name, label: s.name }));
  const editor = h('div', { class: 'editor' },
    row('名称', textInput(profile.name, (v) => { profile.name = v; save(); render(); })),
    row('命令行', textInput(profile.commandline, (v) => { profile.commandline = v; save(); }, { placeholder: '例如 pwsh.exe -NoLogo' }),
      '支持 %环境变量% 与引号参数'),
    row('起始目录', textInput(profile.startingDirectory, (v) => { profile.startingDirectory = v; save(); })),
    row('配色方案', select(schemeOptions, profile.scheme, (v) => { profile.scheme = v; save(); })),
    row('字体', textInput(profile.fontFace, (v) => { profile.fontFace = v; save(); })),
    row('字号', numberInput(profile.fontSize, 6, 32, (v) => { profile.fontSize = v; save(); })),
    row('光标形状', select(
      [{ value: 'bar', label: '竖线' }, { value: 'block', label: '方块' }, { value: 'underline', label: '下划线' }],
      profile.cursorShape, (v) => { profile.cursorShape = v; save(); })),
    row('铃声', select(
      [{ value: 'audible', label: '声音 + 闪烁' }, { value: 'visual', label: '仅闪烁' }, { value: 'none', label: '无' }],
      profile.bellStyle, (v) => { profile.bellStyle = v; save(); })),
    row('背景不透明度', range(10, 100, profile.opacity ?? 100, (v) => { profile.opacity = v; save(); }, '%'),
      '低于 100% 时透出窗口背景图'),
    row('背景图片', h('div', { class: 'inline-group' },
      textInput(profile.backgroundImage, (v) => { profile.backgroundImage = v; save(); }, { placeholder: '图片路径（可选）' }),
      button('浏览…', async () => {
        const f = await rs.dialog.openFile();
        if (f) { profile.backgroundImage = f; save(); render(); }
      }),
      button('清除', () => { profile.backgroundImage = ''; save(); render(); }))),
    row('在列表中隐藏', checkbox(profile.hidden, (v) => { profile.hidden = v; save(); render(); })),
    h('div', { class: 'editor-actions' },
      button('设为默认', () => { set('general.defaultProfile', profile.id); render(); }),
      button('删除', () => {
        if (profiles.length <= 1) return alert('至少保留一个配置文件。');
        if (!confirm(`删除配置文件「${profile.name}」？`)) return;
        profiles.splice(profiles.indexOf(profile), 1);
        if (state.settings.general.defaultProfile === profile.id) {
          set('general.defaultProfile', profiles[0].id);
        }
        state.selectedProfile = profiles[0].id;
        save();
        render();
      }, 'btn-danger')));

  return [
    pageHeader('配置文件', '每个配置文件定义一个 shell 环境：命令行、目录、配色、字体与多媒体外观。'),
    h('div', { class: 'split-page' }, list, editor),
  ];
}

const COLOR_FIELDS = [
  ['background', '背景'], ['foreground', '前景'], ['cursorColor', '光标'], ['selectionBackground', '选区'],
  ['black', '黑'], ['red', '红'], ['green', '绿'], ['yellow', '黄'],
  ['blue', '蓝'], ['purple', '紫'], ['cyan', '青'], ['white', '白'],
  ['brightBlack', '亮黑'], ['brightRed', '亮红'], ['brightGreen', '亮绿'], ['brightYellow', '亮黄'],
  ['brightBlue', '亮蓝'], ['brightPurple', '亮紫'], ['brightCyan', '亮青'], ['brightWhite', '亮白'],
];

function schemePreview(scheme) {
  const box = h('div', { class: 'scheme-preview', style: `background:${scheme.background};color:${scheme.foreground}` });
  const line1 = h('div', {}, `user@rightshell `);
  line1.appendChild(h('span', { style: `color:${scheme.green}` }, '➜'));
  line1.appendChild(h('span', { style: `color:${scheme.cyan}` }, ' ~/project '));
  line1.appendChild(h('span', { style: `color:${scheme.yellow}` }, 'git:('));
  line1.appendChild(h('span', { style: `color:${scheme.red}` }, 'main'));
  line1.appendChild(h('span', { style: `color:${scheme.yellow}` }, ')'));
  const line2 = h('div', {});
  for (const key of ['black', 'red', 'green', 'yellow', 'blue', 'purple', 'cyan', 'white']) {
    line2.appendChild(h('span', { style: `color:${scheme[key]};background:${scheme.background}` }, '██'));
  }
  const line3 = h('div', {});
  for (const key of ['brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightPurple', 'brightCyan', 'brightWhite']) {
    line3.appendChild(h('span', { style: `color:${scheme[key]}` }, '██'));
  }
  const line4 = h('div', {}, 'The quick brown fox jumps over the lazy dog 0123456789');
  box.append(line1, line2, line3, line4);
  return box;
}

function renderSchemes() {
  const schemes = state.settings.schemes;
  if (!state.selectedScheme || !schemes.find((s) => s.name === state.selectedScheme)) {
    state.selectedScheme = schemes[0]?.name;
  }
  const scheme = schemes.find((s) => s.name === state.selectedScheme);
  const save = () => commitArray('schemes', schemes);

  const list = h('div', { class: 'item-list' },
    ...schemes.map((s) =>
      h('div', {
        class: 'item-list-entry' + (s.name === state.selectedScheme ? ' selected' : ''),
        onclick: () => { state.selectedScheme = s.name; render(); },
      },
        h('span', { class: 'scheme-dot', style: `background:${s.background};border-color:${s.foreground}` }),
        h('span', {}, s.name))),
    h('div', { class: 'item-list-actions' },
      button('+ 新建方案', () => {
        const base = JSON.parse(JSON.stringify(scheme || schemes[0]));
        base.name = '新方案 ' + (schemes.length + 1);
        schemes.push(base);
        state.selectedScheme = base.name;
        save();
        render();
      })));

  if (!scheme) return [pageHeader('配色方案'), list];

  const grid = h('div', { class: 'color-grid' });
  for (const [key, label] of COLOR_FIELDS) {
    const color = h('input', { type: 'color', value: scheme[key] || '#000000' });
    const hex = h('input', { type: 'text', class: 'input hex-input', value: scheme[key] || '#000000' });
    const apply = (v) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
      scheme[key] = v;
      color.value = v;
      hex.value = v;
      save();
      preview.replaceWith((preview = schemePreview(scheme)));
    };
    color.addEventListener('input', () => apply(color.value));
    hex.addEventListener('change', () => apply(hex.value));
    grid.appendChild(h('div', { class: 'color-cell' },
      h('label', {}, label), color, hex));
  }
  let preview = schemePreview(scheme);

  const editor = h('div', { class: 'editor' },
    row('方案名称', textInput(scheme.name, (v) => {
      if (!v.trim() || schemes.some((s) => s !== scheme && s.name === v)) return render();
      const old = scheme.name;
      scheme.name = v;
      for (const p of state.settings.profiles) if (p.scheme === old) p.scheme = v;
      commitArray('profiles', state.settings.profiles);
      state.selectedScheme = v;
      save();
      render();
    })),
    grid,
    preview,
    h('div', { class: 'editor-actions' },
      button('复制方案', () => {
        const copy = JSON.parse(JSON.stringify(scheme));
        copy.name = scheme.name + ' 副本';
        schemes.push(copy);
        state.selectedScheme = copy.name;
        save();
        render();
      }),
      button('删除', () => {
        if (schemes.length <= 1) return alert('至少保留一个配色方案。');
        if (!confirm(`删除配色方案「${scheme.name}」？`)) return;
        schemes.splice(schemes.indexOf(scheme), 1);
        for (const p of state.settings.profiles) if (p.scheme === scheme.name) p.scheme = schemes[0].name;
        commitArray('profiles', state.settings.profiles);
        state.selectedScheme = schemes[0].name;
        save();
        render();
      }, 'btn-danger')));

  return [
    pageHeader('配色方案', '内置方案导入自 Windows Terminal。所有颜色都可以编辑，并实时应用到终端。'),
    h('div', { class: 'split-page' }, list, editor),
  ];
}

function renderKeybindings() {
  const conflicts = new Map();
  for (const a of state.actions) {
    for (const k of a.keys) conflicts.set(k, (conflicts.get(k) || 0) + 1);
  }
  const conflictSet = new Set([...conflicts.entries()].filter(([, n]) => n > 1).map(([k]) => k));

  const categories = [...new Set(state.actions.map((a) => a.category))];
  const cards = categories.map((cat) => {
    const rows = state.actions
      .filter((a) => a.category === cat)
      .map((a) =>
        h('div', { class: 'kb-row' },
          h('div', { class: 'kb-name' }, a.name, h('div', { class: 'kb-id' }, a.id)),
          chordRecorder(
            () => a.keys,
            async (chords) => {
              const kb = { ...state.settings.keybindings };
              if (chords.length) kb[a.id] = chords;
              else kb[a.id] = [];
              set('keybindings', kb);
              state.actions = await rs.actions.list();
              render();
            },
            {
              conflicts: conflictSet,
              onReset: async () => {
                const kb = { ...state.settings.keybindings };
                delete kb[a.id];
                set('keybindings', kb);
                state.actions = await rs.actions.list();
                render();
              },
            }
          )));
    return section(cat, ...rows);
  });

  return [
    pageHeader('动作与快捷键',
      'RightShell 的每个能力都是一个 Action。录制将替换该动作的全部快捷键；“重置”恢复框架默认。存在冲突的组合键会标红。'),
    ...cards,
  ];
}

function renderQuake() {
  const q = state.settings.quake;
  return [
    pageHeader('myShell (Quake)', 'myShell 是专注模式的单窗格终端，从屏幕边缘下拉出现，失焦自动隐藏，会话常驻。'),
    section('位置与大小',
      row('屏幕边缘', select(
        [{ value: 'top', label: '顶部' }, { value: 'bottom', label: '底部' }],
        q.edge, (v) => set('quake.edge', v))),
      row('高度（屏幕占比）', range(20, 90, q.heightPercent, (v) => set('quake.heightPercent', v), '%')),
      row('动画时长', range(0, 500, q.animationMs, (v) => set('quake.animationMs', v), 'ms'))),
    section('行为',
      row('失去焦点时自动隐藏', checkbox(q.hideOnFocusLoss, (v) => set('quake.hideOnFocusLoss', v))),
      row('总在最前', checkbox(q.alwaysOnTop, (v) => set('quake.alwaysOnTop', v))),
      row('背景不透明度', range(50, 100, q.opacity, (v) => set('quake.opacity', v), '%'))),
    h('p', { class: 'page-note' }, '提示：在“召唤快捷键”页可以修改召唤 myShell 的全局热键（默认 Ctrl+`）。'),
  ];
}

function renderAppearance() {
  const a = state.settings.appearance;
  return [
    pageHeader('外观', '亚克力玻璃材质与多媒体背景。终端背景不透明度低于 100% 时透出背景图/桌面。'),
    section('亚克力材质（Windows Terminal 风格）',
      row('启用亚克力玻璃', checkbox(a.acrylic, (v) => set('appearance.acrylic', v)),
        'Win11 使用原生 acrylic；Win10 通过 DWM 模糊实现；不可用时自动降级为不透明'),
      row('材质不透明度', range(30, 100, a.acrylicOpacity ?? 78, (v) => set('appearance.acrylicOpacity', v), '%'),
        '越低越通透，桌面模糊越明显')),
    section('背景图片',
      row('图片路径', h('div', { class: 'inline-group' },
        textInput(a.backgroundImage, (v) => set('appearance.backgroundImage', v), { placeholder: '留空则纯色背景' }),
        button('浏览…', async () => {
          const f = await rs.dialog.openFile();
          if (f) { set('appearance.backgroundImage', f); render(); }
        }),
        button('清除', () => { set('appearance.backgroundImage', ''); render(); }))),
      row('有背景图时的终端不透明度', range(10, 100, a.backgroundOpacity, (v) => set('appearance.backgroundOpacity', v), '%'))),
    a.backgroundImage
      ? h('div', { class: 'bg-preview', style: `background-image:url("${a.backgroundImage.replace(/\\/g, '/')}")` })
      : h('p', { class: 'page-note' }, '未设置背景图。配置文件也可以单独设置背景图与不透明度。'),
  ];
}

function renderAbout() {
  const i = state.info || {};
  return [
    pageHeader('关于', 'RightShell — 分功能终端客户端。'),
    section('客户端',
      row('RightShell', h('span', { class: 'hint-text' }, '多媒体工作区：多标签、分裂窗格、背景图、命令面板。Win+` 召唤。')),
      row('myShell', h('span', { class: 'hint-text' }, '专注 Quake 终端：单窗格、下拉出现、失焦隐藏、会话常驻。Ctrl+` 召唤。'))),
    section('版本',
      row('RightShell', h('span', { class: 'hint-text' }, i.version || '')),
      row('Electron / Chrome / Node', h('span', { class: 'hint-text' }, `${i.electron || ''} / ${i.chrome || ''} / ${i.node || ''}`)),
      row('设置存储', h('span', { class: 'hint-text' }, i.userData || ''))),
    section('数据与框架',
      h('p', { class: 'page-note' },
        '配色方案与默认动作导入自 Windows Terminal 1.24 安装包（仅作为数据）。快捷键、动作、配色与配置文件均为 RightShell 框架对象，通过本设置界面管理，不读写 Windows Terminal 的 settings.json。')),
  ];
}

// Page renderers call render() directly; route to the overlay renderer.
function render() {
  SettingsUI.render();
}

const PAGES = {
  general: renderGeneral,
  summon: renderSummon,
  profiles: renderProfiles,
  schemes: renderSchemes,
  keybindings: renderKeybindings,
  quake: renderQuake,
  appearance: renderAppearance,
  about: renderAbout,
};

// In-window overlay: settings live inside the RightShell window, no extra window.
const SettingsUI = {
  _inited: false,
  _open: false,

  async init() {
    if (this._inited) return;
    this._inited = true;
    rs.settings.onChange((s) => {
      state.settings = s;
      const active = document.activeElement;
      const editing = active && ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName);
      if (this._open && !editing) this.render();
    });
    rs.hotkeys.onStatus((status) => {
      state.hotkeyStatus = status;
      if (this._open && state.page === 'summon') this.render();
    });
    document.getElementById('settings-close').addEventListener('click', () => this.close());
    document.getElementById('settings-overlay').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
    document.querySelectorAll('#settings-overlay .nav-item').forEach((n) => {
      n.addEventListener('click', () => {
        state.page = n.dataset.page;
        this.render();
      });
    });
  },

  async open() {
    await this.init();
    state.settings = await rs.settings.get();
    state.actions = await rs.actions.list();
    state.info = await rs.app.info();
    this._open = true;
    document.getElementById('settings-overlay').classList.remove('hidden');
    this.render();
  },

  close() {
    this._open = false;
    document.getElementById('settings-overlay').classList.add('hidden');
    if (window.TerminalFocus) window.TerminalFocus();
  },

  render() {
    const content = document.getElementById('settings-content');
    content.textContent = '';
    for (const node of PAGES[state.page]()) content.appendChild(node);
    document.querySelectorAll('#settings-overlay .nav-item').forEach((n) => {
      n.classList.toggle('active', n.dataset.page === state.page);
    });
    document.body.dataset.theme = state.settings.general.theme || 'dark';
  },
};

window.SettingsUI = SettingsUI;
})();