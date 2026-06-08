'use strict';

// Update strategy differs by OS, because macOS auto-update (Squirrel.Mac)
// refuses to apply updates to an app that isn't code-signed + notarized, which
// we don't pay for:
//   - Windows: full silent auto-update via electron-updater (works unsigned).
//   - macOS / other: just CHECK GitHub Releases and offer to open the download
//     page — no silent install, but free and signature-free.
// Everything is a no-op in dev (unpackaged) so `npm start` never nags or hits
// the network.

const { app, dialog, shell, net } = require('electron');

const OWNER = 'kiwiman0706-beep';
const REPO = 'smartsuite.next';

// --- Windows: electron-updater (download in the background, prompt to apply) --
function initWindowsAutoUpdate() {
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); }
  catch (_) { return; } // dependency not bundled (e.g. older build) — skip quietly
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (e) => console.warn('[update] ' + (e && e.message)));
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['今すぐ再起動して更新', '後で'],
      defaultId: 0, cancelId: 1,
      title: 'アップデート',
      message: '新しいバージョン ' + info.version + ' を準備しました。',
      detail: '再起動すると更新が適用されます（後で終了する際にも適用されます）。',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.checkForUpdates().catch(() => {});
}

// --- macOS / other: lightweight "there's a newer release" notice -------------
// True if version `b` is greater than `a` ("1.2.3" style; missing parts = 0).
function isNewer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pb[i] || 0) > (pa[i] || 0)) return true;
    if ((pb[i] || 0) < (pa[i] || 0)) return false;
  }
  return false;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, redirect: 'follow' });
    req.setHeader('User-Agent', 'DeskHatch-Updater');
    req.setHeader('Accept', 'application/vnd.github+json');
    req.on('response', (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function checkAndNotify() {
  try {
    const rel = await fetchJson('https://api.github.com/repos/' + OWNER + '/' + REPO + '/releases/latest');
    const latest = String(rel.tag_name || '').replace(/^v/, '');
    if (!latest || !isNewer(app.getVersion(), latest)) return;
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['ダウンロード', '後で'],
      defaultId: 0, cancelId: 1,
      title: 'アップデート',
      message: '新しいバージョン ' + latest + ' があります。',
      detail: '現在のバージョン: ' + app.getVersion(),
    });
    if (response === 0) {
      shell.openExternal(rel.html_url || ('https://github.com/' + OWNER + '/' + REPO + '/releases/latest'));
    }
  } catch (_) { /* offline / rate-limited — ignore */ }
}

function init() {
  if (!app.isPackaged) return; // dev build: never nag or hit the network
  if (process.platform === 'win32') initWindowsAutoUpdate();
  else checkAndNotify();
}

module.exports = { init };
