// Copies xterm.js + addons from node_modules into renderer/vendor so the
// renderer can load them over file:// without a bundler.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vendor = path.join(root, 'src', 'renderer', 'vendor');
fs.mkdirSync(vendor, { recursive: true });

const pkgs = [
  ['@xterm/xterm', 'lib/xterm.js', 'xterm.js'],
  ['@xterm/xterm', 'css/xterm.css', 'xterm.css'],
  ['@xterm/addon-fit', 'lib/addon-fit.js', 'addon-fit.js'],
  ['@xterm/addon-search', 'lib/addon-search.js', 'addon-search.js'],
  ['@xterm/addon-web-links', 'lib/addon-web-links.js', 'addon-web-links.js'],
  ['@xterm/addon-unicode11', 'lib/addon-unicode11.js', 'addon-unicode11.js'],
  ['@xterm/addon-image', 'lib/addon-image.js', 'addon-image.js'],
];

for (const [pkg, src, dest] of pkgs) {
  const from = path.join(root, 'node_modules', pkg, src);
  const to = path.join(vendor, dest);
  if (!fs.existsSync(from)) {
    console.warn(`[copy-vendor] missing: ${from}`);
    continue;
  }
  fs.copyFileSync(from, to);
  console.log(`[copy-vendor] ${dest}`);
}