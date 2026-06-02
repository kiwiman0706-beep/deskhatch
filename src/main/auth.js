'use strict';

// Login helper for the embedded-pages approach.
//
// Google blocks sign-in inside "embedded" browsers ("this browser may not be
// secure") when it detects Electron's default user-agent. We sidestep that by:
//   1. giving the shared `persist:smartsuite` session a normal desktop Chrome UA
//      (so the login page treats us as a regular browser), and
//   2. doing the sign-in in a dedicated, framed window on that same session, so
//      every drawer (Gmail/Calendar/Tasks/Keep/Contacts) shares the cookies.
//
// Per-webview `useragent` attributes (e.g. the mobile UA for content pages)
// still override this default, so content keeps its mobile layout.

const { ipcMain, session, BrowserWindow } = require('electron');

const PARTITION = 'persist:smartsuite';
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let loginWin = null;

const ses = () => session.fromPartition(PARTITION);

function setup() {
  try { ses().setUserAgent(CHROME_UA); } catch (_) { /* set later if needed */ }
}

function openLogin() {
  if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return; }
  loginWin = new BrowserWindow({
    width: 480,
    height: 660,
    title: 'Google にログイン',
    autoHideMenuBar: true,
    webPreferences: { partition: PARTITION },
  });
  loginWin.loadURL('https://accounts.google.com/');
  loginWin.on('closed', () => { loginWin = null; });
}

function register() {
  ipcMain.handle('auth:login', () => { openLogin(); return true; });
  ipcMain.handle('auth:logout', async () => { await ses().clearStorageData(); return true; });
}

module.exports = { setup, register, openLogin, PARTITION, CHROME_UA };
