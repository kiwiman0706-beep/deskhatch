'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const appbar = require('./appbar');
const files = require('./files');
const auth = require('./auth');
const system = require('./system');
const camera = require('./camera');
const fileserver = require('./fileserver');

const BAR_HEIGHT = 44; // collapsed strip height (px)
const INDEX = path.join(__dirname, '..', 'renderer', 'index.html');

/** @type {Tray | null} */
let tray = null;

// One "bar" per display we show on. Each entry is independent.
// displayId -> { displayId, win, spacer, reserveActive, repinMode, rePinnedOnce, pinning, lastEdge }
const bars = new Map();
// Last display config pushed from a renderer (shared across windows in Phase 1).
let cfg = { mode: 'autohide', reserve: false, repin: 'event', monitors: null };
let edgeTimer = null;
let metricsTimer = null;
let suppressMetricsUntil = 0; // ignore metrics events caused by our own reservation

const allDisplays = () => screen.getAllDisplays();
const displayObj = (id) => allDisplays().find((d) => d.id === id) || screen.getPrimaryDisplay();

function wantedDisplays() {
  const ids = (cfg.monitors && cfg.monitors.length) ? cfg.monitors : [screen.getPrimaryDisplay().id];
  return allDisplays().filter((d) => ids.includes(d.id));
}

// --- window factories -------------------------------------------------------
function makeOverlay(display) {
  const { x, y, width } = display.bounds;
  const w = new BrowserWindow({
    x, y, width, height: BAR_HEIGHT,
    frame: false, transparent: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
    hasShadow: false, alwaysOnTop: true,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      webviewTag: true, backgroundThrottling: false,
    },
  });
  w.setAlwaysOnTop(true, 'floating');
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  w.setIgnoreMouseEvents(true, { forward: true });
  w.loadFile(INDEX);
  return w;
}

function makeSpacer(display) {
  const { x, y, width } = display.bounds;
  const s = new BrowserWindow({
    x, y, width, height: BAR_HEIGHT,
    frame: false, transparent: false, backgroundColor: '#1f6f6f',
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, focusable: false, hasShadow: false,
    alwaysOnTop: true, webPreferences: { backgroundThrottling: false },
  });
  s.setAlwaysOnTop(true, 'floating');
  s.setIgnoreMouseEvents(true);
  s.loadURL('data:text/html,<body style="margin:0;background:%231f6f6f"></body>');
  return s;
}

// --- re-pin (keep the bar/spacer at the reserved top edge) ------------------
function rePin(entry, reason) {
  if (!entry.reserveActive || entry.pinning || !entry.win || entry.win.isDestroyed()) return;
  const d = displayObj(entry.displayId).bounds;
  entry.pinning = true;
  try {
    if (entry.spacer && !entry.spacer.isDestroyed()) {
      const sb = entry.spacer.getBounds();
      if (sb.x !== d.x || sb.y !== d.y) entry.spacer.setBounds({ x: d.x, y: d.y, width: sb.width, height: sb.height });
    }
    const wb = entry.win.getBounds();
    if (wb.x !== d.x || wb.y !== d.y) {
      if (!entry.rePinnedOnce) { console.info('[appbar] re-pin (' + reason + ') display ' + entry.displayId); entry.rePinnedOnce = true; }
      entry.win.setBounds({ x: d.x, y: d.y, width: wb.width, height: wb.height });
      entry.win.moveTop();
    }
  } finally { entry.pinning = false; }
}

function applyReserve(entry) {
  const reserve = cfg.mode === 'always' && cfg.reserve;
  entry.reserveActive = reserve;
  entry.repinMode = cfg.repin === 'poll' ? 'poll' : 'event';
  entry.rePinnedOnce = false;
  let status = 'off';
  if (reserve) {
    if (!entry.spacer || entry.spacer.isDestroyed()) {
      entry.spacer = makeSpacer(displayObj(entry.displayId));
      entry.spacer.on('move', () => { if (entry.repinMode === 'event') rePin(entry, 'spacer-move'); });
    }
    status = appbar.register(entry.spacer, { edge: 'top', height: BAR_HEIGHT, display: displayObj(entry.displayId) });
    entry.win.setAlwaysOnTop(true, 'screen-saver');
    entry.win.moveTop();
    rePin(entry, 'init');
  } else if (entry.spacer && !entry.spacer.isDestroyed()) {
    appbar.unregister(entry.spacer);
    entry.spacer.close();
    entry.spacer = null;
  }
  if (entry.win && !entry.win.isDestroyed()) entry.win.webContents.send('display:reserve-status', status, reserve);
}

function createBar(display) {
  const win = makeOverlay(display);
  const entry = { displayId: display.id, win, spacer: null, reserveActive: false, repinMode: 'event', rePinnedOnce: false, pinning: false, lastEdge: null };
  win.on('move', () => { if (entry.repinMode === 'event') rePin(entry, 'move'); });
  win.on('closed', () => { bars.delete(display.id); });
  win.webContents.once('did-finish-load', () => {
    const d = displayObj(display.id);
    console.info('[diag] display ' + display.id + ' bounds=' + JSON.stringify(d.bounds) + ' sf=' + d.scaleFactor);
  });
  bars.set(display.id, entry);
  return entry;
}

