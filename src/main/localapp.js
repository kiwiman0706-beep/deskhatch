'use strict';

// Main-process half of the "local app" drawer type: probe a companion desktop
// app over loopback, start it when it isn't running, and open the executable
// with extra arguments for its right-click actions. The protocol a companion
// app has to satisfy is in docs/LOCALAPP-PROTOCOL.md.
//
// Two boundaries matter here, because a drawer definition is just data the user
// (or a preset) supplied, and the renderer asks for these by URL and path:
//
//   1. HTTP only to loopback. A definition must never be able to make DeskHatch
//      fetch an arbitrary host — that would turn the drawer list into an SSRF
//      surface against whatever the machine can reach.
//   2. Launching goes through spawn() with an argv array and no shell, and only
//      after the path resolves to a real file. No string is ever handed to a
//      shell, so a path or argument cannot smuggle a command. This is the same
//      posture as system.js, which keeps its launch targets to a whitelist.

const { ipcMain, dialog, app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const { isLoopback, expandEnv } = require('../renderer/lib/localapp');

const HEALTH_TIMEOUT_MS = 2500;

// GET a loopback URL and return { ok, status, json }. Never throws: every
// failure mode (refused, timeout, non-JSON) is just "not running yet".
function get(urlStr, timeoutMs) {
  return new Promise((resolve) => {
    if (!isLoopback(urlStr)) { resolve({ ok: false, error: 'not a loopback URL' }); return; }
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    let req;
    try {
      const mod = urlStr.startsWith('https:') ? https : http;
      req = mod.get(urlStr, { headers: { 'User-Agent': 'DeskHatch' } }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        // A health endpoint answers in bytes; cap the read so a misbehaving
        // local server can't stream us out of memory.
        res.on('data', (d) => { body += d; if (body.length > 64 * 1024) { body = body.slice(0, 64 * 1024); res.destroy(); } });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch (_) { /* not JSON: leave null */ }
          done({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, json });
        });
        res.on('error', () => done({ ok: false, error: 'response error' }));
      });
    } catch (e) { done({ ok: false, error: e.message }); return; }
    req.on('error', (e) => done({ ok: false, error: e.code || e.message }));
    req.setTimeout(timeoutMs || HEALTH_TIMEOUT_MS, () => { try { req.destroy(); } catch (_) {} done({ ok: false, error: 'timeout' }); });
  });
}

// Expand %VARS% and check the executable is really there. Returns the resolved
// path either way so the "not found" UI can show what it looked for.
function resolveExe(exe) {
  const expanded = expandEnv(exe, process.env);
  if (!expanded) return { path: '', exists: false };
  let exists = false;
  try { exists = fs.statSync(expanded).isFile(); } catch (_) { exists = false; }
  return { path: expanded, exists };
}

// Start the companion app and let go of it: detached and unref'd so it keeps
// running when DeskHatch quits (the drawer is a window onto the app, not its
// owner), and windowsHide so a console app doesn't flash a black box.
function launch(exe, args) {
  const r = resolveExe(exe);
  if (!r.exists) return { ok: false, error: 'not found', path: r.path };
  const argv = Array.isArray(args) ? args.map(String) : [];
  try {
    const child = spawn(r.path, argv, {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      cwd: path.dirname(r.path),
    });
    child.unref();
    return { ok: true, path: r.path };
  } catch (e) {
    return { ok: false, error: e.message, path: r.path };
  }
}

function setup() {
  // Probe: is the companion app answering? The renderer compares the JSON
  // against its `expect` itself (pure logic, unit-tested).
  ipcMain.handle('localapp:health', async (_e, url) => get(url, HEALTH_TIMEOUT_MS));

  // Fire-and-check a loopback action endpoint (e.g. DSBooks' /show).
  ipcMain.handle('localapp:get', async (_e, url) => get(url, HEALTH_TIMEOUT_MS));

  ipcMain.handle('localapp:resolve', async (_e, exe) => resolveExe(exe));

  ipcMain.handle('localapp:launch', async (_e, exe, args) => launch(exe, args));

  // "Find it myself" for when the app is installed somewhere non-default.
  ipcMain.handle('localapp:pick-exe', async () => {
    const filters = process.platform === 'win32'
      ? [{ name: 'Application', extensions: ['exe'] }]
      : process.platform === 'darwin'
        ? [{ name: 'Application', extensions: ['app'] }]
        : [];
    try {
      const r = await dialog.showOpenDialog({
        title: 'アプリの実行ファイルを選択',
        properties: process.platform === 'darwin' ? ['openFile', 'treatPackageAsDirectory'] : ['openFile'],
        filters,
        defaultPath: app.getPath('home'),
      });
      if (r.canceled || !r.filePaths || !r.filePaths.length) return { path: '' };
      return resolveExe(r.filePaths[0]);
    } catch (_) { return { path: '' }; }
  });
}

module.exports = { setup, get, resolveExe, launch };
