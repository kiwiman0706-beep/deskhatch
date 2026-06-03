'use strict';

// Login helper for the embedded-pages approach, with multi-account support.
//
// Each account gets its OWN session partition (its own cookie jar), so two
// Gmail/Calendar/etc. accounts can be open side by side without interfering.
// The "default" account keeps using `persist:smartsuite` so existing logins
// survive; extra accounts use `persist:acct-<id>`.
//
// Google blocks sign-in inside "embedded" browsers when it detects Electron's
// default user-agent, so every partition is given a normal desktop Chrome UA,
// and sign-in happens in a dedicated framed window on that same partition.

const { ipcMain, session, BrowserWindow } = require('electron');

const DEFAULT_PARTITION = 'persist:smartsuite';
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const loginWins = new Map(); // partition -> BrowserWindow

function ensureSession(partition) {
  const p = partition || DEFAULT_PARTITION;
  try { session.fromPartition(p).setUserAgent(CHROME_UA); } catch (_) { /* set later */ }
  return p;
}

function setup() { ensureSession(DEFAULT_PARTITION); }

function openLogin(partition) {
  const p = ensureSession(partition);
  const existing = loginWins.get(p);
  if (existing && !existing.isDestroyed()) { existing.focus(); return; }
  const w = new BrowserWindow({
    width: 480,
    height: 660,
    title: 'Google にログイン',
    autoHideMenuBar: true,
    webPreferences: { partition: p },
  });
  w.loadURL('https://accounts.google.com/');
  w.on('closed', () => loginWins.delete(p));
  loginWins.set(p, w);
}

function register() {
  ipcMain.handle('auth:login', (_e, partition) => { openLogin(partition); return true; });
  ipcMain.handle('auth:logout', async (_e, partition) => {
    await session.fromPartition(partition || DEFAULT_PARTITION).clearStorageData();
    return true;
  });
  ipcMain.on('auth:ensure', (_e, partition) => { ensureSession(partition); });
}

module.exports = { setup, register, openLogin, ensureSession, DEFAULT_PARTITION, CHROME_UA };
