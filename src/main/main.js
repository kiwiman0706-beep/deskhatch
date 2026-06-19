'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, globalShortcut, clipboard, desktopCapturer } = require('electron');
const path = require('path');
const appbar = require('./appbar');
const fullscreen = require('./fullscreen');
const winmgr = require('./winmgr');
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
let cfg = { mode: 'autohide', reserve: false, repin: 'event', monitors: null, barColor: '#1f6f6f', hideFs: true };
let edgeTimer = null;
let metricsTimer = null;
let suppressMetricsUntil = 0; // ignore metrics events caused by our own reservation
let lastDisplayIds = '';      // to detect real monitor add/remove

const allDisplays = () => screen.getAllDisplays();
const displayObj = (id) => allDisplays().find((d) => d.id === id) || screen.getPrimaryDisplay();

const isMac = process.platform === 'darwin';
// Running inside the Microsoft Store (MSIX/appx) container. Google blocks
// sign-in from embedded browsers, which fails Store certification, so the Store
// build hides the Google sign-in feature and Google default drawers.
const isStore = !!process.windowsStore;
// Tiny main-process i18n for native menus/labels (follows the OS locale).
const LM = (ja, en) => { try { return app.getLocale().toLowerCase().startsWith('ja') ? ja : en; } catch (_) { return en; } };
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
  // macOS: keep the bar usable on fullscreen Spaces too. (The traffic-light
  // buttons it can overlap are reachable from the bar's own "exit fullscreen"
  // button — see system:exit-fullscreen.)
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  w.setIgnoreMouseEvents(true, { forward: true });
  w.loadFile(INDEX, { query: { d: String(display.id), store: isStore ? '1' : '' } }); // tell the renderer its display
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

function sendToBar(channel, payload) {
  const e = [...bars.values()].find((b) => b.win && !b.win.isDestroyed());
  if (e) e.win.webContents.send(channel, payload);
}

// --- Global hotkeys ---------------------------------------------------------
function captureClipboard() {
  try {
    const html = clipboard.readHTML();
    const img = clipboard.readImage();
    const text = clipboard.readText();
    let payload = null;
    if (html && /<(img|table|h[1-6]|ul|ol|p|figure|pre|blockquote)\b/i.test(html)) payload = { kind: 'html', html, text: text || '' };
    else if (img && !img.isEmpty()) payload = { kind: 'html', html: '<img src="' + img.toDataURL() + '">', text: '' };
    else if (text && text.trim()) payload = { kind: 'text', text: text.trim() };
    if (payload) sendToBar('hotkey:capture', payload);
  } catch (_) {}
}
function revealBars() { for (const e of bars.values()) if (e.win && !e.win.isDestroyed()) e.win.show(); sendToBar('hotkey:reveal'); }
const HK_ACTIONS = { capture: captureClipboard, reveal: revealBars, clip: () => sendToBar('hotkey:clip'), scrap: () => sendToBar('hotkey:scrap'), shot: () => startShot() };
function registerHotkeys(cfg) {
  try { globalShortcut.unregisterAll(); } catch (_) {}
  cfg = cfg || {};
  const res = {};
  for (const act of Object.keys(HK_ACTIONS)) {
    const accel = String(cfg[act] || '').trim();
    if (!accel) { res[act] = null; continue; }
    try { res[act] = globalShortcut.register(accel, HK_ACTIONS[act]); } catch (_) { res[act] = false; }
  }
  const tabHk = cfg.tabs || {};
  for (const id of Object.keys(tabHk)) {
    const accel = String(tabHk[id] || '').trim();
    if (!accel) continue;
    try { res['tab:' + id] = globalShortcut.register(accel, () => sendToBar('hotkey:tab', id)); } catch (_) { res['tab:' + id] = false; }
  }
  return res;
}
ipcMain.handle('hotkeys:set', (_e, cfg) => registerHotkeys(cfg));
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch (_) {} });

