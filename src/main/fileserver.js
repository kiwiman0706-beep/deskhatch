'use strict';

// Tiny loopback HTTP server that serves whitelisted local files (by token), so
// the renderer can show images/PDF/video/audio from anywhere on disk without
// running into file:// CSP/origin limits. Supports range requests (video seek).

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');

const TOKEN = crypto.randomBytes(8).toString('hex');
const reg = new Map(); // id -> absolute path
let server = null;
let port = 0;

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.oga': 'audio/ogg',
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
};

function start() {
  if (server) return;
  server = http.createServer((req, res) => {
    let u;
    try { u = new URL(req.url, 'http://127.0.0.1'); } catch (_) { res.writeHead(400); return res.end(); }
    if (u.pathname !== '/file' || u.searchParams.get('token') !== TOKEN) { res.writeHead(403); return res.end(); }
    const p = reg.get(u.searchParams.get('id'));
    if (!p) { res.writeHead(404); return res.end(); }
    fs.stat(p, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
      const type = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
      const range = req.headers.range;
      const m = range && /bytes=(\d+)-(\d*)/.exec(range);
      if (m) {
        const s = parseInt(m[1], 10);
        const e = m[2] ? parseInt(m[2], 10) : st.size - 1;
        res.writeHead(206, {
          'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${st.size}`,
          'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1,
        });
        fs.createReadStream(p, { start: s, end: e }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
        fs.createReadStream(p).pipe(res);
      }
    });
  });
  server.listen(0, '127.0.0.1', () => { port = server.address().port; });
}

function register() {
  start();
  ipcMain.handle('file:serve', (_e, p) => {
    const id = crypto.randomBytes(6).toString('hex');
    reg.set(id, p);
    return `http://127.0.0.1:${port}/file?id=${id}&token=${TOKEN}`;
  });
}

module.exports = { register };
