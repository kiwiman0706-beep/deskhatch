'use strict';

// Update strategy differs by OS, because macOS auto-update (Squirrel.Mac)
// refuses to apply updates to an app that isn't code-signed + notarized, which
// we don't pay for:
//   - Windows: full silent auto-update via electron-updater (works unsigned).
//   - macOS / other: just CHECK GitHub Releases and offer to open the download
//     page — no silent install, but free and signature-free.
// init() runs once at startup (no-op when unpackaged). checkNow() is the manual
// "Check for updates" action (from the tray) and gives explicit feedback,
// including a "you're on the latest version" dialog.

const { app, dialog, shell, net } = require('electron');

const isJa = () => { try { return app.getLocale().toLowerCase().startsWith('ja'); } catch (_) { return false; } };
const OWNER = 'kiwiman0706-beep';
const REPO = 'deskhatch';

function box(opts) { try { return dialog.showMessageBox(opts); } catch (_) { return Promise.resolve({ response: 1 }); } }

// --- Windows: electron-updater ----------------------------------------------
let autoUpdater = null;
let manual = false;        // true while a user-triggered check is in flight
let auWired = false;

function ensureWin() {
  if (autoUpdater) return autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); }
  catch (_) { autoUpdater = null; return null; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Differential (blockmap) downloads fire many HTTP range requests and are
  // flaky behind some CDNs/proxies — they can stall with zero progress (the
  // "downloading…" hang). Force a plain full download of the installer, which
  // is slower but reliable.
  try { autoUpdater.disableDifferentialDownload = true; } catch (_) {}
  // We ship UNSIGNED (no paid Authenticode cert), so electron-updater's Windows
  // signature check rejects every update ("not signed by the application owner").
  // Skip that check — the package is still fetched over HTTPS from GitHub Releases.
  try { autoUpdater.verifyUpdateCodeSignature = () => Promise.resolve(null); } catch (_) {}
  if (!auWired) {
    auWired = true;
    autoUpdater.on('error', (e) => {
      console.warn('[update] ' + (e && e.message));
      if (manual) { manual = false; const ja = isJa();
        box({ type: 'warning', buttons: ['OK'], title: ja ? 'アップデート' : 'Update',
          message: ja ? '更新に失敗しました。' : 'Update failed.',
          detail: ((e && e.message) || '') + (ja ? '\n\n※ ポータブル版は自動更新できません。インストーラ版（Setup）をご利用ください。' : '\n\nNote: the portable build cannot auto-update — use the Setup installer.') }); }
    });
    autoUpdater.on('update-available', (info) => {
      // Keep `manual` set here: the download is still in flight, so a later
      // download error must still surface — otherwise the user is left staring
      // at "downloading…" with nothing happening.
      if (manual) { const ja = isJa();
        box({ type: 'info', buttons: ['OK'], title: ja ? 'アップデート' : 'Update',
          message: ja ? ('新しいバージョン ' + info.version + ' をダウンロード中…') : ('Downloading version ' + info.version + '…'),
          detail: ja ? '数十MBあるため少し時間がかかります。完了したら再起動を促します。' : "It's ~100MB, so this may take a minute. You'll be prompted to restart when it's ready." }); }
    });
    autoUpdater.on('download-progress', (p) => { try { console.log('[update] ' + Math.round((p && p.percent) || 0) + '%'); } catch (_) {} });
    autoUpdater.on('update-not-available', () => {
      if (manual) { manual = false; const ja = isJa();
        box({ type: 'info', buttons: ['OK'], title: ja ? 'アップデート' : 'Update',
          message: ja ? 'お使いのバージョンが最新です。' : "You're on the latest version.",
          detail: 'DeskHatch v' + app.getVersion() }); }
    });
    autoUpdater.on('update-downloaded', async (info) => {
      manual = false;
      const ja = isJa();
      const { response } = await box({
        type: 'info',
        buttons: [ja ? '今すぐ再起動して更新' : 'Restart & update now', ja ? '後で' : 'Later'],
        defaultId: 0, cancelId: 1,
        title: ja ? 'アップデート' : 'Update',
        message: ja ? ('新しいバージョン ' + info.version + ' を準備しました。') : ('Version ' + info.version + ' is ready.'),
        detail: ja ? '再起動すると更新が適用されます（後で終了する際にも適用されます）。' : 'It will be applied on restart (or next time you quit).',
      });
      if (response === 0) autoUpdater.quitAndInstall();
    });
  }
  return autoUpdater;
}

// --- macOS / other: lightweight "there's a newer release" notice -------------
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

async function checkAndNotify(isManual) {
  const ja = isJa();
  try {
    const rel = await fetchJson('https://api.github.com/repos/' + OWNER + '/' + REPO + '/releases/latest');
    const latest = String(rel.tag_name || '').replace(/^v/, '');
    if (latest && isNewer(app.getVersion(), latest)) {
      const { response } = await box({
        type: 'info',
        buttons: [ja ? 'ダウンロード' : 'Download', ja ? '後で' : 'Later'],
        defaultId: 0, cancelId: 1,
        title: ja ? 'アップデート' : 'Update',
        message: ja ? ('新しいバージョン ' + latest + ' があります。') : ('Version ' + latest + ' is available.'),
        detail: (ja ? '現在のバージョン: ' : 'Current version: ') + app.getVersion(),
      });
      if (response === 0) shell.openExternal(rel.html_url || ('https://github.com/' + OWNER + '/' + REPO + '/releases/latest'));
    } else if (isManual) {
      box({ type: 'info', buttons: ['OK'], title: ja ? 'アップデート' : 'Update',
        message: ja ? 'お使いのバージョンが最新です。' : "You're on the latest version.",
        detail: 'DeskHatch v' + app.getVersion() });
    }
  } catch (e) {
    if (isManual) box({ type: 'warning', buttons: ['OK'], title: ja ? 'アップデート' : 'Update',
      message: ja ? '更新の確認に失敗しました（ネットワーク？）。' : 'Could not check for updates (network?).' });
  }
}

// Startup check (silent on Windows / notify-only on mac). No-op in dev.
function init() {
  if (!app.isPackaged) return;
  if (process.platform === 'win32') { const au = ensureWin(); if (au) au.checkForUpdates().catch(() => {}); }
  else checkAndNotify(false);
}

// Manual "Check for updates" (from the tray). Works in dev too, with feedback.
function checkNow() {
  if (process.platform === 'win32') {
    if (!app.isPackaged) {
      const ja = isJa();
      box({ type: 'info', buttons: ['OK'], title: ja ? 'アップデート' : 'Update',
        message: ja ? '開発ビルドでは自動更新は無効です。' : 'Auto-update is disabled in dev builds.' });
      return;
    }
    const au = ensureWin();
    if (!au) return;
    manual = true;
    au.checkForUpdates().catch(() => { /* error event handles UI */ });
  } else {
    checkAndNotify(true);
  }
}

module.exports = { init, checkNow };
