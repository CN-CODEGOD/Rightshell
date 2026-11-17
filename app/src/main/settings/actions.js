// ActionRegistry: every capability of RightShell is a first-class Action object
// with metadata, default key chords and an execution scope. Keybindings are
// resolved from these defaults plus user overrides managed in the settings UI.
// Default chords mirror Windows Terminal's defaults.json where applicable.
const Chords = require('../../shared/chords');

const CATEGORIES = ['应用', '标签页', '窗格', '剪贴板', '搜索', '滚动', '视图', '媒体', 'myShell'];

// scope: 'renderer' = handled inside the terminal window; 'main' = handled by main process.
const ACTIONS = [
  // ---- 应用 ----
  { id: 'app.newWindow', name: '新建窗口', category: '应用', scope: 'main', keys: ['ctrl+shift+n'] },
  { id: 'app.closeWindow', name: '关闭窗口', category: '应用', scope: 'main', keys: ['alt+f4'] },
  { id: 'app.quit', name: '退出 RightShell', category: '应用', scope: 'main', keys: [] },
  { id: 'app.toggleFullscreen', name: '切换全屏', category: '应用', scope: 'main', keys: ['f11', 'alt+enter'] },
  { id: 'app.toggleAlwaysOnTop', name: '切换置顶', category: '应用', scope: 'main', keys: [] },
  { id: 'app.openSettings', name: '打开设置', category: '应用', scope: 'main', keys: ['ctrl+,'] },
  { id: 'app.commandPalette', name: '命令面板', category: '应用', scope: 'renderer', keys: ['ctrl+shift+p'] },
  { id: 'app.summonRightShell', name: '召唤 RightShell', category: '应用', scope: 'main', keys: [] },
  { id: 'app.summonMyShell', name: '召唤 myShell', category: '应用', scope: 'main', keys: [] },

  // ---- 标签页 ----
  { id: 'tab.new', name: '新建标签页', category: '标签页', scope: 'renderer', keys: ['ctrl+shift+t'], args: { profile: 'string?' } },
  { id: 'tab.close', name: '关闭标签页', category: '标签页', scope: 'renderer', keys: [] },
  { id: 'tab.closeOthers', name: '关闭其他标签页', category: '标签页', scope: 'renderer', keys: [] },
  { id: 'tab.next', name: '下一个标签页', category: '标签页', scope: 'renderer', keys: ['ctrl+tab'] },
  { id: 'tab.prev', name: '上一个标签页', category: '标签页', scope: 'renderer', keys: ['ctrl+shift+tab'] },
  { id: 'tab.duplicate', name: '复制标签页', category: '标签页', scope: 'renderer', keys: ['ctrl+shift+d'] },
  { id: 'tab.switch', name: '切换到标签页', category: '标签页', scope: 'renderer', keys: ['ctrl+alt+1', 'ctrl+alt+2', 'ctrl+alt+3', 'ctrl+alt+4', 'ctrl+alt+5', 'ctrl+alt+6', 'ctrl+alt+7', 'ctrl+alt+8', 'ctrl+alt+9'], args: { index: 'number' } },
  { id: 'tab.rename', name: '重命名标签页', category: '标签页', scope: 'renderer', keys: [] },
  { id: 'tab.moveForward', name: '标签页右移', category: '标签页', scope: 'renderer', keys: [] },
  { id: 'tab.moveBackward', name: '标签页左移', category: '标签页', scope: 'renderer', keys: [] },

  // ---- 窗格 ----
  { id: 'pane.split', name: '拆分窗格', category: '窗格', scope: 'renderer', keys: ['alt+shift+plus', 'alt+shift+minus'], args: { direction: 'auto|right|left|down|up', profile: 'string?' } },
  { id: 'pane.close', name: '关闭窗格', category: '窗格', scope: 'renderer', keys: ['ctrl+shift+w'] },
  { id: 'pane.focus', name: '移动焦点', category: '窗格', scope: 'renderer', keys: ['alt+left', 'alt+right', 'alt+up', 'alt+down'], args: { direction: 'left|right|up|down' } },
  { id: 'pane.resize', name: '调整窗格大小', category: '窗格', scope: 'renderer', keys: ['alt+shift+left', 'alt+shift+right', 'alt+shift+up', 'alt+shift+down'], args: { direction: 'left|right|up|down' } },
  { id: 'pane.zoom', name: '缩放窗格（最大化/还原）', category: '窗格', scope: 'renderer', keys: [] },

  // ---- 剪贴板 ----
  { id: 'edit.copy', name: '复制', category: '剪贴板', scope: 'renderer', keys: ['ctrl+shift+c', 'ctrl+insert'] },
  { id: 'edit.paste', name: '粘贴', category: '剪贴板', scope: 'renderer', keys: ['ctrl+shift+v', 'shift+insert'] },
  { id: 'edit.selectAll', name: '全选', category: '剪贴板', scope: 'renderer', keys: ['ctrl+shift+a'] },

  // ---- 搜索 ----
  { id: 'find.toggle', name: '查找', category: '搜索', scope: 'renderer', keys: ['ctrl+shift+f'] },

  // ---- 滚动 ----
  { id: 'scroll.up', name: '向上滚动', category: '滚动', scope: 'renderer', keys: ['ctrl+shift+up'] },
  { id: 'scroll.down', name: '向下滚动', category: '滚动', scope: 'renderer', keys: ['ctrl+shift+down'] },
  { id: 'scroll.pageUp', name: '向上翻页', category: '滚动', scope: 'renderer', keys: ['ctrl+shift+pgup'] },
  { id: 'scroll.pageDown', name: '向下翻页', category: '滚动', scope: 'renderer', keys: ['ctrl+shift+pgdn'] },
  { id: 'scroll.top', name: '滚动到顶部', category: '滚动', scope: 'renderer', keys: ['ctrl+shift+home'] },
  { id: 'scroll.bottom', name: '滚动到底部', category: '滚动', scope: 'renderer', keys: ['ctrl+shift+end'] },
  { id: 'buffer.clear', name: '清屏', category: '滚动', scope: 'renderer', keys: ['ctrl+shift+k'] },

  // ---- 视图 ----
  { id: 'font.increase', name: '增大字号', category: '视图', scope: 'renderer', keys: ['ctrl+plus', 'ctrl+equals'] },
  { id: 'font.decrease', name: '减小字号', category: '视图', scope: 'renderer', keys: ['ctrl+minus'] },
  { id: 'font.reset', name: '重置字号', category: '视图', scope: 'renderer', keys: ['ctrl+0'] },
  { id: 'scheme.set', name: '设置配色方案', category: '视图', scope: 'renderer', keys: [], args: { name: 'string' } },
  { id: 'opacity.adjust', name: '调整背景透明度', category: '视图', scope: 'renderer', keys: [], args: { delta: 'number' } },

  // ---- 媒体 ----
  { id: 'media.toggle', name: '媒体播放器', category: '媒体', scope: 'renderer', keys: ['ctrl+alt+m'] },
  { id: 'media.playPause', name: '播放 / 暂停', category: '媒体', scope: 'renderer', keys: [] },
  { id: 'media.next', name: '下一曲', category: '媒体', scope: 'renderer', keys: [] },
  { id: 'media.prev', name: '上一曲', category: '媒体', scope: 'renderer', keys: [] },

  // ---- myShell ----
  { id: 'quake.toggle', name: '召唤/隐藏 myShell', category: 'myShell', scope: 'main', keys: [] },
  { id: 'quake.hide', name: '隐藏 myShell', category: 'myShell', scope: 'main', keys: [] },
];

