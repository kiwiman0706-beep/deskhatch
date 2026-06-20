'use strict';

// DeskHatch Browser — main process.
//
// We render ONLY our own chrome (a slim top bar: omnibox + tab strip + quick
// links). Every actual web page runs in a real Edge/Chrome app-mode window
// (see engine.js), which we move/raise/close via winmgr.js so the user
// experiences them as tabs of this browser. Google sign-in works because those
// windows are a genuine standalone browser, not an embedded webview.

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const winmgr = require('./winmgr');
const engine = require('./engine');

const BAR_H = 40; // height of our top shell bar (px)
const INDEX = path.join(__dirname, '..', 'renderer', 'index.html');

let shellWin = null;

// --- tab model --------------------------------------------------------------
// id -> { id, url, hwnd, title }. hwnd is 0 until we've found the spawned
// browser window (we match it by diffing the top-level window list).
const tabs = new Map();
let seq = 0;
let activeId = null;

function workArea() {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return d.workArea;
}
// Where a page window docks: full-ish area just under our bar.
function dockRect() {
  const wa = workArea();
  const w = Math.min(980, wa.width - 40);
  const h = Math.min(760, wa.height - (BAR_H + 40));
  const x = Math.round(wa.x + (wa.width - w) / 2);
  const y = wa.y + BAR_H + 2;
  return { x, y, w, h };
}

function snapshot() { return new Set(winmgr.listWindows().map((w) => w.hwnd)); }
function findNew(before) { return winmgr.listWindows().find((w) => w.pid !== process.pid && !before.has(w.hwnd)); }

function pushTabs() {
  if (!shellWin || shellWin.isDestroyed()) return;
  shellWin.webContents.send('tabs:changed', [...tabs.values()].map((t) => ({
    id: t.id, url: t.url, title: t.title || t.url, active: t.id === activeId,
  })));
}

function normalizeUrl(s) {
  s = String(s || '').trim();
  if (!s) return 'about:blank';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(s)) return 'https://' + s; // looks like a domain
  return 'https://www.google.com/search?q=' + encodeURIComponent(s);
}

function dock(t) {
  if (!t.hwnd) return;
  winmgr.restore(t.hwnd);
  winmgr.move(t.hwnd, dockRect());
  winmgr.front(t.hwnd);
}

function openTab(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!engine.browserExe()) { shell.openExternal(url); return null; } // no Chromium browser: fall back
  const id = 't' + (++seq);
  const t = { id, url, hwnd: 0, title: url };
  tabs.set(id, t); activeId = id; pushTabs();
  const before = snapshot();
  engine.launch(url, dockRect());
  // The page window belongs to the browser process, not our spawn child, so we
  // poll the window list for the one that just appeared and adopt it as the tab.
  let tries = 0;
  const poll = () => {
    if (!tabs.has(id)) return; // closed while opening
    const fresh = findNew(before);
    if (fresh) { t.hwnd = fresh.hwnd; t.title = fresh.title; dock(t); pushTabs(); return; }
    if (++tries < 28) setTimeout(poll, 250);
  };
  setTimeout(poll, 300);
  return id;
}

function activateTab(id) {
  const t = tabs.get(id);
  if (!t) return;
  activeId = id;
  if (t.hwnd) { winmgr.restore(t.hwnd); winmgr.front(t.hwnd); }
  pushTabs();
}

function closeTab(id) {
  const t = tabs.get(id);
  if (!t) return;
  if (t.hwnd) winmgr.close(t.hwnd);
  tabs.delete(id);
  if (activeId === id) activeId = [...tabs.keys()].pop() || null;
  pushTabs();
}

// Keep tab titles fresh from the live windows, and drop tabs whose window the
// user closed directly (via the window's own ✕).
setInterval(() => {
  if (!tabs.size) return;
  const live = new Map(winmgr.listWindows().map((w) => [w.hwnd, w.title]));
  let changed = false;
  for (const t of [...tabs.values()]) {
    if (!t.hwnd) continue;
    if (!live.has(t.hwnd)) { tabs.delete(t.id); if (activeId === t.id) activeId = [...tabs.keys()].pop() || null; changed = true; continue; }
    const nt = live.get(t.hwnd);
    if (nt && nt !== t.title) { t.title = nt; changed = true; }
  }
  if (changed) pushTabs();
}, 1500);

// --- shell window -----------------------------------------------------------
function makeShell() {
  const wa = workArea();
  shellWin = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: BAR_H,
    frame: false, resizable: false, movable: false, maximizable: false,
    minimizable: false, skipTaskbar: false, alwaysOnTop: true,
    title: 'DeskHatch Browser',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  shellWin.setAlwaysOnTop(true, 'floating');
  shellWin.loadFile(INDEX);
  shellWin.on('closed', () => { shellWin = null; });
}

// --- IPC --------------------------------------------------------------------
ipcMain.handle('tabs:open', (_e, url) => openTab(url));
ipcMain.handle('tabs:activate', (_e, id) => { activateTab(id); return true; });
ipcMain.handle('tabs:close', (_e, id) => { closeTab(id); return true; });
ipcMain.handle('tabs:list', () => [...tabs.values()].map((t) => ({ id: t.id, url: t.url, title: t.title, active: t.id === activeId })));
ipcMain.handle('engine:info', () => ({ exe: engine.browserExe(), profile: engine.profileDir() }));

app.whenReady().then(makeShell);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!shellWin) makeShell(); });
// On quit, close any page windows we opened so we don't leave orphans.
app.on('before-quit', () => { for (const t of tabs.values()) if (t.hwnd) { try { winmgr.close(t.hwnd); } catch (_) {} } });
