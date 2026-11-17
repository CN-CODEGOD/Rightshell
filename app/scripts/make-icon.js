// Generates assets/icon.png (256x256) without any image library:
// dark rounded square + cyan ">" prompt + white "_" cursor.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 256;
const px = Buffer.alloc(S * S * 4);

function set(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const ia = a / 255;
  px[i] = Math.round(r * ia + px[i] * (1 - ia));
  px[i + 1] = Math.round(g * ia + px[i + 1] * (1 - ia));
  px[i + 2] = Math.round(b * ia + px[i + 2] * (1 - ia));
  px[i + 3] = Math.max(px[i + 3], a);
}

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r || (x >= x0 + r && x <= x1 - r) || (y >= y0 + r && y <= y1 - r);
}

function distToSeg(x, y, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = x - ax, wy = y - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  const dx = x - (ax + t * vx), dy = y - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (!inRoundedRect(x, y, 8, 8, 247, 247, 52)) continue;
    // subtle vertical gradient background
    const t = y / S;
    set(x, y, Math.round(16 + 8 * t), Math.round(20 + 8 * t), Math.round(28 + 10 * t));
  }
}

// border glow
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const inside = inRoundedRect(x, y, 8, 8, 247, 247, 52);
    const inner = inRoundedRect(x, y, 13, 13, 242, 242, 48);
    if (inside && !inner) set(x, y, 58, 150, 221, 255);
  }
}

// ">" chevron
const TH = 17;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const d1 = distToSeg(x, y, 62, 78, 122, 128);
    const d2 = distToSeg(x, y, 122, 128, 62, 178);
    const d = Math.min(d1, d2);
    if (d <= TH / 2) set(x, y, 80, 220, 255);
    else if (d <= TH / 2 + 2) set(x, y, 80, 220, 255, 90);
  }
}

// "_" cursor
for (let y = 164; y <= 182; y++) {
  for (let x = 140; x <= 198; x++) {
    set(x, y, 240, 246, 252);
  }
}

// ---- PNG encode ----
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`[make-icon] ${out} (${png.length} bytes)`);