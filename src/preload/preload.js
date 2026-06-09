'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');
const fs = require('fs');
const nodePath = require('path');

contextBridge.exposeInMainWorld('overlay', {
  platform: process.platform,

  // Toggle click pass-through. When `ignore` is true, mouse events fall through
  // the (transparent) overlay to the desktop below.
  setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore-mouse', ignore),

  // Report the interactive geometry so the main process can drive click
  // pass-through from the real cursor position. `mode`: 'none' (all through) |
  // 'all' (all captured) | 'rects' (capture only over `rects`, window-local
  // CSS px {x,y,w,h}). See pushHit() in the renderer.
  setHit: (mode, rects) => ipcRenderer.send('overlay:set-hit', mode, rects),

  // Ask the main process to resize the overlay window to fit the open drawers,
  // so the desktop below stays clickable where nothing is shown.
  setHeight: (height) => ipcRenderer.send('overlay:set-height', height),

  // Quit the whole app (tray + bar).
  quit: () => ipcRenderer.send('app:quit'),

  // Fully restart the app (language switch — in-place reload breaks the overlay).
  relaunch: () => ipcRenderer.send('app:relaunch'),
  version: () => ipcRenderer.invoke('app:version'),

  // Launch at login.
  getStartup: () => ipcRenderer.invoke('startup:get'),
  setStartup: (on) => ipcRenderer.invoke('startup:set', on),

  // Display mode: { mode: 'always'|'autohide', reserve: bool }. Drives whether
  // the main process reserves the top edge (AppBar).
  setDisplay: (d) => ipcRenderer.send('display:set', d),
  getDisplays: () => ipcRenderer.invoke('overlay:get-displays'),
  onReserveStatus: (cb) => ipcRenderer.on('display:reserve-status', (_e, status, requested) => cb(status, requested)),
  onEdge: (cb) => ipcRenderer.on('overlay:edge', (_e, atTop) => cb(atTop)),
  onBlur: (cb) => ipcRenderer.on('overlay:blur', () => cb()),
  // macOS menu-bar (Tray) drops -> add to the Clip.
  onAddFiles: (cb) => ipcRenderer.on('clip:add-files', (_e, files) => cb(files)),
  onAddText: (cb) => ipcRenderer.on('clip:add-text', (_e, text) => cb(text)),

  // Force the overlay to the very front (e.g. when revealing over a maximized window).
  raise: () => ipcRenderer.send('overlay:raise'),

  // Resolve the absolute path of a dropped File (Electron removed File.path).
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (_) {
      return (file && file.path) || '';
    }
  },
});

// File browser bridge for the "My Documents" drawer.
contextBridge.exposeInMainWorld('files', {
  list: (dir) => ipcRenderer.invoke('files:list', dir),
  places: () => ipcRenderer.invoke('files:places'),
  icon: (p) => ipcRenderer.invoke('files:icon', p),
  special: (key) => ipcRenderer.invoke('files:special', key),
  open: (p) => ipcRenderer.invoke('files:open', p),
  reveal: (p) => ipcRenderer.invoke('files:reveal', p),
  copyPath: (p) => ipcRenderer.invoke('files:copy-path', p),
  pickFolder: () => ipcRenderer.invoke('files:pick-folder'),
  pickFiles: () => ipcRenderer.invoke('files:pick-files'),
  copyTo: (src, dir) => ipcRenderer.invoke('files:copy-to', src, dir),
  trash: (p) => ipcRenderer.invoke('files:trash', p),
  saveText: (text) => ipcRenderer.invoke('files:save-text', text),
  openText: () => ipcRenderer.invoke('files:open-text'),
  stat: (p) => ipcRenderer.invoke('files:stat', p),
  readText: (p) => ipcRenderer.invoke('files:read-text', p),
  serve: (p) => ipcRenderer.invoke('file:serve', p),
  startDrag: (p) => ipcRenderer.send('files:start-drag', p),
  contextMenu: (info) => ipcRenderer.invoke('files:context-menu', info),
});

// System launchers + clipboard.
contextBridge.exposeInMainWorld('system', {
  open: (key) => ipcRenderer.invoke('system:open', key),
  external: (url) => ipcRenderer.invoke('system:external', url),
  clipboard: () => ipcRenderer.invoke('system:clipboard'),
  bookmarks: () => ipcRenderer.invoke('system:bookmarks'),
  menu: (items) => ipcRenderer.invoke('menu:popup', items),
});

// Live camera (RTSP -> local fragmented-MP4 stream URL).
contextBridge.exposeInMainWorld('camera', {
  url: (rtsp) => ipcRenderer.invoke('camera:url', rtsp),
});

// Google sign-in helper (one session partition per account).
contextBridge.exposeInMainWorld('auth', {
  login: (partition) => ipcRenderer.invoke('auth:login', partition),
  logout: (partition) => ipcRenderer.invoke('auth:logout', partition),
  ensure: (partition) => ipcRenderer.send('auth:ensure', partition),
});

// Language packs: read src/renderer/locales/*.json synchronously so the UI can
// translate at load time, and enumerate them so Settings lists every language.
const LOCALES_DIR = nodePath.join(__dirname, '..', 'renderer', 'locales');
contextBridge.exposeInMainWorld('i18n', {
  list: () => {
    try {
      return fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json')).map((f) => {
        const code = f.replace(/\.json$/, '');
        let name = code;
        try { name = JSON.parse(fs.readFileSync(nodePath.join(LOCALES_DIR, f), 'utf8')).__name__ || code; } catch (_) {}
        return { code, name };
      });
    } catch (_) { return []; }
  },
  load: (code) => {
    try {
      if (!/^[A-Za-z_-]+$/.test(code)) return null;
      return JSON.parse(fs.readFileSync(nodePath.join(LOCALES_DIR, code + '.json'), 'utf8'));
    } catch (_) { return null; }
  },
});
