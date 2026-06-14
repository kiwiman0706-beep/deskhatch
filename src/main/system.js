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

const TARGETS = {
  settings: () => shell.openExternal('ms-settings:'),
  control: () => run('control'),
  devmgr: () => run('start "" devmgmt.msc'),
  godmode: () => run('explorer shell:::{ED7BA470-8E54-465E-825C-99712043E01C}'),
  printers: () => run('control printers'),
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

module.exports = { register };
