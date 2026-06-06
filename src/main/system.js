'use strict';

// Launchers for Windows system locations + a clipboard reader. All targets are
// a fixed whitelist (no arbitrary commands from the renderer).

const { ipcMain, shell, clipboard, Menu, BrowserWindow } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd) {
  exec(cmd, { windowsHide: true }, () => {}); // best-effort; cmd.exe handles `start`/shell verbs
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

  ipcMain.handle('system:external', async (_e, url) => {
    if (!/^https?:\/\//i.test(url || '')) return false;
    await shell.openExternal(url); // await so failures propagate to the renderer
    return true;
  });

  ipcMain.handle('system:clipboard', () => {
    const img = clipboard.readImage();
    return { text: clipboard.readText(), image: img.isEmpty() ? null : img.toDataURL() };
  });

  ipcMain.handle('system:bookmarks', () => readBookmarks());

  // Generic native context menu: items = [{id,label}|{separator:true}]; returns
  // the picked id (or null).
  ipcMain.handle('menu:popup', (e, items) => new Promise((resolve) => {
    let picked = null;
    const tmpl = (items || []).map((it) => it.separator
      ? { type: 'separator' }
      : { label: it.label, enabled: it.enabled !== false, click: () => { picked = it.id; } });
    const menu = Menu.buildFromTemplate(tmpl);
    menu.popup({ window: BrowserWindow.fromWebContents(e.sender), callback: () => resolve(picked) });
  }));
}

module.exports = { register };
