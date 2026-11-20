'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, globalShortcut, clipboard, desktopCapturer } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const appbar = require('./appbar');
const fullscreen = require('./fullscreen');
const winmgr = require('./winmgr');
const files = require('./files');
const auth = require('./auth');
const system = require('./system');
const camera = require('./camera');
const fileserver = require('./fileserver');
const updater = require('./updater');
const localapp = require('./localapp');
// Pure, unit-tested geometry shared with the renderer. The bar can hug any
// screen edge; everything below is written in terms of that edge.
const layout = require('../renderer/lib/layout');

const BAR_HEIGHT = 44; // collapsed strip thickness (px): height when horizontal, width when vertical
const INDEX = path.join(__dirname, '..', 'renderer', 'index.html');
// `electron . --selftest`: force reservation on every monitor, then verify
// (numerically, no GUI needed) that each spacer's INNER edge lines up with its
// bar's inner edge and never pokes past it over the desktop, and that no bar
// is deeper than its bar thickness. Prints PASS/FAIL and exits with code 0/1 —
// lets a local agent iterate on the DPI/reservation geometry without anyone
// having to eyeball the screen. DESKHATCH_EDGE picks the edge to test.
const SELFTEST = process.argv.includes('--selftest');

/** @type {Tray | null} */
let tray = null;

// One "bar" per display we show on. Each entry is independent.
// key 'displayId:edge' -> { displayId, edge, key, win, spacer, reserveActive,
//   repinMode, extent, reservedDip, spacerDepth, lastEdge, hit, ignoring }
const bars = new Map();
// Last display config pushed from a renderer (shared across windows in Phase 1).
// `edges` maps displayId -> 'top' | 'left' | 'right' | 'both'; `edge` is the
// fallback for a display that has no entry. One bar per display per edge, so a
// display set to 'both' carries two independent bars (separate tab sets).
// DESKHATCH_EDGE forces the default edge for a run, so the window geometry for
// a side bar can be exercised before the renderer lays itself out vertically.
let cfg = { mode: 'autohide', reserve: false, repin: 'event', monitors: null, barColor: '#1f6f6f', hideFs: true, edges: {}, edge: layout.normalizeEdge(process.env.DESKHATCH_EDGE || 'right') };
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
// The bar's rect on a display for a given edge. On macOS we keep inside the
// work area so we don't fight the system menu bar (or sit under the Dock);
// everywhere else we hug the physical screen edge (Fitts's-law slam target).
// `extent` is how far the window currently reaches across its thickness axis —
// it grows as drawers open.
function barRectFor(display, edge, extent) {
  return layout.barRect(display.bounds, display.workArea, edge, BAR_HEIGHT, isMac, extent);
}

// Which bars should exist: one per selected display per chosen edge, with
// 'both' expanding into a left and a right bar on that display.
function wantedBarSpecs() {
  const ids = (cfg.monitors && cfg.monitors.length) ? cfg.monitors : [screen.getPrimaryDisplay().id];
  let want = allDisplays().filter((d) => ids.includes(d.id));
  // Safety: never end up with zero bars (e.g. the chosen monitor was unplugged)
  // — fall back to the primary so the user can still reach the menu.
  if (!want.length) want = [screen.getPrimaryDisplay()];
  return layout.wantedBars(want.map((d) => d.id), cfg.edges, cfg.edge);
}

