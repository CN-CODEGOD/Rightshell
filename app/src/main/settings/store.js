// SettingsStore: the single settings authority of RightShell.
// There is exactly ONE settings surface: the settings UI. The JSON file under
// userData is an internal persistence detail, never exposed as an editor.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const builtinSchemes = require('./builtin-schemes.json');

function defaultProfiles() {
  return [
    {
      id: 'powershell',
      name: 'Windows PowerShell',
      commandline: '%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      startingDirectory: '%USERPROFILE%',
      scheme: 'Campbell Powershell',
      fontFace: 'Cascadia Mono',
      fontSize: 12,
      cursorShape: 'bar',
      bellStyle: 'audible',
      opacity: 100,
      backgroundImage: '',
      hidden: false,
      builtin: true,
    },
    {
      id: 'cmd',
      name: 'Command Prompt',
      commandline: '%SystemRoot%\\System32\\cmd.exe',
      startingDirectory: '%USERPROFILE%',
      scheme: 'Campbell',
      fontFace: 'Cascadia Mono',
      fontSize: 12,
      cursorShape: 'bar',
      bellStyle: 'audible',
      opacity: 100,
      backgroundImage: '',
      hidden: false,
      builtin: true,
    },
    {
      id: 'pwsh',
      name: 'PowerShell 7',
      commandline: 'pwsh.exe',
      startingDirectory: '%USERPROFILE%',
      scheme: 'Campbell',
      fontFace: 'Cascadia Code',
      fontSize: 12,
      cursorShape: 'bar',
      bellStyle: 'audible',
      opacity: 100,
      backgroundImage: '',
      hidden: true,
      builtin: true,
    },
  ];
}

function defaults() {
  return {
    version: 1,
    general: {
      theme: 'dark',
      defaultProfile: 'powershell',
      confirmCloseAllTabs: true,
      copyOnSelect: false,
      closeBehavior: 'hide',
      clickablePaths: true,
    },
    summon: {
      rightshell: 'win+backquote',
      myshell: 'ctrl+backquote',
    },
    quake: {
      heightPercent: 45,
      edge: 'top',
      animationMs: 160,
      hideOnFocusLoss: true,
      alwaysOnTop: true,
      opacity: 95,
    },
    appearance: {
      backgroundImage: '',
      backgroundOpacity: 80,
      acrylic: true,
      acrylicOpacity: 78,
    },
    profiles: defaultProfiles(),
    schemes: JSON.parse(JSON.stringify(builtinSchemes)),
    keybindings: {},
  };
}

class SettingsStore extends EventEmitter {
  constructor() {
    super();
    this.data = defaults();
    this.file = null;
    this._saveTimer = null;
  }

  init() {
    this.file = path.join(app.getPath('userData'), 'settings.json');
    let saved = null;
    try {
      saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      saved = null;
    }
    if (saved && typeof saved === 'object') {
      const d = defaults();
      this.data = {
        ...d,
        ...saved,
        general: { ...d.general, ...(saved.general || {}) },
        summon: { ...d.summon, ...(saved.summon || {}) },
        quake: { ...d.quake, ...(saved.quake || {}) },
        appearance: { ...d.appearance, ...(saved.appearance || {}) },
        profiles: Array.isArray(saved.profiles) && saved.profiles.length ? saved.profiles : d.profiles,
        schemes: Array.isArray(saved.schemes) && saved.schemes.length ? saved.schemes : d.schemes,
        keybindings: saved.keybindings && typeof saved.keybindings === 'object' ? saved.keybindings : {},
      };
    }
    this._saveNow();
  }

  get() {
    return this.data;
  }

  getPath(dotPath) {
    return dotPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.data);
  }

  set(dotPath, value) {
    const parts = dotPath.split('.');
    let obj = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      if (obj[parts[i]] == null || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    this._changed();
  }

  reset() {
    this.data = defaults();
    this._changed();
  }

  _changed() {
    this.emit('changed', this.data);
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveNow(), 300);
  }

  _saveNow() {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('[settings] save failed:', err.message);
    }
  }
}

module.exports = new SettingsStore();
module.exports.defaults = defaults;
module.exports.builtinSchemes = builtinSchemes;