'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const appbar = require('./appbar');
const files = require('./files');
const auth = require('./auth');

const BAR_HEIGHT = 44; // collapsed strip height (px)

/** @type {BrowserWindow | null} */
let win = null;
/** @type {Tray | null} */
let tray = null;

function createWindow() {
  const display = screen.getPrimaryDisplay();
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
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Start fully click-through; the renderer turns capture on only while the
  // pointer is actually over the bar or an open drawer (see preload/renderer).
  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.on('closed', () => {
    win = null;
  });

  // Best-effort Windows AppBar registration (reserves the top edge so maximized
  // windows don't sit underneath). OFF by default: it leaks its reservation if
  // the app is killed abruptly (e.g. Ctrl+C during dev), which pushes the bar
  // down on later launches. Opt in with SMARTSUITE_APPBAR=1 once it's solid.
  win.webContents.once('did-finish-load', () => {
    if (process.env.SMARTSUITE_APPBAR === '1') {
      appbar.register(win, { edge: 'top', height: BAR_HEIGHT });
    }
  });
}

function toggleWindow() {
  if (!win) return createWindow();
  if (win.isVisible()) win.hide();
  else win.show();
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

ipcMain.on('overlay:set-height', (_e, height) => {
  if (!win) return;
  const b = win.getBounds();
  const h = Math.max(BAR_HEIGHT, Math.ceil(height) || BAR_HEIGHT);
  if (b.height !== h) win.setBounds({ x: b.x, y: b.y, width: b.width, height: h });
});

// --- App lifecycle ----------------------------------------------------------

files.register(() => win);
auth.register();

app.whenReady().then(() => {
  auth.setup();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Stay resident in the tray when the overlay is hidden.
app.on('window-all-closed', () => {
  // intentionally do not quit; the app lives in the tray
});

app.on('before-quit', () => {
  if (win) appbar.unregister(win);
});

// Also release the AppBar reservation on abrupt termination (Ctrl+C, kill) so
// it can't leak and push the bar down next time.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    if (win) appbar.unregister(win);
    app.quit();
    process.exit(0);
  });
}
