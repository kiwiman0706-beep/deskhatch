'use strict';

// Launchers for Windows system locations + a clipboard reader. All targets are
// a fixed whitelist (no arbitrary commands from the renderer).

const { ipcMain, shell, clipboard, Menu, BrowserWindow } = require('electron');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd) {
  exec(cmd, { windowsHide: true }, () => {}); // best-effort; cmd.exe handles `start`/shell verbs
}

// --- macOS synthetic key events (CGEventPost via koffi) ----------------------
// Posts keystrokes from our own process, attributed to DeskHatch, so only the
// Accessibility permission is required. Lazily loaded + fully guarded; returns
// false on any platform/FFI failure so callers degrade gracefully.
let mac = null;
function macKeys() {
  if (mac !== null) return mac;
  if (process.platform !== 'darwin') { mac = false; return mac; }
  try {
    const koffi = require('koffi');
    const as = koffi.load('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices');
    const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
    const CGEventCreateKeyboardEvent = as.func('void* CGEventCreateKeyboardEvent(void* src, uint16 key, bool down)');
    const CGEventPost = as.func('void CGEventPost(uint32 tap, void* ev)');
    const CGEventSetFlags = as.func('void CGEventSetFlags(void* ev, uint64 flags)');
    const AXIsProcessTrusted = as.func('bool AXIsProcessTrusted()');
    const CFRelease = cf.func('void CFRelease(void* p)');
    const FLAGS = 0x40000 | 0x100000; // control + command
    const postKey = (key) => {
      [true, false].forEach((down) => {
        const ev = CGEventCreateKeyboardEvent(null, key, down);
        if (!ev) return;
        CGEventSetFlags(ev, FLAGS);
        CGEventPost(0, ev); // 0 = kCGHIDEventTap
        CFRelease(ev);
      });
    };
    mac = { postKey, trusted: () => { try { return !!AXIsProcessTrusted(); } catch (_) { return false; } } };
  } catch (_) { mac = false; }
  return mac;
}

// --- Open URLs in the actual default BROWSER (Windows) ----------------------
// shell.openExternal() goes through ShellExecute, which honors per-site "Apps
// for websites" handlers — so e.g. google.com can be hijacked by an installed
// Google PWA/app and silently not open. Resolving the default browser's exe
// from the registry and launching it directly bypasses that, and is more
// consistent across sites. Falls back to shell.openExternal everywhere else.
function regQuery(key, valueName) {
  return new Promise((resolve) => {
    const v = valueName ? ' /v "' + valueName + '"' : ' /ve';
    exec('reg query "' + key + '"' + v, { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const m = stdout.match(/REG_[A-Z_]+\s+(.+?)\s*$/m); // value is after the type column
      resolve(m ? m[1].trim() : null);
    });
  });
}

let cachedBrowserExe; // undefined = not resolved yet; null = none found
async function defaultBrowserExe() {
  if (cachedBrowserExe !== undefined) return cachedBrowserExe;
  cachedBrowserExe = null;
  try {
    const progId = await regQuery(
      'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', 'ProgId');
    if (progId) {
      const cmd = await regQuery('HKEY_CLASSES_ROOT\\' + progId + '\\shell\\open\\command', null);
      if (cmd) {
        const q = cmd.match(/^"([^"]+\.exe)"/i) || cmd.match(/^(\S+\.exe)/i); // exe is the first token
        if (q && fs.existsSync(q[1])) cachedBrowserExe = q[1];
      }
    }
  } catch (_) { /* fall back to shell.openExternal */ }
  return cachedBrowserExe;
}

