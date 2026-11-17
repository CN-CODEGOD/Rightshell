// RightShell media player: a docked, shell-callable, extensible player.
// Shell integration: `rsctl play <file>` / `rsctl enqueue <file>` (local IPC).
// Extension API: window.RSMedia.registerProvider({id,label,exts,kind}) where
// kind is 'audio' | 'video' | 'image'; new providers plug into the same panel.
/* global rs */

const MediaProviders = [
  { id: 'video', label: '视频', kind: 'video', exts: ['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v'] },
  { id: 'audio', label: '音频', kind: 'audio', exts: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'wma'] },
  { id: 'image', label: '图片', kind: 'image', exts: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
];

function providerFor(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return MediaProviders.find((p) => p.exts.includes(ext)) || null;
}

function basename(p) {
  return p.replace(/\\/g, '/').split('/').pop() || p;
}

const MediaPlayer = {
  playlist: [],
  index: -1,
  shuffle: false,
  loop: false,
  els: {},
  _seq: 0,

  init() {
    const q = (id) => document.getElementById(id);
    this.els = {
      panel: q('media-panel'),
      video: q('media-video'),
      image: q('media-image'),
      cover: q('media-cover'),
      title: q('media-title'),
      badge: q('media-badge'),
      play: q('media-play'),
      prev: q('media-prev'),
      next: q('media-next'),
      seek: q('media-seek'),
      time: q('media-time'),
      volume: q('media-volume'),
      mute: q('media-mute'),
      rate: q('media-rate'),
      loopBtn: q('media-loop'),
      shuffleBtn: q('media-shuffle'),
      list: q('media-list'),
      clear: q('media-clear'),
      close: q('media-close'),
      empty: q('media-empty'),
    };
    const e = this.els;

    e.play.addEventListener('click', () => this.playPause());
    e.prev.addEventListener('click', () => this.prev());
    e.next.addEventListener('click', () => this.next());
    e.close.addEventListener('click', () => this.toggle(false));
    e.clear.addEventListener('click', () => {
      this.playlist = [];
      this.index = -1;
      this._stopMedia();
      this.renderList();
    });
    e.seek.addEventListener('input', () => {
      const v = e.video;
      if (v.duration) v.currentTime = (Number(e.seek.value) / 1000) * v.duration;
    });
    e.volume.addEventListener('input', () => {
      e.video.volume = Number(e.volume.value) / 100;
      e.video.muted = false;
      this._syncMute();
    });
    e.mute.addEventListener('click', () => {
      e.video.muted = !e.video.muted;
      this._syncMute();
    });
    e.rate.addEventListener('change', () => {
      e.video.playbackRate = Number(e.rate.value);
    });
    e.loopBtn.addEventListener('click', () => {
      this.loop = !this.loop;
      e.video.loop = this.loop;
      e.loopBtn.classList.toggle('on', this.loop);
    });
    e.shuffleBtn.addEventListener('click', () => {
      this.shuffle = !this.shuffle;
      e.shuffleBtn.classList.toggle('on', this.shuffle);
    });

    e.video.addEventListener('timeupdate', () => this._syncTime());
    e.video.addEventListener('loadedmetadata', () => this._syncTime());
    e.video.addEventListener('play', () => this._syncPlayButton());
    e.video.addEventListener('pause', () => this._syncPlayButton());
    e.video.addEventListener('ended', () => {
      if (!this.loop) this.next();
    });
    e.video.addEventListener('error', () => {
      const item = this.playlist[this.index];
      if (item && e.video.error) {
        item.error = true;
        this.renderList();
        if (window.RSToast) window.RSToast(`无法播放: ${item.name}`);
      }
    });

    rs.media.onCommand((cmd) => this.handleCommand(cmd));
    this.renderList();
  },

  handleCommand(cmd) {
    if (!cmd) return;
    if (cmd.type === 'play' && cmd.path) {
      this.toggle(true);
      this.enqueue(cmd.path, true);
    } else if (cmd.type === 'enqueue' && cmd.path) {
      this.enqueue(cmd.path, false);
    } else if (cmd.type === 'notify' && cmd.message) {
      if (window.RSToast) window.RSToast(cmd.message);
    }
  },

  toggle(force) {
    const show = force !== undefined ? force : this.els.panel.classList.contains('hidden');
    this.els.panel.classList.toggle('hidden', !show);
    if (show) this.els.video.focus?.();
    return show;
  },

  enqueue(path, autoplay) {
    const provider = providerFor(path);
    const item = {
      id: ++this._seq,
      path,
      name: basename(path),
      kind: provider ? provider.kind : 'video',
      providerLabel: provider ? provider.label : '未知',
      error: false,
    };
    this.playlist.push(item);
    this.renderList();
    if (autoplay || this.index === -1) {
      this.playAt(this.playlist.length - 1);
    }
  },

  playAt(i) {
    if (i < 0 || i >= this.playlist.length) return;
    this.index = i;
    const item = this.playlist[i];
    const e = this.els;
    e.title.textContent = item.name;
    e.badge.textContent = item.providerLabel;
    e.image.classList.add('hidden');
    e.cover.classList.add('hidden');
    e.video.classList.remove('hidden');

    if (item.kind === 'image') {
      e.video.pause();
      e.video.removeAttribute('src');
      e.video.load();
      e.video.classList.add('hidden');
      e.image.src = 'file:///' + item.path.replace(/\\/g, '/');
      e.image.classList.remove('hidden');
    } else {
      e.video.src = 'file:///' + item.path.replace(/\\/g, '/');
      e.video.playbackRate = Number(e.rate.value);
      e.video.loop = this.loop;
      if (item.kind === 'audio') {
        e.video.classList.add('hidden');
        e.cover.classList.remove('hidden');
      }
      e.video.play().catch(() => {});
    }
    this.renderList();
  },

  playPause() {
    const v = this.els.video;
    if (this.index === -1 && this.playlist.length) {
      this.playAt(0);
      return;
    }
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  },

  next() {
    if (!this.playlist.length) return;
    if (this.shuffle) {
      this.playAt(Math.floor(Math.random() * this.playlist.length));
    } else {
      this.playAt((this.index + 1) % this.playlist.length);
    }
  },

  prev() {
    if (!this.playlist.length) return;
    const v = this.els.video;
    if (v.currentTime > 3) {
      v.currentTime = 0;
      return;
    }
    this.playAt((this.index - 1 + this.playlist.length) % this.playlist.length);
  },

  removeAt(i) {
    this.playlist.splice(i, 1);
    if (i === this.index) {
      this.index = -1;
      this._stopMedia();
      if (this.playlist.length) this.playAt(Math.min(i, this.playlist.length - 1));
    } else if (i < this.index) {
      this.index--;
    }
    this.renderList();
  },

  _stopMedia() {
    const v = this.els.video;
    v.pause();
    v.removeAttribute('src');
    v.load();
    this.els.title.textContent = '未在播放';
    this.els.badge.textContent = '';
    this.els.time.textContent = '0:00 / 0:00';
    this.els.seek.value = 0;
  },

  _syncPlayButton() {
    this.els.play.textContent = this.els.video.paused ? '▶' : '⏸';
  },

  _syncMute() {
    this.els.mute.textContent = this.els.video.muted || this.els.video.volume === 0 ? '🔇' : '🔊';
  },

  _syncTime() {
    const v = this.els.video;
    const fmt = (s) => {
      if (!isFinite(s)) return '0:00';
      const m = Math.floor(s / 60);
      const ss = Math.floor(s % 60);
      return `${m}:${String(ss).padStart(2, '0')}`;
    };
    this.els.time.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;
    if (v.duration) this.els.seek.value = Math.round((v.currentTime / v.duration) * 1000);
  },

  renderList() {
    const list = this.els.list;
    list.textContent = '';
    this.els.empty.classList.toggle('hidden', this.playlist.length > 0);
    this.playlist.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'media-item' + (i === this.index ? ' active' : '') + (item.error ? ' error' : '');
      const icon = document.createElement('span');
      icon.className = 'media-item-icon';
      icon.textContent = item.kind === 'audio' ? '♫' : item.kind === 'image' ? '🖼' : '▶';
      const name = document.createElement('span');
      name.className = 'media-item-name';
      name.textContent = item.name;
      name.title = item.path;
      const del = document.createElement('button');
      del.className = 'media-item-del';
      del.textContent = '×';
      del.title = '从列表移除';
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.removeAt(i);
      });
      row.append(icon, name, del);
      row.addEventListener('click', () => this.playAt(i));
      list.appendChild(row);
    });
  },
};

window.RSMedia = {
  registerProvider(p) {
    if (p && p.id && Array.isArray(p.exts) && p.kind) MediaProviders.push(p);
  },
  play: (path) => MediaPlayer.handleCommand({ type: 'play', path }),
  enqueue: (path) => MediaPlayer.handleCommand({ type: 'enqueue', path }),
  providers: MediaProviders,
};

window.MediaPlayer = MediaPlayer;