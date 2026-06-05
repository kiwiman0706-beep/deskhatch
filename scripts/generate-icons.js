// Generates simple tray/app icons as PNG files with no external dependencies.
// Run with: npm run gen:icons
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function png(width, height, draw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = draw(x, y, width, height);
      const o = y * (width * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Rounded-square test for soft corners.
function insideRounded(x, y, w, h, r) {
  let dx = 0, dy = 0;
  if (x < r) dx = r - x; else if (x > w - 1 - r) dx = x - (w - 1 - r);
  if (y < r) dy = r - y; else if (y > h - 1 - r) dy = y - (h - 1 - r);
  if (dx > 0 && dy > 0) return dx * dx + dy * dy <= r * r;
  return true;
}

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function draw(x, y, w, h) {
  const r = Math.round(w * 0.22); // soft squircle corners
  if (!insideRounded(x, y, w, h, r)) return [0, 0, 0, 0];
  const u = w / 24;
  // DeskHatch brand gradient (teal -> blue)
  const t = (x + y) / (w + h);
  const c1 = [0x29, 0xc2, 0xc2];
  const c2 = [0x3f, 0x6f, 0xe0];
  const bg = [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), 255];
  const white = [0xf7, 0xf9, 0xff, 255];
  const rect = (x0, y0, x1, y1) => x >= x0 * u && x < x1 * u && y >= y0 * u && y < y1 * u;

  if (rect(4, 4.5, 20, 7.5)) return white; // top bar

  // hatch panel with two stacked slots (drawer pulls; reads faintly as an 8)
  if (rect(6, 9.5, 18, 19.5)) {
    if (rect(9, 12, 15, 13.7) || rect(9, 15.5, 15, 17.2)) return bg; // slots cut to bg
    return white;
  }
  return bg;
}

const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
fs.writeFileSync(path.join(assetsDir, 'icon.png'), png(1024, 1024, draw)); // app/installer icon (also used to build macOS .icns; needs >=512)
fs.writeFileSync(path.join(assetsDir, 'tray.png'), png(32, 32, draw));
console.log('Icons written to', assetsDir);
