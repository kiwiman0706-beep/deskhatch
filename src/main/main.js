'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const appbar = require('./appbar');
const files = require('./files');
const auth = require('./auth');
const system = require('./system');
const camera = require('./camera');
const fileserver = require('./fileserver');
const updater = require('./updater');

const BAR_HEIGHT = 44; // collapsed strip height (px)
const INDEX = path.join(__dirname, '..', 'renderer', 'index.html');
// `electron . --selftest`: force top-edge reservation on every monitor, then
// verify (numerically, no GUI needed) that each spacer's bottom edge lines up
// with its bar's bottom and never pokes out below. Prints PASS/FAIL and exits
// with code 0/1 — lets a local agent iterate on the DPI/reservation geometry
// without anyone having to eyeball the screen.
const SELFTEST = process.argv.includes('--selftest');

/** @type {Tray | null} */
let tray = null;

// One "bar" per display we show on. Each entry is independent.
// displayId -> { displayId, win, spacer, reserveActive, repinMode, rePinnedOnce, pinning, lastEdge, hit, ignoring }
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
    x, y, width, height: BAR_HEIGHT,
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

// Place the opaque AppBar spacer so its BOTTOM edge aligns exactly with the
// reserved strip's bottom (= the real bar's bottom). Windows enforces a minimum
// window height (~56 physical px), so on monitors where that minimum exceeds the
// bar height the spacer would otherwise poke out BELOW the bar and cover the
// title bar of maximized windows. We instead let the surplus height spill UPWARD
// past the top screen edge (off-screen / hidden), keeping the visible bottom
// pixel-aligned with the bar. The AppBar reservation itself is set from the
// display bounds and is unaffected by where this window sits.
function placeSpacer(entry) {
  const s = entry.spacer;
  if (!s || s.isDestroyed() || entry.placingSpacer) return;
  const dr = stripDip(entry);
  // Read the spacer's CURRENT (OS-clamped) bounds. Registering the AppBar shrinks
  // the work area and Windows pushes our windows down out of the reserved strip;
  // we must keep correcting the spacer back, not cache "done" (that left it stuck
  // below the bar). Bottom-align: if the clamped height is taller than the bar,
  // spill the surplus UPWARD off the top edge instead of below over windows.
  const cur = s.getBounds();
  const overflow = cur.height - BAR_HEIGHT;
  const wantY = overflow > 0 ? dr.y - overflow : dr.y;
  if (cur.x === dr.x && cur.width === dr.width && cur.y === wantY) return; // already correct
  entry.placingSpacer = true;
  try {
    s.setBounds({ x: dr.x, y: wantY, width: dr.width, height: cur.height });
  } finally { entry.placingSpacer = false; }
}

