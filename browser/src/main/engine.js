'use strict';

// The "engine": resolve a real Chromium browser (Edge/Chrome) and launch a site
// as a borderless `--app=` window in a DEDICATED profile. Because the page runs
// in a genuine standalone browser (not an embedded webview), Google sign-in
// works and the session persists in our own profile dir across launches.

const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function existing(paths) {
  for (const p of paths) { try { if (p && fs.existsSync(p)) return p; } catch (_) {} }
  return null;
}

let cached; // undefined = unresolved; null = none found
function browserExe() {
  if (cached !== undefined) return cached;
  cached = null;
  if (process.platform !== 'win32') return cached;
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const la = process.env.LOCALAPPDATA || '';
  // Edge first (always present on Windows), then Chrome.
  cached = existing([
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    la ? path.join(la, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  ]);
  return cached;
}

// Our own isolated browser profile — keeps DeskHatch Browser's logins/cookies/
// extensions separate from the user's everyday Edge/Chrome.
function profileDir() {
  return path.join(app.getPath('userData'), 'engine-profile');
}

// Launch `url` as an app-mode window. `rect` (optional) positions/sizes the new
// window on first launch (honoured when this starts a fresh engine process).
function launch(url, rect) {
  const exe = browserExe();
  if (!exe) return false;
  const args = [
    '--app=' + url,
    '--user-data-dir=' + profileDir(),
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (rect) {
    args.push('--window-position=' + Math.round(rect.x) + ',' + Math.round(rect.y));
    args.push('--window-size=' + Math.round(rect.w) + ',' + Math.round(rect.h));
  }
  try {
    const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch (_) { return false; }
}

module.exports = { browserExe, profileDir, launch };
