// Imports Windows Terminal package data into the RightShell framework:
//   - color schemes  -> src/main/settings/builtin-schemes.json
//   - Cascadia fonts -> assets/fonts/
// The WT package is used as DATA only; no settings.json injection.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const wtDir = path.join(root, '..', 'Microsoft.WindowsTerminal_1.24.12741.0_x64__8wekyb3d8bbwe');

function stripJsonc(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  let pendingComma = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      pendingComma = -1;
      out += c;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (c === ',') {
      pendingComma = out.length;
      out += c;
      continue;
    }
    if (/\s/.test(c)) {
      out += c;
      continue;
    }
    if ((c === '}' || c === ']') && pendingComma >= 0) {
      out = out.slice(0, pendingComma) + out.slice(pendingComma + 1);
    }
    pendingComma = -1;
    out += c;
  }
  return out;
}

const raw = fs.readFileSync(path.join(wtDir, 'defaults.json'), 'utf8');
const defaults = JSON.parse(stripJsonc(raw));

const schemes = defaults.schemes.map((s) => ({
  name: s.name,
  background: s.background,
  foreground: s.foreground,
  cursorColor: s.cursorColor || s.foreground,
  selectionBackground: s.selectionBackground || '#FFFFFF',
  black: s.black, red: s.red, green: s.green, yellow: s.yellow,
  blue: s.blue, purple: s.purple, cyan: s.cyan, white: s.white,
  brightBlack: s.brightBlack, brightRed: s.brightRed, brightGreen: s.brightGreen,
  brightYellow: s.brightYellow, brightBlue: s.brightBlue, brightPurple: s.brightPurple,
  brightCyan: s.brightCyan, brightWhite: s.brightWhite,
}));

const outDir = path.join(root, 'src', 'main', 'settings');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'builtin-schemes.json'), JSON.stringify(schemes, null, 2));
console.log(`[import-wt] ${schemes.length} schemes -> builtin-schemes.json`);

fs.writeFileSync(
  path.join(outDir, 'wt-defaults.json'),
  JSON.stringify({ actions: defaults.actions, keybindings: defaults.keybindings }, null, 2)
);
console.log('[import-wt] WT actions/keybindings reference -> wt-defaults.json');

const fontDir = path.join(root, 'assets', 'fonts');
fs.mkdirSync(fontDir, { recursive: true });
for (const f of ['CascadiaCode.ttf', 'CascadiaCodeItalic.ttf', 'CascadiaMono.ttf', 'CascadiaMonoItalic.ttf']) {
  const src = path.join(wtDir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(fontDir, f));
    console.log(`[import-wt] font ${f}`);
  }
}