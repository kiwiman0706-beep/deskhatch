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
  // cheerful diagonal gradient (teal -> blue)
  const t = (x + y) / (w + h);
  const c1 = [0x29, 0xc2, 0xc2];
  const c2 = [0x5b, 0x8d, 0xef];
  const bg = [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), 255];
  const white = [0xf7, 0xf9, 0xff, 255];
  const rect = (x0, y0, x1, y1) => x >= x0 * u && x < x1 * u && y >= y0 * u && y < y1 * u;

  if (rect(4, 4.5, 20, 7.5)) return white; // top bar

  // drawer with four Google-coloured dots
  if (rect(6.5, 9.5, 17.5, 19.5)) {
    const dots = [
      [10, 13, [0x42, 0x85, 0xf4]],   // blue
      [14, 13, [0xea, 0x43, 0x35]],   // red
      [10, 16.5, [0xfb, 0xbc, 0x05]], // yellow
      [14, 16.5, [0x34, 0xa8, 0x53]], // green
    ];
    const rr = 1.6 * u;
    for (const [cx, cy, col] of dots) {
      const dx = x - cx * u, dy = y - cy * u;
      if (dx * dx + dy * dy <= rr * rr) return [col[0], col[1], col[2], 255];
    }
    return white;
  }
  return bg;
}

const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
fs.writeFileSync(path.join(assetsDir, 'icon.png'), png(256, 256, draw)); // app/installer icon
fs.writeFileSync(path.join(assetsDir, 'tray.png'), png(32, 32, draw));
console.log('Icons written to', assetsDir);
