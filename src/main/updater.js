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
const fs = require('fs');
const path = require('path');

const isJa = () => { try { return app.getLocale().toLowerCase().startsWith('ja'); } catch (_) { return false; } };
const OWNER = 'kiwiman0706-beep';
const REPO = 'deskhatch';

// --- Update channel (stable | beta) -----------------------------------------
// Default users stay on STABLE: betas are published as GitHub "prerelease"
// releases with a -beta tag, which electron-updater ignores unless prereleases
// are allowed, and which GitHub's /releases/latest (the macOS path) excludes.
// Opting in flips allowPrerelease/channel so this machine also gets betas.
function chanFile() { return path.join(app.getPath('userData'), 'channel.json'); }
function getBeta() { try { return JSON.parse(fs.readFileSync(chanFile(), 'utf8')).beta === true; } catch (_) { return false; } }
function applyChannel(au) {
  const b = getBeta();
  try { au.allowPrerelease = b; au.channel = b ? 'beta' : 'latest'; } catch (_) {}
}
function setBeta(on) {
  try { fs.writeFileSync(chanFile(), JSON.stringify({ beta: !!on })); } catch (_) {}
  if (autoUpdater) applyChannel(autoUpdater);
  init(); // re-check on the newly selected channel (no-op in dev)
}

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
  applyChannel(autoUpdater);
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
// Semver-ish compare that understands -beta tags: 1.2.3 > 1.2.3-beta.2 >
// 1.2.3-beta.1. Returns true when `cand` is strictly newer than `cur`.
function parseV(v) {
  const s = String(v || '').replace(/^v/, '');
  const dash = s.indexOf('-');
  const core = dash >= 0 ? s.slice(0, dash) : s;
  const pre = dash >= 0 ? s.slice(dash + 1) : '';
  return { nums: core.split('.').map((n) => parseInt(n, 10) || 0), pre };
}
function isNewer(cur, cand) {
  const a = parseV(cur), b = parseV(cand);
  for (let i = 0; i < 3; i++) { const x = a.nums[i] || 0, y = b.nums[i] || 0; if (y > x) return true; if (y < x) return false; }
  if (a.pre && !b.pre) return true;   // a stable release beats our prerelease
  if (!a.pre && b.pre) return false;  // a prerelease is older than our stable
  if (a.pre && b.pre) return b.pre.localeCompare(a.pre, undefined, { numeric: true }) > 0;
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

async function latestRelease(beta) {
  const base = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/releases';
  if (!beta) return fetchJson(base + '/latest'); // excludes prereleases
  const list = await fetchJson(base + '?per_page=15');
  return Array.isArray(list) ? list.find((r) => r && !r.draft) : null; // newest incl. prerelease
}

async function checkAndNotify(isManual) {
  const ja = isJa();
  try {
    const rel = await latestRelease(getBeta());
    const latest = String((rel && rel.tag_name) || '').replace(/^v/, '');
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

// Silent auto-update applies to Windows x64 only. The Windows ARM64 build is a
// secondary artifact with no entry in the (x64) update feed, so it would
// otherwise auto-download the x64 installer; route it to the notify-only path
// instead, like macOS, so ARM users grab the ARM installer manually.
const winAuto = () => process.platform === 'win32' && process.arch !== 'arm64';

// Startup check (silent on Windows x64 / notify-only on mac + Windows ARM). No-op in dev.
function init() {
  if (!app.isPackaged) return;
  if (winAuto()) { const au = ensureWin(); if (au) au.checkForUpdates().catch(() => {}); }
  else checkAndNotify(false);
}

// Manual "Check for updates" (from the tray). Works in dev too, with feedback.
function checkNow() {
  if (winAuto()) {
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

module.exports = { init, checkNow, getBeta, setBeta };
