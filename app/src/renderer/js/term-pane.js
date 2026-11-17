// TermPane: one xterm.js instance bound to one ConPTY session.
// Appearance (scheme/font/cursor/opacity/background) is driven by the settings
// framework and can be re-applied live at any time.
/* global Terminal, FitAddon, SearchAddon, WebLinksAddon, Unicode11Addon, ImageAddon, rs */

// xterm addon UMD builds export a namespace object ({ FitAddon: class });
// tolerate both that shape and a direct class export.
const FitAddonClass = (FitAddon && FitAddon.FitAddon) || FitAddon;
const SearchAddonClass = (SearchAddon && SearchAddon.SearchAddon) || SearchAddon;
const WebLinksAddonClass = (WebLinksAddon && WebLinksAddon.WebLinksAddon) || WebLinksAddon;
const Unicode11AddonClass = (Unicode11Addon && Unicode11Addon.Unicode11Addon) || Unicode11Addon;
const ImageAddonClass = (ImageAddon && ImageAddon.ImageAddon) || ImageAddon;

function hexToRgba(hex, alpha) {
  const h = (hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function schemeToTheme(scheme, opacityPercent) {
  const alpha = Math.max(0, Math.min(100, opacityPercent ?? 100)) / 100;
  return {
    background: alpha >= 1 ? scheme.background : hexToRgba(scheme.background, alpha),
    foreground: scheme.foreground,
    cursor: scheme.cursorColor || scheme.foreground,
    cursorAccent: scheme.background,
    selectionBackground: scheme.selectionBackground || 'rgba(255,255,255,0.3)',
    black: scheme.black,
    red: scheme.red,
    green: scheme.green,
    yellow: scheme.yellow,
    blue: scheme.blue,
    magenta: scheme.purple,
    cyan: scheme.cyan,
    white: scheme.white,
    brightBlack: scheme.brightBlack,
    brightRed: scheme.brightRed,
    brightGreen: scheme.brightGreen,
    brightYellow: scheme.brightYellow,
    brightBlue: scheme.brightBlue,
    brightMagenta: scheme.brightPurple,
    brightCyan: scheme.brightCyan,
    brightWhite: scheme.brightWhite,
  };
}

const CURSOR_MAP = { bar: 'bar', block: 'block', underline: 'underline', vintage: 'block' };

class TermPane {
  constructor({ profile, settings, onTitle, onBell, onFocus, onExit, opacityOverride }) {
    this.id = 'pane-' + Math.random().toString(36).slice(2, 10);
    this.profile = profile;
    this.settings = settings;
    this.opacityOverride = opacityOverride;
    this.schemeOverride = null;
    this.fontDelta = 0;
    this.sessionId = null;
    this.dead = false;
    this.onTitle = onTitle || (() => {});
    this.onBell = onBell || (() => {});
    this.onFocus = onFocus || (() => {});
    this.onExit = onExit || (() => {});

    this.el = document.createElement('div');
    this.el.className = 'pane';
    this.el.dataset.paneId = this.id;

    this.term = new Terminal({
      fontFamily: `"${profile.fontFace || 'Cascadia Mono'}", Consolas, "Courier New", monospace`,
      fontSize: profile.fontSize || 12,
      cursorStyle: CURSOR_MAP[profile.cursorShape] || 'bar',
      cursorBlink: true,
      scrollback: 9001,
      allowProposedApi: true,
      theme: schemeToTheme(this._scheme(), this._opacity()),
      windowsMode: false,
    });

    this.fitAddon = new FitAddonClass();
    this.searchAddon = new SearchAddonClass();
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(this.searchAddon);
    this.term.loadAddon(new WebLinksAddonClass((e, url) => rs.shell.openExternal(url)));
    this.term.loadAddon(new Unicode11AddonClass());
    this.term.unicode.activeVersion = '11';
    try {
      this.imageAddon = new ImageAddonClass({ sixelSupport: true, iipSupport: true });
      this.term.loadAddon(this.imageAddon);
    } catch (err) {
      console.warn('[pane] image addon unavailable:', err.message);
    }

    this.term.open(this.el);
    this.term.onData((d) => this.sessionId && rs.pty.write(this.sessionId, d));
    this.term.onResize(({ cols, rows }) => this.sessionId && rs.pty.resize(this.sessionId, cols, rows));
    this.term.onTitleChange((t) => this.onTitle(this, t));
    this.term.onBell(() => this.onBell(this));
    this.term.onSelectionChange(() => {
      if (this.settings.general.copyOnSelect && this.term.hasSelection()) {
        rs.clipboard.write(this.term.getSelection());
      }
    });
    this.term.textarea.addEventListener('focus', () => this.onFocus(this));
    this.el.addEventListener('mousedown', () => this.term.focus());

    if (window.PathLinkProvider) {
      this._pathProvider = new PathLinkProvider(this.term, () => this.settings);
      this.term.registerLinkProvider(this._pathProvider);
    }

    this._resizeObserver = new ResizeObserver(() => { this.ensureSpawned(); this.scheduleFit(); });
    this._resizeObserver.observe(this.el);

    this._unsubs = [];
    this._spawned = false;
    // Spawn only once mounted: fit() on a detached element yields 0×0 and the
    // terminal never renders (quake blank-screen defect). The ResizeObserver
    // drives the first real-size fit synchronously right after appendChild.
    if (this.el.isConnected) this._spawn();
  }

  _scheme() {
    const name = this.schemeOverride || this.profile.scheme;
    return (
      this.settings.schemes.find((s) => s.name === name) ||
      this.settings.schemes.find((s) => s.name === 'Campbell') ||
      this.settings.schemes[0]
    );
  }

  _opacity() {
    if (this.opacityOverride != null) return this.opacityOverride;
    return this.profile.opacity ?? 100;
  }

  async _spawn() {
    this._spawned = true;
    this.fitAddon.fit();
    const { cols, rows } = this.term;
    try {
      const { id } = await rs.pty.create({ profileId: this.profile.id, cols, rows });
      this.sessionId = id;
      this._unsubs.push(rs.pty.onData(id, (d) => this.term.write(d)));
      this._unsubs.push(
        rs.pty.onExit(id, (code) => {
          this.dead = true;
          this.term.write(`\r\n\x1b[90m[进程已退出，代码 ${code}]\x1b[0m\r\n`);
          this.onExit(this, code);
        })
      );
    } catch (err) {
      this.term.write(`\x1b[31m无法启动会话: ${err.message}\x1b[0m\r\n`);
    }
  }

  ensureSpawned() {
    if (this._spawned || !this.el.isConnected) return;
    if (this.el.clientWidth > 0 && this.el.clientHeight > 0) { this._spawn(); return; }
    // The 0×0→sized transition can be coalesced away (hidden→show + bounds
    // animation + software rendering); without a retry the pane never spawns.
    if (!this._spawnRetry) {
      this._spawnRetry = setInterval(() => {
        if (this._spawned || !this.el.isConnected) {
          clearInterval(this._spawnRetry); this._spawnRetry = null; return;
        }
        if (this.el.clientWidth > 0 && this.el.clientHeight > 0) {
          clearInterval(this._spawnRetry); this._spawnRetry = null; this._spawn();
        }
      }, 50);
    }
  }

  scheduleFit() {
    cancelAnimationFrame(this._fitRaf);
    this._fitRaf = requestAnimationFrame(() => {
      try {
        this.fitAddon.fit();
      } catch {
        /* element detached */
      }
    });
  }

  applyAppearance(profile, settings, opacityOverride) {
    this.profile = profile;
    this.settings = settings;
    if (opacityOverride !== undefined) this.opacityOverride = opacityOverride;
    const size = Math.max(6, (profile.fontSize || 12) + this.fontDelta);
    this.term.options.fontSize = size;
    this.term.options.fontFamily = `"${profile.fontFace || 'Cascadia Mono'}", Consolas, "Courier New", monospace`;
    this.term.options.cursorStyle = CURSOR_MAP[profile.cursorShape] || 'bar';
    this.term.options.theme = schemeToTheme(this._scheme(), this._opacity());
    this.scheduleFit();
  }

  adjustFont(delta) {
    this.fontDelta = delta === 0 ? 0 : this.fontDelta + delta;
    this.applyAppearance(this.profile, this.settings);
  }

  setScheme(name) {
    this.schemeOverride = name;
    this.applyAppearance(this.profile, this.settings);
  }

  copy() {
    if (this.term.hasSelection()) {
      rs.clipboard.write(this.term.getSelection());
      this.term.clearSelection();
      return true;
    }
    return false;
  }

  async paste() {
    const text = await rs.clipboard.read();
    if (text) this.term.paste(text);
  }

  dispose() {
    this._resizeObserver.disconnect();
    cancelAnimationFrame(this._fitRaf);
    if (this._spawnRetry) { clearInterval(this._spawnRetry); this._spawnRetry = null; }
    for (const u of this._unsubs) u();
    if (this.sessionId) rs.pty.kill(this.sessionId);
    this.term.dispose();
    this.el.remove();
  }
}