function rePin(entry, reason) {
  if (!entry.reserveActive || entry.pinning || !entry.win || entry.win.isDestroyed()) return;
  const dr = stripDip(entry);
  entry.pinning = true;
  try {
    if (entry.spacer && !entry.spacer.isDestroyed()) placeSpacer(entry);
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
    // after pinning (DIP). The spacer's BOTTOM (y + height) should equal the
    // bar's bottom; surplus height (OS min) spills upward (negative-ish y).
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
  const entry = { displayId: display.id, win, spacer: null, reserveActive: false, repinMode: 'event', rePinnedOnce: false, pinning: false, lastEdge: null,
    // Click pass-through, driven by the cursor watch from the renderer's reported
    // geometry. mode: 'none' (all through) | 'all' (all captured) | 'rects'.
    // Default 'none' so the desktop stays clickable until the renderer reports in.
    hit: { mode: 'none', rects: [] }, ignoring: true };
  win.on('move', () => { if (entry.repinMode === 'event') rePin(entry, 'move'); });
  win.on('blur', () => { if (!win.isDestroyed()) win.webContents.send('overlay:blur'); });
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

// Click pass-through for one window, decided from the real cursor position
// against the interactive rectangles the renderer reported. This replaces DOM
// mousemove hit-testing, which a <webview> swallows (clicks leaked behind open
// drawers) and which lagged clicks made right after reaching the bar.
function applyHit(e, p) {
  const h = e.hit;
  let ignore;
  if (h.mode === 'all') ignore = false;
  else if (h.mode === 'rects') {
    const wb = e.win.getBounds();                 // DIP; window-local CSS px == DIP
    const lx = p.x - wb.x, ly = p.y - wb.y;
    ignore = !h.rects.some((r) => lx >= r.x && lx < r.x + r.w && ly >= r.y && ly < r.y + r.h);
  } else ignore = true;                           // 'none'
  if (e.ignoring !== ignore) { e.ignoring = ignore; e.win.setIgnoreMouseEvents(ignore, { forward: true }); }
}

// --- cursor / edge / pass-through watch (one timer, all bars) ----------------
// Runs fast so click pass-through tracks the cursor without a per-click race;
// the heavier edge-reveal + AppBar re-pin only need the slower ~120ms cadence.
function startEdgeWatch() {
  if (edgeTimer) return;
  let tick = 0;
  edgeTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    const slow = (tick++ % 8) === 0; // ~16ms * 8 ≈ 128ms
    for (const e of bars.values()) {
      if (!e.win || e.win.isDestroyed()) continue;
      applyHit(e, p);
      if (!slow || !e.win.isVisible()) continue;
      const dd = displayObj(e.displayId);
      const d = dd.bounds;
      if (e.reserveActive) rePin(e, 'poll'); // always re-pin (robust on multi-monitor)
      const top = barTop(dd);
      const atTop = p.y <= top + 2 && p.x >= d.x && p.x < d.x + d.width;
      if (e.lastEdge !== atTop) { e.lastEdge = atTop; e.win.webContents.send('overlay:edge', atTop); }
    }
  }, 16);
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

// Renderer reports its interactive geometry; the cursor watch (applyHit) turns
// it into the per-window click pass-through flag.
ipcMain.on('overlay:set-hit', (e, mode, rects) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.isDestroyed()) return;
  for (const entry of bars.values()) {
    if (entry.win === w) { entry.hit = { mode, rects: Array.isArray(rects) ? rects : [] }; break; }
  }
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

// Numeric self-test for the spacer/bar geometry (see SELFTEST above).
function runSelfTest() {
  if (process.platform !== 'win32') {
    console.info('[selftest] SKIP (top-edge reservation is Windows-only)');
    app.exit(0);
    return;
  }
  // Force reserve mode on every connected monitor.
  cfg = { mode: 'always', reserve: true, repin: 'event', monitors: allDisplays().map((d) => d.id), barColor: '#1f6f6f' };
  reconcile();
  startEdgeWatch(); // keep rePin correcting the OS's post-reservation push
  // Let the windows settle (reservation shrinks the work area asynchronously,
  // then the poll re-pins), then assert the invariant.
  setTimeout(() => {
    let allPass = true;
    let n = 0;
    for (const e of bars.values()) {
      if (!e.win || e.win.isDestroyed()) continue;
      n += 1;
      const d = displayObj(e.displayId);
      const wb = e.win.getBounds();
      const sb = e.spacer && !e.spacer.isDestroyed() ? e.spacer.getBounds() : null;
      if (!sb) { allPass = false; console.info('[selftest] display ' + e.displayId + ' FAIL no-spacer'); continue; }
      const spacerBottom = sb.y + sb.height;
      const barBottom = wb.y + wb.height;
      const overflowBelow = spacerBottom - barBottom; // >0 = pokes below the bar (BAD)
      const pass = overflowBelow <= 0 && spacerBottom === barBottom;
      if (!pass) allPass = false;
      console.info('[selftest] display ' + e.displayId + ' sf=' + d.scaleFactor + ' ' + (pass ? 'PASS' : 'FAIL') +
        ' spacerBottom=' + spacerBottom + ' barBottom=' + barBottom + ' overflowBelow=' + overflowBelow +
        ' spacer=' + JSON.stringify(sb) + ' bar=' + JSON.stringify(wb));
    }
    if (n === 0) { allPass = false; console.info('[selftest] FAIL no-bars'); }
    console.info('[selftest] RESULT ' + (allPass ? 'PASS' : 'FAIL'));
    app.exit(allPass ? 0 : 1);
  }, 2500);
}

app.whenReady().then(() => {
  // On macOS run as a menu-bar accessory: no Dock icon, no Cmd-Tab entry, and
  // — crucially — no app menu of our own in the system menu bar, so we don't
  // fight the menu bar we sit just beneath. Lives in the tray instead.
  if (isMac && app.setActivationPolicy) app.setActivationPolicy('accessory');
  auth.setup();
  lastDisplayIds = displayIdsKey();
  if (SELFTEST) { runSelfTest(); return; }
  reconcile();      // initial bar(s) (primary by default; renderer refines via display:set)
  createTray();
  startEdgeWatch();
  screen.on('display-metrics-changed', onDisplaysChanged);
  screen.on('display-added', onDisplaysChanged);
  screen.on('display-removed', onDisplaysChanged);

  // Windows: silent auto-update; macOS/other: a "newer release" notice. No-op in
  // dev. Delay so the UI settles and we never block first paint on the network.
  setTimeout(() => updater.init(), 4000);

  app.on('activate', () => { if (!bars.size) reconcile(); });
});

app.on('window-all-closed', () => { /* live in the tray */ });

function releaseAll() { for (const e of bars.values()) if (e.spacer && !e.spacer.isDestroyed()) appbar.unregister(e.spacer); }
app.on('before-quit', releaseAll);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { releaseAll(); app.quit(); process.exit(0); });
}
