'use strict';

// Live camera support: pull an ONVIF/RTSP stream (e.g. Tapo), transcode it with
// ffmpeg to fragmented MP4 (H.264 copied, audio -> AAC), and stream it over a
// loopback HTTP server so a plain <video> element can play it WITH audio.
//
// Each open camera drawer holds one HTTP connection; closing it (connection
// drop) kills its ffmpeg. ffmpeg comes from the optional `ffmpeg-static` dep.

const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { ipcMain } = require('electron');

let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
  // In a packaged app the binary is unpacked next to the asar.
  if (ffmpegPath) ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
} catch (_) { ffmpegPath = null; }

const TOKEN = crypto.randomBytes(8).toString('hex');
const cams = new Map(); // id -> rtsp url
let server = null;
let port = 0;

function startServer() {
  if (server) return;
  server = http.createServer((req, res) => {
    let u;
    try { u = new URL(req.url, 'http://127.0.0.1'); } catch (_) { res.writeHead(400); return res.end(); }
    if (u.pathname !== '/cam' || u.searchParams.get('token') !== TOKEN) { res.writeHead(403); return res.end(); }
    const rtsp = cams.get(u.searchParams.get('id'));
    if (!rtsp || !ffmpegPath) { res.writeHead(404); return res.end(); }

    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-cache', Connection: 'close' });
    const ff = spawn(ffmpegPath, [
      '-rtsp_transport', 'tcp',
      '-i', rtsp,
      '-c:v', 'copy',                       // H.264 passthrough (low CPU)
      '-c:a', 'aac', '-ar', '44100', '-ac', '1',
      '-f', 'mp4',
      '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
      'pipe:1',
    ], { windowsHide: true });

    ff.stdout.pipe(res);
    ff.stderr.on('data', () => {}); // swallow ffmpeg logs
    const cleanup = () => { try { ff.kill('SIGKILL'); } catch (_) {} };
    req.on('close', cleanup);
    res.on('close', cleanup);
    ff.on('error', cleanup);
  });
  server.listen(0, '127.0.0.1', () => { port = server.address().port; });
}

function register() {
  startServer();
  ipcMain.handle('camera:url', (_e, rtsp) => {
    if (!ffmpegPath) return { error: 'no-ffmpeg' };
    if (!/^rtsp:\/\//i.test(rtsp || '')) return { error: 'bad-url' };
    const id = crypto.randomBytes(6).toString('hex');
    cams.set(id, rtsp);
    return { url: `http://127.0.0.1:${port}/cam?id=${id}&token=${TOKEN}` };
  });
}

module.exports = { register };
