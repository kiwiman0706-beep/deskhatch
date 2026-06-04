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

/** @type {BrowserWindow | null} */
let win = null;
/** @type {Tray | null} */
let tray = null;

let targetDisplayId = null; // null = primary; otherwise a specific monitor
function getTargetDisplay() {
  if (targetDisplayId != null) {
    const found = screen.getAllDisplays().find((dp) => dp.id === targetDisplayId);
    if (found) return found;
  }
  return screen.getPrimaryDisplay();
}

function createWindow() {
  const display = getTargetDisplay();
  // Pin to the monitor's true top-left (display.bounds), NOT workArea — workArea
  // is shrunk by the taskbar and by any (possibly leaked) AppBar reservations,
  // which would push the bar down from the top edge.
  const { x, y, width } = display.bounds;

  win = new BrowserWindow({
    x,
    y,
    width,
    height: BAR_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    // Keep the window above normal windows but below screen savers.
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      backgroundThrottling: false, // keep painting even when occluded/hidden
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Start fully click-through; the renderer turns capture on only while the
  // pointer is actually over the bar or an open drawer (see preload/renderer).
  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.webContents.once('did-finish-load', () => {
    const b = win.getBounds();
    const d = screen.getPrimaryDisplay();
    console.info('[diag] win=' + JSON.stringify(b) + ' bounds=' + JSON.stringify(d.bounds) +
      ' workArea=' + JSON.stringify(d.workArea) + ' sf=' + d.scaleFactor);
  });

  win.on('closed', () => {
    win = null;
  });

  // Event-driven re-pin: when Windows displaces the bar, it fires 'move'.
  win.on('move', () => { if (repinMode === 'event') rePinBoth('move'); });

  // The renderer pushes the saved display mode after load (see 'display:set'),
  // which decides whether to reserve the top edge via the AppBar.
}

function toggleWindow() {
  if (!win) return createWindow();
  if (win.isVisible()) win.hide();
  else win.show();
}

// A small NON-transparent "spacer" window dedicated to the AppBar reservation.
// (A transparent/layered window's reservation isn't honored by Windows.) It sits
// behind the real, transparent bar, so the visible bar and drawers stay
// transparent (no opaque fill) while the spacer holds the reserved top strip.
let spacerWin = null;
function createSpacer() {
  if (spacerWin && !spacerWin.isDestroyed()) return spacerWin;
  const d = getTargetDisplay().bounds;
  spacerWin = new BrowserWindow({
    x: d.x, y: d.y, width: d.width, height: BAR_HEIGHT,
    frame: false, transparent: false, backgroundColor: '#1f6f6f',
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, focusable: false, hasShadow: false,
    alwaysOnTop: true, webPreferences: { backgroundThrottling: false },
  });
  spacerWin.setAlwaysOnTop(true, 'floating');
  spacerWin.setIgnoreMouseEvents(true); // never interactive; real bar is on top
  spacerWin.loadURL('data:text/html,<body style="margin:0;background:%231f6f6f"></body>');
  spacerWin.on('closed', () => { spacerWin = null; });
  spacerWin.on('move', () => { if (repinMode === 'event') rePinBoth('spacer-move'); });
  return spacerWin;
}
function destroySpacer() {
  if (spacerWin && !spacerWin.isDestroyed()) {
    appbar.unregister(spacerWin);
    spacerWin.close();
  }
  spacerWin = null;
}

// Watch the global cursor so the bar can reveal at the top edge even over a
// maximized window (DOM hover on the thin transparent strip is unreliable there).
let edgeTimer = null;
let reserveActive = false;
let rePinnedOnce = false;
let repinMode = 'event'; // 'event' (move/display listeners) | 'poll' (timer)
let pinning = false;     // guard so our own setBounds doesn't re-trigger

// Pin the spacer + the real bar back to the very top of the display. Windows
// displaces an AppBar window below its reservation, and (unlike a native appbar)
// we can't answer ABN_POSCHANGED, so we re-assert our position here.
function rePinBoth(reason) {
  if (!reserveActive || pinning || !win || win.isDestroyed()) return;
  const d = getTargetDisplay().bounds;
  pinning = true;
  try {
    if (spacerWin && !spacerWin.isDestroyed()) {
      const sb = spacerWin.getBounds();
      if (sb.x !== d.x || sb.y !== d.y) spacerWin.setBounds({ x: d.x, y: d.y, width: sb.width, height: sb.height });
    }
    const wb = win.getBounds();
    if (wb.x !== d.x || wb.y !== d.y) {
      if (!rePinnedOnce) { console.info('[appbar] re-pin (' + reason + ') from ' + JSON.stringify(wb) + ' to top'); rePinnedOnce = true; }
      win.setBounds({ x: d.x, y: d.y, width: wb.width, height: wb.height });
      win.moveTop();
    }
  } finally { pinning = false; }
}

function startEdgeWatch() {
  if (edgeTimer) return;
  let last = null;
  edgeTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const d = getTargetDisplay().bounds;

    if (reserveActive && repinMode === 'poll') rePinBoth('poll');

    const p = screen.getCursorScreenPoint();
    const atTop = p.y <= d.y + 2 && p.x >= d.x && p.x < d.x + d.width;
    if (atTop !== last) { last = atTop; win.webContents.send('overlay:edge', atTop); }
  }, 120);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('SmartSuite.next');
  const menu = Menu.buildFromTemplate([
    { label: '表示 / 非表示', click: toggleWindow },
    { label: 'Google にログイン', click: () => auth.openLogin() },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleWindow);
}

// --- IPC: renderer drives mouse pass-through and window height -------------

ipcMain.on('overlay:set-ignore-mouse', (_e, ignore) => {
  if (win) win.setIgnoreMouseEvents(!!ignore, { forward: true });
});

ipcMain.on('app:quit', () => app.quit());

ipcMain.on('overlay:raise', () => {
  if (win && !win.isDestroyed()) { win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop(); }
});

// Reserve the top edge (so maximized windows don't overlap the bar) only when
// the user picks "常に表示 + 領域を予約". Otherwise release it.
ipcMain.handle('overlay:get-displays', () => {
  const prim = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((dp, i) => ({
    id: dp.id, label: 'モニタ' + (i + 1) + (dp.id === prim ? '（主）' : ''),
  }));
});

ipcMain.on('display:set', (_e, d) => {
  if (!win) return;

  // Target monitor: move the bar (and a fresh-width window) to the chosen display.
  targetDisplayId = (d && typeof d.monitor === 'number') ? d.monitor : null;
  const tb = getTargetDisplay().bounds;
  win.setBounds({ x: tb.x, y: tb.y, width: tb.width, height: win.getBounds().height });

  const wantReserve = !!(d && d.mode === 'always' && d.reserve);
  reserveActive = wantReserve;
  repinMode = (d && d.repin === 'poll') ? 'poll' : 'event';
  rePinnedOnce = false;
  let status = 'off';
  if (wantReserve) {
    const sp = createSpacer();
    sp.setBounds({ x: tb.x, y: tb.y, width: tb.width, height: BAR_HEIGHT }); // on the target display
    status = appbar.register(sp, { edge: 'top', height: BAR_HEIGHT });
    win.setAlwaysOnTop(true, 'screen-saver'); // keep the real bar above the spacer
    win.moveTop();
    rePinBoth('init');
  } else {
    destroySpacer();
  }
  console.info('[appbar] display:set reserve=' + wantReserve + ' status=' + status);
  if (!win.isDestroyed()) win.webContents.send('display:reserve-status', status, wantReserve);
});

ipcMain.on('overlay:set-height', (_e, height) => {
  if (!win) return;
  const b = win.getBounds();
  const h = Math.max(BAR_HEIGHT, Math.ceil(height) || BAR_HEIGHT);
  if (b.height !== h) win.setBounds({ x: b.x, y: b.y, width: b.width, height: h });
});

// --- App lifecycle ----------------------------------------------------------

files.register(() => win);
auth.register();
system.register();
camera.register();
fileserver.register();

app.whenReady().then(() => {
  auth.setup();
  createWindow();
  createTray();
  startEdgeWatch();
  screen.on('display-metrics-changed', () => { if (repinMode === 'event') rePinBoth('metrics'); });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Stay resident in the tray when the overlay is hidden.
app.on('window-all-closed', () => {
  // intentionally do not quit; the app lives in the tray
});

app.on('before-quit', () => {
  destroySpacer();
});

// Also release the AppBar reservation on abrupt termination (Ctrl+C, kill) so
// it can't leak and push the bar down next time.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    destroySpacer();
    app.quit();
    process.exit(0);
  });
}