// --- Region screenshot -> image clip ----------------------------------------
let shotWin = null;
function startShot() {
  (async () => {
    try {
      const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const sf = disp.scaleFactor || 1;
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(disp.size.width * sf), height: Math.round(disp.size.height * sf) } });
      const src = sources.find((s) => String(s.display_id) === String(disp.id)) || sources[0];
      if (!src) return;
      const dataUrl = src.thumbnail.toDataURL();
      if (shotWin && !shotWin.isDestroyed()) shotWin.close();
      shotWin = new BrowserWindow({
        x: disp.bounds.x, y: disp.bounds.y, width: disp.bounds.width, height: disp.bounds.height,
        frame: false, transparent: false, resizable: false, movable: false, minimizable: false,
        maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true,
        webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, nodeIntegration: false },
      });
      shotWin.setAlwaysOnTop(true, 'screen-saver');
      shotWin.loadFile(path.join(__dirname, '..', 'renderer', 'shot.html'));
      shotWin.webContents.once('did-finish-load', () => { try { shotWin.webContents.send('shot:image', dataUrl); } catch (_) {} });
    } catch (e) { try { console.warn('[shot] ' + e.message); } catch (_) {} }
  })();
}
ipcMain.on('screenshot:start', startShot);
ipcMain.on('screenshot:done', (_e, dataUrl) => { if (shotWin && !shotWin.isDestroyed()) shotWin.close(); shotWin = null; if (dataUrl) sendToBar('clip:add-image', dataUrl); });
ipcMain.on('screenshot:cancel', () => { if (shotWin && !shotWin.isDestroyed()) shotWin.close(); shotWin = null; });

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
// Hide a bar while a full-screen app (game / video / presentation) covers ITS
// monitor, then restore it when the app ends — leaving bars on other monitors
// untouched. Polled on the slow cadence; Windows-only signal, no-op elsewhere.
// Gated by the `hideFs` setting. Per-bar + idempotent, so it self-heals on
// monitor hot-plug and never fights normal show/hide.
function updateFullscreen() {
  const ids = cfg.hideFs ? fullscreen.activeDisplayIds() : []; // [] none | [ids] some | null all
  const hideAll = ids === null;
  const hideSet = hideAll ? null : new Set((ids || []).map(String));
  for (const e of bars.values()) {
    if (!e.win || e.win.isDestroyed()) continue;
    const shouldHide = hideAll || (hideSet && hideSet.has(String(e.displayId)));
    if (shouldHide) {
      if (!e.fsHidden) { e.fsHidden = true; e.preFsVisible = e.win.isVisible(); }
      if (e.win.isVisible()) e.win.hide();
    } else if (e.fsHidden) {
      e.fsHidden = false;
      if (e.preFsVisible !== false) e.win.show();
      e.preFsVisible = undefined;
    }
  }
}

// --- "Nyokitt": summon/tuck an arbitrary external window as a drawer ---------
// Windows-only. summonNyoki() brings a chosen top-level window to the front and
// docks it under the bar; updateNyoki() tucks (minimizes) it once focus leaves
// its process. No-op elsewhere; fully guarded via winmgr.
let nyoki = null; // { hwnd, pid, since }
const nyokiPlaced = new Map(); // titleKey -> { x, y, w, h } we last applied
function summonNyoki(title, anchorX) {
  if (process.platform !== 'win32') return false;
  const mine = process.pid;
  const list = winmgr.listWindows().filter((w) => w.pid !== mine);
  const t = String(title || '').toLowerCase();
  const win = list.find((w) => w.title.toLowerCase() === t) || list.find((w) => w.title.toLowerCase().includes(t));
  if (!win) return false;
  const key = win.title.toLowerCase();
  winmgr.restore(win.hwnd); // un-minimize first so geometry is real
  // Only dock it the first time (or while the user hasn't moved/resized it).
  // Once they customize the size/position, leave it where they put it.
  const rec = nyokiPlaced.get(key);
  const cur = winmgr.getRect(win.hwnd);
  const customized = rec && cur && (Math.abs(cur.x - rec.x) > 8 || Math.abs(cur.y - rec.y) > 8 || Math.abs(cur.w - rec.w) > 8 || Math.abs(cur.h - rec.h) > 8);
  if (!customized) {
    const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const wa = disp.workArea;
    const w = (cur && cur.w) ? Math.min(cur.w, wa.width) : Math.min(960, wa.width - 60);
    const h = (cur && cur.h) ? Math.min(cur.h, wa.height - (BAR_HEIGHT + 12)) : Math.min(680, wa.height - (BAR_HEIGHT + 60));
    let x = (typeof anchorX === 'number') ? anchorX : Math.round(wa.x + (wa.width - w) / 2);
    x = Math.max(wa.x, Math.min(x, wa.x + wa.width - w)); // clamp on-screen
    const rect = { x, y: wa.y + BAR_HEIGHT + 2, w, h };
    winmgr.move(win.hwnd, rect);
    nyokiPlaced.set(key, rect);
  }
  winmgr.front(win.hwnd);
  nyoki = { hwnd: win.hwnd, pid: win.pid, since: Date.now() };
  return true;
}
function updateNyoki() {
  if (!nyoki) return;
  if (Date.now() - nyoki.since < 700) return; // grace right after summon
  const fpid = winmgr.foregroundPid();
  if (fpid && fpid !== nyoki.pid) { winmgr.tuck(nyoki.hwnd); nyoki = null; }
}
// Optional: turn OFF Windows' system-wide minimize/maximize animation while
// DeskHatch runs (so the "nyoki" tuck doesn't fly toward the taskbar). We save
// the prior state on first disable and restore it when re-enabled or on quit,
// so we never leave the user's system permanently changed.
let savedMinAnim; // undefined = we haven't touched it
function applyMinAnim(disable) {
  if (process.platform !== 'win32') return;
  if (disable) {
    if (savedMinAnim === undefined) savedMinAnim = winmgr.getMinAnimation();
    winmgr.setMinAnimation(false);
  } else if (savedMinAnim !== undefined) {
    winmgr.setMinAnimation(savedMinAnim === null ? true : savedMinAnim);
    savedMinAnim = undefined;
  }
}
ipcMain.on('winmgr:set-min-anim', (_e, disable) => applyMinAnim(!!disable));
app.on('before-quit', () => { if (savedMinAnim !== undefined) { try { winmgr.setMinAnimation(savedMinAnim === null ? true : savedMinAnim); } catch (_) {} } });