const byId = new Map(ACTIONS.map((a) => [a.id, a]));

// Per-action default chords derived from the registry. Actions whose default
// chord carries args (tab.switch, pane.split, pane.focus, pane.resize) get one
// binding per chord with the matching args.
function defaultBindings() {
  const out = [];
  for (const a of ACTIONS) {
    a.keys.forEach((k, i) => {
      const chord = Chords.parse(k);
      if (!chord) return;
      let args;
      if (a.id === 'tab.switch') args = { index: i === 8 ? -1 : i };
      if (a.id === 'pane.split') args = { direction: i === 0 ? 'right' : 'down' };
      if (a.id === 'pane.focus' || a.id === 'pane.resize') {
        args = { direction: ['left', 'right', 'up', 'down'][i] };
      }
      out.push({ keys: chord, action: a.id, args });
    });
  }
  return out;
}

// settings.keybindings is { [actionId]: string[] } — a full replacement of the
// binding set for that action (empty array = unbound, missing = defaults).
function resolveBindings(overrides) {
  const out = [];
  for (const a of ACTIONS) {
    const user = overrides ? overrides[a.id] : undefined;
    if (user === undefined) {
      out.push(...defaultBindings().filter((b) => b.action === a.id));
    } else {
      for (const k of user) {
        const chord = Chords.parse(k);
        if (chord) out.push({ keys: chord, action: a.id });
      }
    }
  }
  return out;
}

function listForRenderer(settings) {
  const resolved = resolveBindings(settings.keybindings || {});
  return ACTIONS.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    scope: a.scope,
    args: a.args || null,
    defaultKeys: a.keys.map((k) => Chords.parse(k)).filter(Boolean),
    keys: resolved.filter((b) => b.action === a.id).map((b) => b.keys),
  }));
}

module.exports = { ACTIONS, CATEGORIES, byId, defaultBindings, resolveBindings, listForRenderer };