function destroyBar(id) {
  const e = bars.get(id);
  if (!e) return;
  if (e.spacer && !e.spacer.isDestroyed()) { appbar.unregister(e.spacer); e.spacer.close(); }
  if (e.win && !e.win.isDestroyed()) e.win.close();
  bars.delete(id);
}

// Create/destroy bars to match the wanted displays, then apply reserve to each.
function reconcile() {
  const want = wantedDisplays();
  const wantIds = want.map((d) => d.id);
  for (const id of [...bars.keys()]) if (!wantIds.includes(id)) destroyBar(id);
  for (const d of want) if (!bars.has(d.id)) createBar(d);
  for (const e of bars.values()) applyReserve(e);
  // Reserving changes the work area, which fires display-metrics-changed.
  // Ignore those for a moment so we don't re-reconcile in a runaway loop.
  suppressMetricsUntil = Date.now() + 2000;
}

function anyWin() {
  const f = BrowserWindow.getFocusedWindow();
  if (f && !f.isDestroyed()) return f;
  for (const e of bars.values()) if (e.win && !e.win.isDestroyed()) return e.win;
  return null;
}

function toggleAll() {
  if (!bars.size) { reconcile(); return; }
  const anyVisible = [...bars.values()].some((e) => e.win && e.win.isVisible());
  for (const e of bars.values()) if (e.win && !e.win.isDestroyed()) { if (anyVisible) e.win.hide(); else e.win.show(); }
}

// --- cursor / edge watch (one timer, all bars) ------------------------------
function startEdgeWatch() {
  if (edgeTimer) return;
  edgeTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    for (const e of bars.values()) {
      if (!e.win || e.win.isDestroyed() || !e.win.isVisible()) continue;
      const d = displayObj(e.displayId).bounds;
      if (e.reserveActive && e.repinMode === 'poll') rePin(e, 'poll');
      const atTop = p.y <= d.y + 2 && p.x >= d.x && p.x < d.x + d.width;
      if (e.lastEdge !== atTop) { e.lastEdge = atTop; e.win.webContents.send('overlay:edge', atTop); }
    }
  }, 120);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('SmartSuite.next');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '表示 / 非表示', click: toggleAll },
    { label: 'Google にログイン', click: () => auth.openLogin() },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() },
  ]));
  tray.on('click', toggleAll);
}

// --- IPC (routed to the sending window) -------------------------------------
ipcMain.on('overlay:set-ignore-mouse', (e, ignore) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) w.setIgnoreMouseEvents(!!ignore, { forward: true });
});

ipcMain.on('overlay:raise', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) { w.setAlwaysOnTop(true, 'screen-saver'); w.moveTop(); }
});

ipcMain.on('overlay:set-height', (e, height) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.isDestroyed()) return;
  const b = w.getBounds();
  const h = Math.max(BAR_HEIGHT, Math.ceil(height) || BAR_HEIGHT);
  if (b.height !== h) w.setBounds({ x: b.x, y: b.y, width: b.width, height: h });
});

ipcMain.on('app:quit', () => app.quit());

ipcMain.handle('overlay:get-displays', () => {
  const prim = screen.getPrimaryDisplay().id;
  return allDisplays().map((dp, i) => ({ id: dp.id, label: 'モニタ' + (i + 1) + (dp.id === prim ? '（主）' : ''), primary: dp.id === prim }));
});

ipcMain.on('display:set', (_e, d) => {
  cfg = {
    mode: d && d.mode,
    reserve: !!(d && d.reserve),
    repin: (d && d.repin) || 'event',
    monitors: Array.isArray(d && d.monitors) ? d.monitors : null,
  };
  reconcile();
});

// --- App lifecycle ----------------------------------------------------------
files.register(anyWin);
auth.register();
system.register();
camera.register();
fileserver.register();

app.whenReady().then(() => {
  auth.setup();
  reconcile();      // initial bar(s) (primary by default; renderer refines via display:set)
  createTray();
  startEdgeWatch();
  screen.on('display-metrics-changed', () => {
    if (Date.now() < suppressMetricsUntil) return; // our own reservation; ignore
    clearTimeout(metricsTimer);
    metricsTimer = setTimeout(() => {
      for (const e of bars.values()) {
        if (!e.win || e.win.isDestroyed()) continue;
        const d = displayObj(e.displayId).bounds;
        const b = e.win.getBounds();
        if (b.x !== d.x || b.y !== d.y || b.width !== d.width) e.win.setBounds({ x: d.x, y: d.y, width: d.width, height: b.height });
      }
      reconcile();
    }, 400);
  });

  app.on('activate', () => { if (!bars.size) reconcile(); });
});

app.on('window-all-closed', () => { /* live in the tray */ });

function releaseAll() { for (const e of bars.values()) if (e.spacer && !e.spacer.isDestroyed()) appbar.unregister(e.spacer); }
app.on('before-quit', releaseAll);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { releaseAll(); app.quit(); process.exit(0); });
}