ipcMain.handle('winmgr:list', () => winmgr.listWindows().filter((w) => w.pid !== process.pid));
ipcMain.handle('winmgr:summon', (e, title, clientX) => {
  let anchorX;
  try {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w && typeof clientX === 'number') anchorX = Math.round(w.getBounds().x + clientX);
  } catch (_) {}
  return summonNyoki(title, anchorX);
});

function startEdgeWatch() {
  if (edgeTimer) return;
  let tick = 0;
  edgeTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    const slow = (tick++ % 8) === 0; // ~16ms * 8 ≈ 128ms
    if ((tick % 30) === 0) updateFullscreen(); // ~480ms
    if (slow) updateNyoki(); // tuck a summoned window when focus leaves it
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
    { label: LM('表示 / 非表示', 'Show / Hide'), click: toggleAll },
    ...(isStore ? [] : [{ label: LM('Google にログイン', 'Sign in to Google'), click: () => auth.openLogin() }]),
    { type: 'separator' },
    { label: LM('デモモード（録画用）', 'Demo mode (recording)'), click: () => sendToBar('demo:toggle') },
    { label: LM('更新を確認', 'Check for updates…'), click: () => updater.checkNow() },
    { label: LM('再起動', 'Restart'), click: () => { app.relaunch(); app.quit(); } },
    { label: LM('終了', 'Quit'), click: () => app.quit() },
    { label: LM('強制終了', 'Force quit'), click: () => app.exit(0) },
  ]));
  tray.on('click', toggleAll);

  // macOS: drop files / text onto the menu-bar icon to add them to the Clip.
  // (Tray drag/drop events are macOS-only; attaching elsewhere is harmless.)
  const toBar = (channel, payload) => {
    const e = [...bars.values()].find((b) => b.win && !b.win.isDestroyed());
    if (e) e.win.webContents.send(channel, payload);
  };
  tray.on('drop-files', (_e, files) => toBar('clip:add-files', files));
  tray.on('drop-text', (_e, text) => toBar('clip:add-text', text));
  const dropTip = () => { try { tray.setToolTip('DeskHatch — ' + LM('ここにドロップで追加', 'Drop here to add to Clip')); } catch (_) {} };
  const resetTip = () => { try { tray.setToolTip('DeskHatch'); } catch (_) {} };
  tray.on('drag-enter', dropTip);
  tray.on('drag-leave', resetTip);
  tray.on('drag-end', resetTip);
}

// --- IPC (routed to the sending window) -------------------------------------
// Full restart (used by the language switch — an in-place reload leaves the
// transparent always-on-top overlay unresponsive; a clean relaunch doesn't).
ipcMain.on('app:relaunch', () => { app.relaunch(); app.quit(); });

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.on('app:check-updates', () => updater.checkNow());
ipcMain.handle('update:get-beta', () => updater.getBeta());
ipcMain.on('update:set-beta', (_e, on) => updater.setBeta(!!on));

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

let scrapWin = null;
ipcMain.on('scrap:open', (_e, root) => {
  try {
    if (scrapWin && !scrapWin.isDestroyed()) { scrapWin.show(); scrapWin.focus(); return; }
    scrapWin = new BrowserWindow({
      width: 940, height: 640, minWidth: 560, minHeight: 360,
      title: 'DeskHatch Scrapbook', backgroundColor: '#ffffff',
      webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
    });
    scrapWin.setMenuBarVisibility(false);
    scrapWin.loadFile(path.join(__dirname, '..', 'renderer', 'scrap.html'), { query: { root: root || '', lang: (app.getLocale() || '') } });
    scrapWin.on('closed', () => { scrapWin = null; });
  } catch (e) { try { console.warn('[scrap] ' + e.message); } catch (_) {} }
});

