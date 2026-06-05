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
const path = require('path');

const DEFAULT_PARTITION = 'persist:smartsuite';
// Match Electron's real Chromium version so Google's sign-in is less likely to
// flag us as an unsupported browser.
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/' + process.versions.chrome + ' Safari/537.36';

const DISGUISE_PRELOAD = path.join(__dirname, '..', 'preload', 'disguise.js');
const hinted = new Set(); // partitions whose Client-Hints headers we've patched

// A plain-Chrome Sec-CH-UA so the "Electron" brand never reaches Google's
// servers. Mirrors what the disguise preload reports on the client side.
const CH_MAJOR = process.versions.chrome.split('.')[0];
const SEC_CH_UA =
  '"Chromium";v="' + CH_MAJOR + '", "Google Chrome";v="' + CH_MAJOR + '", "Not-A.Brand";v="99"';
const SEC_CH_UA_FULL =
  '"Chromium";v="' + process.versions.chrome + '", "Google Chrome";v="' +
  process.versions.chrome + '", "Not-A.Brand";v="99.0.0.0"';

const loginWins = new Map(); // partition -> BrowserWindow

function ensureSession(partition) {
  const p = partition || DEFAULT_PARTITION;
  try {
    const ses = session.fromPartition(p);
    ses.setUserAgent(CHROME_UA);
    if (!hinted.has(p)) {
      hinted.add(p);
      // Strip the "Electron" brand out of the User-Agent Client Hints headers.
      ses.webRequest.onBeforeSendHeaders((details, cb) => {
        const h = details.requestHeaders;
        for (const k of Object.keys(h)) {
          const lk = k.toLowerCase();
          if (lk === 'sec-ch-ua') h[k] = SEC_CH_UA;
          else if (lk === 'sec-ch-ua-full-version-list') h[k] = SEC_CH_UA_FULL;
        }
        cb({ requestHeaders: h });
      });
    }
  } catch (_) { /* set later */ }
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
    webPreferences: {
      partition: p,
      // contextIsolation must be off so the disguise preload can patch the
      // page's own navigator before Google's scripts read it. This window only
      // ever loads accounts.google.com.
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      preload: DISGUISE_PRELOAD,
    },
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
