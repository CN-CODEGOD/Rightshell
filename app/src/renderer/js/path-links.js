// Clickable Windows full paths in terminal output (WT-style hyperlinks).
// Ctrl+Click opens the file/folder with the Windows shell; quoted paths with
// spaces and UNC paths are supported. Registered per xterm instance.
/* global rs */

const PATH_PATTERNS = [
  { re: /"([A-Za-z]:\\[^"\r\n]+)"/g, group: 1 },
  { re: /'([A-Za-z]:\\[^'\r\n]+)'/g, group: 1 },
  { re: /([A-Za-z]:\\[^\s"'<>|:*?\r\n]+)/g, group: 1 },
  { re: /(\\\\[^\s"'<>|:*?\r\n]+)/g, group: 1 },
];

function trimTrailingPunct(p) {
  return p.replace(/[.,;:)\]}]+$/, '');
}

class PathLinkProvider {
  constructor(term, getSettings) {
    this.term = term;
    this.getSettings = getSettings;
  }

  provideLinks(y, callback) {
    if (!this.getSettings().general.clickablePaths) {
      callback(undefined);
      return;
    }
    const line = this.term.buffer.active.getLine(y);
    if (!line) {
      callback(undefined);
      return;
    }
    const text = line.translateToString(true);
    const found = [];
    for (const { re, group } of PATH_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const raw = m[group];
        const path = trimTrailingPunct(raw);
        if (path.length < 4) continue;
        const start = m.index + (group === 1 ? m[0].indexOf(raw) : 0);
        found.push({ start, end: start + raw.length, path, quoted: group === 1 && m[0][0] !== m[0][1] });
      }
    }
    // Prefer quoted matches; drop unquoted overlaps.
    const quoted = found.filter((f) => f.quoted);
    const links = [];
    const taken = [];
    for (const f of found) {
      if (!f.quoted && quoted.some((q) => f.start < q.end && q.start < f.end)) continue;
      if (taken.some((t) => f.start < t.end && t.start < f.end)) continue;
      taken.push(f);
      const cleanPath = trimTrailingPunct(f.path);
      links.push({
        range: {
          start: { x: f.start + 1, y: y + 1 },
          end: { x: f.start + cleanPath.length, y: y + 1 },
        },
        text: cleanPath,
        tooltip: `Ctrl+点击打开: ${cleanPath}`,
        activate: (event, uri) => {
          if (event && event.ctrlKey) {
            rs.shell.openPath(uri).then((err) => {
              if (err && window.RSToast) window.RSToast(`无法打开: ${err}`);
            });
          }
        },
      });
    }
    callback(links.length ? links : undefined);
  }
}

window.PathLinkProvider = PathLinkProvider;