async function openUrl(url) {
  if (!/^https?:\/\//i.test(url || '')) return false;
  if (process.platform === 'win32') {
    const exe = await defaultBrowserExe();
    if (exe) {
      try {
        const child = spawn(exe, [url], { detached: true, stdio: 'ignore' });
        child.unref();
        return true;
      } catch (_) { /* fall back below */ }
    }
  }
  await shell.openExternal(url);
  return true;
}

// --- Resolve a Chromium browser exe for "app mode" windows (Windows) ---------
// Google blocks sign-in inside embedded webviews, but allows real browsers. So
// for Google drawers we launch the site as a borderless `--app=` window in the
// user's real Edge/Chrome — login works and their existing session is reused.
// This needs a *Chromium* browser (Edge/Chrome): prefer whatever is the user's
// default (so they're already signed in there), else fall back to known paths.
function existingExe(paths) {
  for (const p of paths) { try { if (p && fs.existsSync(p)) return p; } catch (_) {} }
  return null;
}
let cachedAppExe; // undefined = unresolved; null = none found
async function appBrowserExe() {
  if (cachedAppExe !== undefined) return cachedAppExe;
  cachedAppExe = null;
  if (process.platform !== 'win32') return cachedAppExe;
  // 1) Default browser, but only if it's Chromium (msedge/chrome support --app).
  try {
    const def = await defaultBrowserExe();
    if (def && /(msedge|chrome)\.exe$/i.test(def)) { cachedAppExe = def; return cachedAppExe; }
  } catch (_) {}
  // 2) Known install locations — Edge first (always present on Windows), then Chrome.
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const la = process.env.LOCALAPPDATA || '';
  cachedAppExe = existingExe([
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    la ? path.join(la, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  ]);
  return cachedAppExe;
}

const TARGETS = {
  settings: () => shell.openExternal('ms-settings:'),
  control: () => run('control'),
  devmgr: () => run('start "" devmgmt.msc'),
  godmode: () => run('explorer shell:::{ED7BA470-8E54-465E-825C-99712043E01C}'),
  printers: () => run('control printers'),
  printersFolder: () => run('explorer shell:PrintersFolder'),
  scanners: () => shell.openExternal('ms-settings:printers'),
};

// Read Chromium-based browser bookmarks (Chrome / Edge) from their JSON file.
function readBookmarks() {
  const la = process.env.LOCALAPPDATA || '';
  const sources = [
    ['Chrome', path.join(la, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks')],
    ['Edge', path.join(la, 'Microsoft', 'Edge', 'User Data', 'Default', 'Bookmarks')],
  ];
  const out = [];
  for (const [browser, file] of sources) {
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      const walk = (node, trail) => {
        if (!node) return;
        if (node.type === 'url') out.push({ browser, title: node.name, url: node.url, folder: trail.join(' / ') });
        else if (node.type === 'folder' && node.children) node.children.forEach((c) => walk(c, node.name ? trail.concat(node.name) : trail));
      };
      const roots = (json && json.roots) || {};
      ['bookmark_bar', 'other', 'synced'].forEach((k) => roots[k] && walk(roots[k], []));
    } catch (_) { /* browser not installed / no file */ }
  }
  return out;
}

function register() {
  ipcMain.handle('system:open', (_e, key) => {
    if (process.platform !== 'win32') return false;
    const fn = TARGETS[key];
    if (!fn) return false;
    try { fn(); return true; } catch (_) { return false; }
  });

  ipcMain.handle('system:external', (_e, url) => openUrl(url)); // default browser exe, then shell fallback

  // macOS: toggle the frontmost window out of full screen by posting ⌃⌘F as a
  // synthetic key event from our OWN process (CGEventPost). Unlike the System
  // Events / AppleScript route, this needs only the Accessibility permission
  // (not a separate Automation grant), so it actually works once the user has
  // ticked DeskHatch in Privacy → Accessibility. If we're not yet trusted we
  // open that pane instead. Used by the bar's "exit fullscreen" button.
  ipcMain.handle('system:exit-fullscreen', () => {
    if (process.platform !== 'darwin') return false;
    const m = macKeys();
    if (!m) return false;
    if (!m.trusted()) { try { shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'); } catch (_) {} return false; }
    try { m.postKey(3); return true; } catch (_) { return false; } // key code 3 = "f"
  });

  ipcMain.handle('system:clipboard', () => {
    const img = clipboard.readImage();
    return { text: clipboard.readText(), image: img.isEmpty() ? null : img.toDataURL() };
  });

  ipcMain.handle('system:bookmarks', () => readBookmarks());

  // Generic native context menu: items = [{id,label}|{separator:true}|
  // {label,submenu:[...]}]; submenus nest arbitrarily (classic cascading menu).
  // Returns the picked leaf id (or null).
  const buildTemplate = (items, onPick) => (items || []).map((it) => {
    if (it.separator) return { type: 'separator' };
    if (Array.isArray(it.submenu)) return { label: it.label, submenu: buildTemplate(it.submenu, onPick) };
    return { label: it.label, enabled: it.enabled !== false, click: () => { onPick(it.id); } };
  });
  ipcMain.handle('menu:popup', (e, items) => new Promise((resolve) => {
    let picked = null;
    const tmpl = buildTemplate(items, (id) => { picked = id; });
    const menu = Menu.buildFromTemplate(tmpl);
    menu.popup({ window: BrowserWindow.fromWebContents(e.sender), callback: () => resolve(picked) });
  }));
}

module.exports = { register, appBrowserExe, openUrl };
