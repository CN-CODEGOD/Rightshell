// ConPTY session manager. Each terminal pane owns one session; sessions live in
// the main process so hiding a window (quake / summon) never kills the shell.
const pty = require('@homebridge/node-pty-prebuilt-multiarch');
const os = require('os');
const path = require('path');
const { uid, expandEnv, parseCommandline } = require('./util');
const store = require('./settings/store');
const mediaIpc = require('./media-ipc');

const BIN_DIR = path.join(__dirname, '..', '..', 'assets', 'bin');

class PtyManager {
  constructor() {
    this.sessions = new Map();
  }

  create(opts, sender) {
    const settings = store.get();
    const profile =
      settings.profiles.find((p) => p.id === opts.profileId) ||
      settings.profiles.find((p) => p.id === settings.general.defaultProfile) ||
      settings.profiles[0];
    const parsed = parseCommandline(profile.commandline);
    if (!parsed) throw new Error(`无效的命令行: ${profile.commandline}`);

    const id = uid();
    const cwd = expandEnv(profile.startingDirectory) || os.homedir();
    const env = {
      ...process.env,
      TERM_PROGRAM: 'RightShell',
      COLORTERM: 'truecolor',
      WT_SESSION: id,
      PATH: `${BIN_DIR}${path.delimiter}${process.env.PATH || ''}`,
      ...mediaIpc.env(),
    };

    const proc = pty.spawn(parsed.file, parsed.args, {
      name: 'xterm-256color',
      cols: opts.cols || 120,
      rows: opts.rows || 30,
      cwd,
      env,
      useConpty: true,
    });

    const session = { id, proc, profileId: profile.id, ownerId: sender.id, alive: true };
    this.sessions.set(id, session);

    proc.onData((data) => {
      if (!sender.isDestroyed()) sender.send('pty:data', id, data);
    });
    proc.onExit(({ exitCode }) => {
      session.alive = false;
      if (!sender.isDestroyed()) sender.send('pty:exit', id, exitCode);
    });

    return { id, profileId: profile.id };
  }

  write(id, data) {
    const s = this.sessions.get(id);
    if (s && s.alive) s.proc.write(data);
  }

  resize(id, cols, rows) {
    const s = this.sessions.get(id);
    if (s && s.alive) {
      try {
        s.proc.resize(Math.max(1, cols), Math.max(1, rows));
      } catch {
        /* resize during exit is harmless */
      }
    }
  }

  kill(id) {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.delete(id);
    try {
      s.proc.kill();
    } catch {
      /* already dead */
    }
  }

  killOwnedBy(ownerId) {
    for (const [id, s] of [...this.sessions]) {
      if (s.ownerId === ownerId) this.kill(id);
    }
  }

  killAll() {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }
}

module.exports = new PtyManager();