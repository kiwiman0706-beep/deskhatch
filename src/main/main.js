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
// The AppBar spacer exists ONLY to register the top-edge reservation; the
// reserved rectangle is set by SHAppBarMessage from the display bounds and is
// independent of this window's size. We keep the spacer deliberately short so
// it always hides behind the opaque real bar and can never poke out below the
// reserved strip — even when fractional-DPI scaling (e.g. 150%) makes Electron
// mis-size a window. The visible strip is painted by the real bar.
const SPACER_HEIGHT = 6;
const INDEX = path.join(__dirname, '..', 'renderer', 'index.html');

/** @type {Tray | null} */
let tray = null;

// One "bar" per display we show on. Each entry is independent.
// displayId -> { displayId, win, spacer, reserveActive, repinMode, rePinnedOnce, pinning, lastEdge }
const bars = new Map();
// Last display config pushed from a renderer (shared across windows in Phase 1).
let cfg = { mode: 'autohide', reserve: false, repin: 'event', monitors: null, barColor: '#1f6f6f' };
let edgeTimer = null;
let metricsTimer = null;
let suppressMetricsUntil = 0; // ignore metrics events caused by our own reservation
let lastDisplayIds = '';      // to detect real monitor add/remove

const allDisplays = () => screen.getAllDisplays();
const displayObj = (id) => allDisplays().find((d) => d.id === id) || screen.getPrimaryDisplay();

const isMac = process.platform === 'darwin';
// Top Y for the bar on a display. On macOS we sit just below the system menu
// bar (the work-area top) so we don't fight it; everywhere else we hug the
// absolute top edge of the screen (Fitts's-law slam target).
function barTop(display) {
  return isMac ? display.workArea.y : display.bounds.y;
}

function wantedDisplays() {
  const ids = (cfg.monitors && cfg.monitors.length) ? cfg.monitors : [screen.getPrimaryDisplay().id];
  const want = allDisplays().filter((d) => ids.includes(d.id));
  // Safety: never end up with zero bars (e.g. the chosen monitor was unplugged)
  // — fall back to the primary so the user can still reach the menu.
  return want.length ? want : [screen.getPrimaryDisplay()];
}

// --- window factories -------------------------------------------------------
function makeOverlay(display) {
  const { x, width } = display.bounds;
  const y = barTop(display);
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
  w.loadFile(INDEX, { query: { d: String(display.id) } }); // tell the renderer its display
  return w;
}

function makeSpacer(display) {
  const { x, width } = display.bounds;
  const y = barTop(display);
  const col = cfg.barColor || '#1f6f6f';
  const s = new BrowserWindow({
    x, y, width, height: SPACER_HEIGHT,
    frame: false, transparent: false, backgroundColor: col,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, focusable: false, hasShadow: false,
    alwaysOnTop: true, webPreferences: { backgroundThrottling: false },
  });
  s.setAlwaysOnTop(true, 'floating');
  s.setIgnoreMouseEvents(true);
  s.loadURL('data:text/html,<body style="margin:0;background:' + col.replace('#', '%23') + '"></body>');
  return s;
}

function paintSpacer(entry) {
  if (!entry.spacer || entry.spacer.isDestroyed()) return;
  const col = cfg.barColor || '#1f6f6f';
  try { entry.spacer.setBackgroundColor(col); } catch (_) { /* ignore */ }
  // setBackgroundColor often won't repaint an already-loaded page; set the body too.
  entry.spacer.webContents.executeJavaScript(
    'document.body && (document.body.style.background = ' + JSON.stringify(col) + ')'
  ).catch(() => {});
}

// --- re-pin (keep the bar/spacer at the reserved top edge) ------------------
// The DIP rect of the bar strip: the OS-granted reservation converted back to
// this monitor's DIP (authoritative, DPI-correct), or the display top as a
// fallback before/without a reservation.
function stripDip(entry) {
  if (entry.reservedDip) return entry.reservedDip;
  const d = displayObj(entry.displayId);
  return { x: d.bounds.x, y: barTop(d), width: d.bounds.width, height: BAR_HEIGHT };
}

function rePin(entry, reason) {
  if (!entry.reserveActive || entry.pinning || !entry.win || entry.win.isDestroyed()) return;
  const dr = stripDip(entry);
  entry.pinning = true;
  try {
    if (entry.spacer && !entry.spacer.isDestroyed()) {
      // Keep the spacer at the top of the reserved strip but only SPACER_HEIGHT
      // tall, so it stays tucked behind the opaque real bar (never overflows).
      const sb = entry.spacer.getBounds();
      if (sb.x !== dr.x || sb.y !== dr.y || sb.width !== dr.width || sb.height !== SPACER_HEIGHT) {
        entry.spacer.setBounds({ x: dr.x, y: dr.y, width: dr.width, height: SPACER_HEIGHT });
      }
    }
    const wb = entry.win.getBounds();
    if (wb.x !== dr.x || wb.y !== dr.y || wb.width !== dr.width) {
      if (!entry.rePinnedOnce) { console.info('[appbar] re-pin (' + reason + ') display ' + entry.displayId + ' strip=' + JSON.stringify(dr)); entry.rePinnedOnce = true; }
      entry.win.setBounds({ x: dr.x, y: dr.y, width: dr.width, height: Math.max(dr.height, wb.height) });
      entry.win.moveTop();
    }
  } finally { entry.pinning = false; }
}

