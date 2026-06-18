'use strict';

// Generate Microsoft Store (MSIX/appx) tile assets from assets/icon.png into
// build/appx/, so the package ships real, branded tiles instead of
// electron-builder's default placeholder images. Required to pass Store policy
// 10.1.1.11 (On Device Tiles). Run before `electron-builder --win appx`.
//
// Uses sharp (devDependency). Square tiles are a straight resize of the square
// source icon; the wide tile and splash screen center the icon on a transparent
// canvas so it isn't distorted.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'assets', 'icon.png');
const OUT = path.join(__dirname, '..', 'build', 'appx');

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const SQUARES = [
  ['Square44x44Logo.png', 44],
  ['Square71x71Logo.png', 71],
  ['Square150x150Logo.png', 150],
  ['Square310x310Logo.png', 310],
  ['StoreLogo.png', 50],
];
// [name, width, height, centered icon height]
const CANVASES = [
  ['Wide310x150Logo.png', 310, 150, 120],
  ['SplashScreen.png', 620, 300, 200],
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, size] of SQUARES) {
    await sharp(SRC)
      .resize(size, size, { fit: 'contain', background: TRANSPARENT })
      .png()
      .toFile(path.join(OUT, name));
  }
  for (const [name, w, h, iconH] of CANVASES) {
    const icon = await sharp(SRC)
      .resize(iconH, iconH, { fit: 'contain', background: TRANSPARENT })
      .png()
      .toBuffer();
    await sharp({ create: { width: w, height: h, channels: 4, background: TRANSPARENT } })
      .composite([{ input: icon, gravity: 'center' }])
      .png()
      .toFile(path.join(OUT, name));
  }
  console.log('[appx] tile assets written to', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