// --- window factories -------------------------------------------------------
function makeOverlay(display, edge) {
  const { x, y, width, height } = barRectFor(display, edge);
  const w = new BrowserWindow({
    x, y, width, height,
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
  // Tell the renderer which display AND which edge it is, so it can lay itself
  // out along the right axis and keep its own tab set (a display set to 'both'
  // runs two bars whose tabs are configured separately).
  w.loadFile(INDEX, { query: { d: String(display.id), edge: layout.normalizeEdge(edge), store: isStore ? '1' : '' } });
  return w;
}

function makeSpacer(display, edge) {
  const { x, y, width, height } = barRectFor(display, edge);
  const col = cfg.barColor || '#1f6f6f';
  const s = new BrowserWindow({
    x, y, width, height,
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

// --- geometry: one owner, one target rect -----------------------------------
// Every move of the bar window and of the reservation spacer goes through
// pinBar(). The target rect is a pure function of (display, edge, the OS
// reservation, entry.extent) and NEVER of the window's own current bounds.
//
// That is the whole point. The previous version derived its target with
// Math.max() against the live bounds and wrote back the spacer's own clamped
// height, so the target depended on the last thing we wrote: any stray resize
// — the OS window minimum, a DPI change, a drawer measured mid-layout — got
// locked in and could only ever grow. Re-pinning then ratcheted the strip
// wider on every tick until it covered the screen. Because the target here is
// independent of current bounds, pinBar() is idempotent: it converges in one
// write and every later call is a no-op, so a move event it provokes itself
// cannot start a loop.

const sameRect = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

// Does an OS-granted reservation look like the strip we asked for? It must sit
// on our edge of our display and be about one bar thick. `slack` absorbs
// DIP<->physical rounding on fractional-scale monitors.
function plausibleStrip(entry, dip) {
  if (!dip || !(dip.width > 0) || !(dip.height > 0)) return false;
  const want = barRectFor(displayObj(entry.displayId), entry.edge);
  const slack = 4;
  const near = (a, b) => Math.abs(a - b) <= slack;
  const depth = layout.isVertical(entry.edge) ? dip.width : dip.height;
  if (depth > BAR_HEIGHT + slack) return false;
  // Flush with the edge, and spanning it.
  if (layout.isVertical(entry.edge)) {
    return near(layout.innerEdge(dip, entry.edge), layout.innerEdge(want, entry.edge))
      && near(dip.y, want.y) && near(dip.height, want.height);
  }
  return near(layout.innerEdge(dip, entry.edge), layout.innerEdge(want, entry.edge))
    && near(dip.x, want.x) && near(dip.width, want.width);
}

// The reserved strip in DIP: the OS-granted AppBar rect converted back to this
// monitor's DIP (authoritative and DPI-correct), else the plain edge rect.
function stripDip(entry) {
  return entry.reservedDip || barRectFor(displayObj(entry.displayId), entry.edge);
}

// How deep the bar window is ever allowed to get. A bar cannot be deeper than
// the display it sits on, so no extent report — however wrong — can swallow
// the screen.
function maxExtent(entry) {
  const d = displayObj(entry.displayId);
  const r = isMac ? d.workArea : d.bounds;
  return layout.isVertical(entry.edge) ? r.width : r.height;
}

// Where the bar window belongs: the strip, grown across its thickness axis by
// however far the open drawers reach (entry.extent), clamped to the display.
function targetBarRect(entry) {
  const strip = stripDip(entry);
  const depth = Math.min(Math.max(BAR_HEIGHT, entry.extent || BAR_HEIGHT), maxExtent(entry));
  // barRect() hugs the given rect's `edge` side; the strip is already anchored
  // there and already spans the edge, so passing it in grows the bar inwards
  // from exactly the right line.
  return layout.barRect(strip, strip, entry.edge, BAR_HEIGHT, false, depth);
}

function targetSpacerRect(entry) {
  return layout.spacerRect(stripDip(entry), entry.edge, entry.spacerDepth);
}

// Windows clamps a frameless window to a minimum size (~56 physical px), so on
// some monitors the spacer cannot be as thin as the bar. Ask the OS once what
// it grants and remember it; reading it back on every pin is what let the
// depth ratchet. Capped, so a pathological answer cannot spill a huge window.
function learnSpacerDepth(entry) {
  const s = entry.spacer;
  if (!s || s.isDestroyed()) return;
  const strip = stripDip(entry);
  const thin = layout.isVertical(entry.edge) ? strip.width : strip.height;
  entry.spacerDepth = thin;
  try {
    s.setBounds(layout.spacerRect(strip, entry.edge, thin));
    const got = s.getBounds();
    const granted = layout.isVertical(entry.edge) ? got.width : got.height;
    if (granted > thin) entry.spacerDepth = Math.min(granted, thin * 2);
  } catch (_) { /* keep the un-clamped guess */ }
}

function pinBar(entry, reason) {
  if (!entry || !entry.win || entry.win.isDestroyed()) return;
  if (entry.spacer && !entry.spacer.isDestroyed()) {
    const ws = targetSpacerRect(entry);
    if (!sameRect(entry.spacer.getBounds(), ws)) entry.spacer.setBounds(ws);
  }
  const want = targetBarRect(entry);
  if (sameRect(entry.win.getBounds(), want)) return;
  if (!entry.pinLogged) {
    console.info('[appbar] pin (' + reason + ') display ' + entry.displayId + ' edge=' + entry.edge
      + ' strip=' + JSON.stringify(stripDip(entry)) + ' -> ' + JSON.stringify(want));
    entry.pinLogged = true;
  }
  entry.win.setBounds(want);
  if (entry.reserveActive) entry.win.moveTop();
}

function applyReserve(entry) {
  // Reserving the top edge uses the Windows AppBar API; there is no equivalent
  // on macOS/Linux, so the bar there is always overlay-only (no spacer).
  const reserve = cfg.mode === 'always' && cfg.reserve && process.platform === 'win32';
  entry.reserveActive = reserve;
  entry.repinMode = cfg.repin === 'poll' ? 'poll' : 'event';
  entry.pinLogged = false;
  let status = 'off';
  if (reserve) {
    if (!entry.spacer || entry.spacer.isDestroyed()) {
      entry.spacer = makeSpacer(displayObj(entry.displayId), entry.edge);
      entry.spacer.webContents.once('dom-ready', () => paintSpacer(entry));
    }
    paintSpacer(entry);
    learnSpacerDepth(entry);
    status = appbar.register(entry.spacer, { edge: entry.edge, height: BAR_HEIGHT, display: displayObj(entry.displayId) });
    // Convert the OS-granted physical rect back to THIS monitor's DIP — the
    // authoritative, DPI-correct size/position for both windows.
    const rc = appbar.getRect(entry.spacer);
    const dip = rc
      ? screen.screenToDipRect(entry.spacer, { x: rc.left, y: rc.top, width: rc.right - rc.left, height: rc.bottom - rc.top })
      : null;
    // Only trust the grant if it really is a bar-thick strip on our edge of
    // this display. Everything downstream treats reservedDip as authoritative
    // geometry, so one odd answer from the OS would move the bar somewhere it
    // does not belong — and a reservation changes the work area, which brings
    // us back here, so a wrong rect gets to compound. Fall back to the plain
    // edge rect instead; the overlay still works, it just reserves nothing.
    entry.reservedDip = plausibleStrip(entry, dip) ? dip : null;
    console.info('[appbar] display ' + entry.displayId + ' rc=' + JSON.stringify(rc)
      + ' dip=' + JSON.stringify(dip) + (entry.reservedDip ? '' : ' (rejected — using the display edge)'));
    entry.win.setAlwaysOnTop(true, 'screen-saver');
    entry.win.moveTop();
    // The reservation moved the strip, so the OS minimum may differ now.
    learnSpacerDepth(entry);
    pinBar(entry, 'init');
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

function createBar(display, edge) {
  const key = layout.barKey(display.id, edge);
  const win = makeOverlay(display, edge);
  const entry = { displayId: display.id, edge: layout.normalizeEdge(edge), key, win, spacer: null,
    reserveActive: false, repinMode: 'event', pinLogged: false, lastEdge: null,
    // How far the open drawers reach across the bar's thickness axis, in DIP.
    // The renderer owns this number (overlay:set-height); nothing else writes
    // it, so the bar's depth has exactly one source of truth.
    extent: BAR_HEIGHT, reservedDip: null, spacerDepth: BAR_HEIGHT,
    // Click pass-through, driven by the cursor watch from the renderer's reported
    // geometry. mode: 'none' (all through) | 'all' (all captured) | 'rects'.
    // Default 'none' so the desktop stays clickable until the renderer reports in.
    hit: { mode: 'none', rects: [] }, ignoring: true };
  // Under an active reservation the OS pushes our window out of the strip and
  // we push back; debounce so that exchange settles instead of running at the
  // event rate. (It can no longer grow anything — pinBar is idempotent — but
  // there is no reason to spend the wakeups.)
  win.on('move', () => {
    if (entry.repinMode !== 'event' || !entry.reserveActive) return;
    clearTimeout(entry.moveTimer);
    entry.moveTimer = setTimeout(() => pinBar(entry, 'move'), 60);
  });
  win.on('blur', () => { if (!win.isDestroyed()) win.webContents.send('overlay:blur'); });
  win.on('closed', () => { bars.delete(key); });
  win.webContents.once('did-finish-load', () => {
    const d = displayObj(display.id);
    const wb = (win && !win.isDestroyed()) ? win.getBounds() : null;
    console.info('[diag] display ' + display.id + ' edge=' + entry.edge + ' bounds=' + JSON.stringify(d.bounds)
      + ' sf=' + d.scaleFactor + ' bar=' + JSON.stringify(wb));
  });
  bars.set(key, entry);
  return entry;
}

function destroyBar(key) {
  const e = bars.get(key);
  if (!e) return;
  clearTimeout(e.moveTimer);
  if (e.spacer && !e.spacer.isDestroyed()) { appbar.unregister(e.spacer); e.spacer.close(); }
  if (e.win && !e.win.isDestroyed()) e.win.close();
  bars.delete(key);
}

// Create/destroy bars to match the wanted displays, then apply reserve to each.
function reconcile() {
  const want = wantedBarSpecs();
  const wantKeys = want.map((b) => b.key);
  for (const key of [...bars.keys()]) if (!wantKeys.includes(key)) destroyBar(key);
  for (const b of want) if (!bars.has(b.key)) createBar(displayObj(b.displayId), b.edge);
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

// --- "App-mode" Google windows (real Edge/Chrome, docked like a drawer) ------
// Launch a Google service as a borderless `--app=` window in the user's real
// browser (so sign-in works and their session is reused), then dock it under
// the bar and let updateNyoki() tuck it on blur — same feel as an embedded
// drawer, without Google's embedded-webview block. Falls back to a normal
// browser tab when no Chromium browser is found or off Windows.
const appWins = new Map(); // url -> hwnd of the window we last opened for it

function dockUnderBar(hwnd, anchorX) {
  winmgr.restore(hwnd); // un-minimize so geometry is real
  const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = disp.workArea;
  const cur = winmgr.getRect(hwnd);
  const w = (cur && cur.w) ? Math.min(cur.w, wa.width) : Math.min(820, wa.width - 60);
  const h = (cur && cur.h) ? Math.min(cur.h, wa.height - (BAR_HEIGHT + 12)) : Math.min(700, wa.height - (BAR_HEIGHT + 60));
  let x = (typeof anchorX === 'number') ? anchorX : Math.round(wa.x + (wa.width - w) / 2);
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - w)); // clamp on-screen
  winmgr.move(hwnd, { x, y: wa.y + BAR_HEIGHT + 2, w, h });
  winmgr.front(hwnd);
  nyoki = { hwnd, pid: (winmgr.listWindows().find((v) => v.hwnd === hwnd) || {}).pid || 0, since: Date.now() };
}

// Poll for the window that appeared after we spawned the browser (it belongs to
// the browser process, not our child, so we diff the window list by hwnd).
function dockNewWindow(url, beforeSet, anchorX, attempt) {
  attempt = attempt || 0;
  if (attempt > 28) return; // ~7s give-up
  const fresh = winmgr.listWindows().find((w) => w.pid !== process.pid && !beforeSet.has(w.hwnd));
  if (!fresh) { setTimeout(() => dockNewWindow(url, beforeSet, anchorX, attempt + 1), 250); return; }
  appWins.set(url, fresh.hwnd);
  dockUnderBar(fresh.hwnd, anchorX);
}

async function openAppWindow(url, anchorX) {
  if (!/^https?:\/\//i.test(url || '')) return { ok: false };
  if (process.platform !== 'win32') { await system.openUrl(url); return { ok: true, docked: false }; }
  // Re-click: if the window we opened before is still alive, just re-dock it
  // (toggle/raise) instead of spawning a second one.
  const prev = appWins.get(url);
  if (prev && winmgr.listWindows().some((w) => w.hwnd === prev)) { dockUnderBar(prev, anchorX); return { ok: true, docked: true, reused: true }; }
  if (prev) appWins.delete(url);
  const exe = await system.appBrowserExe();
  if (!exe) { await system.openUrl(url); return { ok: true, docked: false }; } // no Chromium browser
  const before = new Set(winmgr.listWindows().map((w) => w.hwnd));
  try {
    const child = spawn(exe, ['--app=' + url], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (_) { await system.openUrl(url); return { ok: true, docked: false }; }
  dockNewWindow(url, before, anchorX, 0);
  return { ok: true, docked: true };
}
ipcMain.handle('appwin:open', (e, url, clientX) => {
  let anchorX;
  try {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w && typeof clientX === 'number') anchorX = Math.round(w.getBounds().x + clientX);
  } catch (_) {}
  return openAppWindow(url, anchorX);
});

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
      if (e.reserveActive) pinBar(e, 'poll'); // keep the strip put (robust on multi-monitor)
      // Is the cursor slammed into THIS bar's edge of THIS display? atEdge()
      // requires the cursor to be on the display first, so a bar never answers
      // for a cursor that is really on the neighbouring screen.
      const rect = barRectFor(dd, e.edge);
      const probe = isMac ? dd.workArea : dd.bounds;
      const hit = layout.atEdge(p, probe, e.edge, 2) || layout.atEdge(p, rect, e.edge, 2);
      if (e.lastEdge !== hit) { e.lastEdge = hit; e.win.webContents.send('overlay:edge', hit); }
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

// The renderer reports how far the open drawers reach across the bar's
// thickness axis; the window grows to match so the desktop stays clickable
// everywhere else. For a vertical bar that is a WIDTH, and a right-edge bar
// also has to move left as it widens to keep its right edge on the screen edge.
ipcMain.on('overlay:set-height', (e, extent) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.isDestroyed()) return;
  const entry = [...bars.values()].find((b) => b.win === w);
  if (!entry) return;
  // Record the renderer's measurement and let pinBar() place the window. The
  // value is clamped to the display here, at the one place it enters the main
  // process, so nothing downstream has to defend against a runaway number.
  const n = Math.ceil(Number(extent));
  entry.extent = Number.isFinite(n) ? Math.max(BAR_HEIGHT, Math.min(n, maxExtent(entry))) : BAR_HEIGHT;
  pinBar(entry, 'extent');
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
    // Per-display edge choice. Kept separate from `monitors` because a display
    // set to 'both' produces two bars from one entry.
    edges: (d && d.edges && typeof d.edges === 'object') ? d.edges : {},
    edge: layout.normalizeEdge(d && d.edge ? d.edge : cfg.edge),
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
    // Re-pin every bar to its (possibly moved or resized) display. This used to
    // force EVERY bar to the display's top edge at the display's full width,
    // which stretched a side bar right across the screen on any metrics change
    // — and a reservation changes the work area, so it fired at startup.
    for (const e of bars.values()) {
      e.reservedDip = null; // the previous reservation rect is stale now
      pinBar(e, 'display');
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
  cfg = { mode: 'always', reserve: true, repin: 'event', monitors: allDisplays().map((d) => d.id),
    barColor: '#1f6f6f', hideFs: true, edges: {},
    edge: layout.normalizeEdge(process.env.DESKHATCH_EDGE || 'right') };
  reconcile();
  startEdgeWatch(); // keep pinBar correcting the OS's post-reservation push
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
      // Inner edges must coincide exactly: any surplus from the OS window
      // minimum belongs OFF the screen, not inwards over the desktop.
      const si = layout.innerEdge(sb, e.edge);
      const bi = layout.innerEdge(wb, e.edge);
      // ...and an idle bar must be exactly one bar thick, never creeping.
      const depth = layout.isVertical(e.edge) ? wb.width : wb.height;
      const pass = si === bi && depth <= BAR_HEIGHT;
      if (!pass) allPass = false;
      console.info('[selftest] display ' + e.displayId + ' edge=' + e.edge + ' sf=' + d.scaleFactor + ' ' + (pass ? 'PASS' : 'FAIL') +
        ' spacerInner=' + si + ' barInner=' + bi + ' depth=' + depth + '/' + BAR_HEIGHT +
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
  localapp.setup();
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
