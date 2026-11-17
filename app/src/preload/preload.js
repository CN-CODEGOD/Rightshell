// contextBridge API exposed to every RightShell renderer as window.rs
const { contextBridge, ipcRenderer } = require('electron');

const dataCbs = new Map();
const exitCbs = new Map();
ipcRenderer.on('pty:data', (e, id, data) => dataCbs.get(id)?.(data));
ipcRenderer.on('pty:exit', (e, id, code) => exitCbs.get(id)?.(code));

function sub(channel, cb) {
  const listener = (e, ...args) => cb(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('rs', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (dotPath, value) => ipcRenderer.invoke('settings:set', dotPath, value),
    reset: () => ipcRenderer.invoke('settings:reset'),
    open: () => ipcRenderer.invoke('settings:open'),
    onChange: (cb) => sub('settings:changed', cb),
    onOpen: (cb) => sub('settings:open', cb),
  },
  actions: {
    list: () => ipcRenderer.invoke('actions:list'),
    bindings: () => ipcRenderer.invoke('actions:bindings'),
  },
  pty: {
    create: (opts) => ipcRenderer.invoke('pty:create', opts),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('pty:kill', id),
    onData: (id, cb) => {
      dataCbs.set(id, cb);
      return () => dataCbs.delete(id);
    },
    onExit: (id, cb) => {
      exitCbs.set(id, cb);
      return () => exitCbs.delete(id);
    },
  },
  clipboard: {
    read: () => ipcRenderer.invoke('clipboard:read'),
    write: (text) => ipcRenderer.invoke('clipboard:write', text),
  },
  window: {
    action: (action) => ipcRenderer.invoke('window:action', action),
    onState: (cb) => sub('window:state', cb),
    onSummoned: (cb) => sub('window:summoned', cb),
    onMaterial: (cb) => sub('window:material', cb),
  },
  quake: {
    toggle: () => ipcRenderer.invoke('quake:toggle'),
    hide: () => ipcRenderer.invoke('quake:hide'),
    onState: (cb) => sub('quake:state', cb),
  },
  rightshell: {
    summon: () => ipcRenderer.invoke('rightshell:summon'),
  },
  dialog: {
    openFile: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    showItemInFolder: (p) => ipcRenderer.invoke('shell:showItemInFolder', p),
  },
  media: {
    onCommand: (cb) => sub('media:command', cb),
  },
  hotkeys: {
    onStatus: (cb) => sub('hotkeys:status', cb),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    quit: () => ipcRenderer.invoke('app:quit'),
    detectProfiles: () => ipcRenderer.invoke('profiles:detect'),
  },
});