// --- Sticky Notes ------------------------------------------------------------
// A pinned scrapbook note shown as a small frameless, always-on-top card that
// reads/writes the underlying box file (so the content stays Drive-syncable).
// The set of pinned notes plus each one's window geometry/colour is persisted
// locally (per machine) and restored on launch. Only notes the user pins show.
const STICKY_STORE = path.join(app.getPath('userData'), 'stickies.json');
const stickyWins = new Map();   // notePath -> BrowserWindow
let stickyState = null;         // { [notePath]: { x, y, w, h, color } }
let stickySaveTimer = null;
function loadStickyState() {
  if (stickyState) return stickyState;
  try { stickyState = JSON.parse(require('fs').readFileSync(STICKY_STORE, 'utf8')); } catch (_) { stickyState = {}; }
  if (!stickyState || typeof stickyState !== 'object') stickyState = {};
  return stickyState;
}
function saveStickyState() {
  clearTimeout(stickySaveTimer);
  stickySaveTimer = setTimeout(() => { try { require('fs').writeFileSync(STICKY_STORE, JSON.stringify(stickyState || {})); } catch (_) {} }, 300);
}
function openSticky(p, opts) {
  if (!p) return;
  opts = opts || {};
  const st = loadStickyState();
  const existing = stickyWins.get(p);
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return; }
  const saved = st[p] || (st[p] = {});
  const color = opts.color || saved.color || 'yellow';
  saved.color = color; saveStickyState();
  const n = stickyWins.size;
  const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = disp.workArea;
  const w = new BrowserWindow({
    width: saved.w || 260, height: saved.h || 220, minWidth: 160, minHeight: 120,
    x: (typeof saved.x === 'number') ? saved.x : (wa.x + wa.width - 290 - (n % 6) * 26),
    y: (typeof saved.y === 'number') ? saved.y : (wa.y + 60 + (n % 6) * 26),
    frame: false, transparent: false, resizable: true, skipTaskbar: true,
    hasShadow: true, alwaysOnTop: true, backgroundColor: '#fff9c4', title: 'Sticky',
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  w.setAlwaysOnTop(true, 'floating');
  w.setMenuBarVisibility(false);
  w.loadFile(path.join(__dirname, '..', 'renderer', 'sticky.html'), { query: { path: p, lang: (app.getLocale() || ''), color } });
  stickyWins.set(p, w);
  const persist = () => { try { const b = w.getBounds(); const r = stickyState[p] || (stickyState[p] = {}); r.x = b.x; r.y = b.y; r.w = b.width; r.h = b.height; saveStickyState(); } catch (_) {} };
  w.on('move', persist); w.on('resize', persist);
  w.on('closed', () => { stickyWins.delete(p); });
}
function closeSticky(p) {
  const st = loadStickyState();
  delete st[p]; saveStickyState();
  const w = stickyWins.get(p); stickyWins.delete(p);
  if (w && !w.isDestroyed()) w.close();
}
ipcMain.on('sticky:open', (_e, p) => openSticky(p));
ipcMain.on('sticky:close', (_e, p) => closeSticky(p));
ipcMain.handle('sticky:list', () => Object.keys(loadStickyState()));
ipcMain.on('sticky:set-color', (_e, p, color) => { const r = loadStickyState()[p] || (loadStickyState()[p] = {}); r.color = color; saveStickyState(); });
function restoreStickies() { try { Object.keys(loadStickyState()).forEach((p, i) => setTimeout(() => openSticky(p), 400 + i * 120)); } catch (_) {} }

// Launch at login (Windows/macOS).
ipcMain.handle('startup:get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('startup:set', (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('overlay:get-displays', () => {
  const prim = screen.getPrimaryDisplay().id;
  return allDisplays().map((dp, i) => ({ id: dp.id, label: LM('モニタ', 'Monitor ') + (i + 1) + (dp.id === prim ? LM('（主）', ' (primary)') : ''), primary: dp.id === prim }));
});

ipcMain.on('display:set', (_e, d) => {
  cfg = {
    mode: d && d.mode,
    reserve: !!(d && d.reserve),
    repin: (d && d.repin) || 'event',
    monitors: Array.isArray(d && d.monitors) ? d.monitors : null,
    barColor: (d && d.barColor) || '#1f6f6f',
    hideFs: (d && d.hideOnFullscreen) !== false, // default ON
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
  restoreStickies();
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