function applyReserve(entry) {
  // Reserving the top edge uses the Windows AppBar API; there is no equivalent
  // on macOS/Linux, so the bar there is always overlay-only (no spacer).
  const reserve = cfg.mode === 'always' && cfg.reserve && process.platform === 'win32';
  entry.reserveActive = reserve;
  entry.repinMode = cfg.repin === 'poll' ? 'poll' : 'event';
  entry.rePinnedOnce = false;
  let status = 'off';
  if (reserve) {
    if (!entry.spacer || entry.spacer.isDestroyed()) {
      entry.spacer = makeSpacer(displayObj(entry.displayId));
      entry.spacer.on('move', () => { if (entry.repinMode === 'event') rePin(entry, 'spacer-move'); });
      entry.spacer.webContents.once('dom-ready', () => paintSpacer(entry));
    }
    paintSpacer(entry);
    status = appbar.register(entry.spacer, { edge: 'top', height: BAR_HEIGHT, display: displayObj(entry.displayId) });
    // Convert the OS-granted physical rect back to THIS monitor's DIP — the
    // authoritative, DPI-correct size/position for both windows.
    const rc = appbar.getRect(entry.spacer);
    entry.reservedDip = rc
      ? screen.screenToDipRect(entry.spacer, { x: rc.left, y: rc.top, width: rc.right - rc.left, height: rc.bottom - rc.top })
      : null;
    console.info('[appbar] display ' + entry.displayId + ' rc=' + JSON.stringify(rc) + ' reservedDip=' + JSON.stringify(entry.reservedDip));
    entry.win.setAlwaysOnTop(true, 'screen-saver');
    entry.win.moveTop();
    rePin(entry, 'init');
    // Ground-truth diagnostic: what Electron actually reports for both windows
    // after pinning (DIP). The spacer should be SPACER_HEIGHT tall and hidden
    // behind the bar; the bar should be BAR_HEIGHT tall at the reserved strip.
    try {
      const sgb = entry.spacer && !entry.spacer.isDestroyed() ? entry.spacer.getBounds() : null;
      const wgb = entry.win.getBounds();
      console.info('[diag2] display ' + entry.displayId + ' spacer=' + JSON.stringify(sgb) + ' bar=' + JSON.stringify(wgb));
    } catch (_) { /* ignore */ }
  } else if (entry.spacer && !entry.spacer.isDestroyed()) {
    entry.reservedDip = null;
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
      const dd = displayObj(e.displayId);
      const d = dd.bounds;
      if (e.reserveActive) rePin(e, 'poll'); // always re-pin (robust on multi-monitor)
      const top = barTop(dd);
      const atTop = p.y <= top + 2 && p.x >= d.x && p.x < d.x + d.width;
      if (e.lastEdge !== atTop) { e.lastEdge = atTop; e.win.webContents.send('overlay:edge', atTop); }
    }
  }, 120);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('DeskHatch');
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

// Launch at login (Windows/macOS).
ipcMain.handle('startup:get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('startup:set', (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on });
  return app.getLoginItemSettings().openAtLogin;
});

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
    barColor: (d && d.barColor) || '#1f6f6f',
  };
  reconcile();
});

// --- App lifecycle ----------------------------------------------------------
files.register(anyWin);
auth.register();
system.register();
camera.register();
fileserver.register();

function displayIdsKey() { return allDisplays().map((d) => d.id).sort().join(','); }

function onDisplaysChanged() {
  const ids = displayIdsKey();
  const setChanged = ids !== lastDisplayIds; // a monitor was added/removed
  lastDisplayIds = ids;
  // Ignore work-area-only changes caused by our own reservation, but ALWAYS
  // handle a real monitor add/remove (so we never strand the bar).
  if (!setChanged && Date.now() < suppressMetricsUntil) return;
  clearTimeout(metricsTimer);
  metricsTimer = setTimeout(() => {
    for (const e of bars.values()) {
      if (!e.win || e.win.isDestroyed()) continue;
      const dd = displayObj(e.displayId);
      const d = dd.bounds;
      const top = barTop(dd);
      const b = e.win.getBounds();
      if (b.x !== d.x || b.y !== top || b.width !== d.width) e.win.setBounds({ x: d.x, y: top, width: d.width, height: b.height });
    }
    reconcile();
  }, 300);
}

app.whenReady().then(() => {
  // On macOS run as a menu-bar accessory: no Dock icon, no Cmd-Tab entry, and
  // — crucially — no app menu of our own in the system menu bar, so we don't
  // fight the menu bar we sit just beneath. Lives in the tray instead.
  if (isMac && app.setActivationPolicy) app.setActivationPolicy('accessory');
  auth.setup();
  lastDisplayIds = displayIdsKey();
  reconcile();      // initial bar(s) (primary by default; renderer refines via display:set)
  createTray();
  startEdgeWatch();
  screen.on('display-metrics-changed', onDisplaysChanged);
  screen.on('display-added', onDisplaysChanged);
  screen.on('display-removed', onDisplaysChanged);

  app.on('activate', () => { if (!bars.size) reconcile(); });
});

app.on('window-all-closed', () => { /* live in the tray */ });

function releaseAll() { for (const e of bars.values()) if (e.spacer && !e.spacer.isDestroyed()) appbar.unregister(e.spacer); }
app.on('before-quit', releaseAll);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { releaseAll(); app.quit(); process.exit(0); });
}
