'use strict';

// In-app updater for macOS, for builds that are not code-signed + notarized.
//
// Squirrel.Mac (what electron-updater drives on macOS) refuses to apply an
// update unless the app is signed and notarized, so the macOS path used to stop
// at "here's the download page" and hand the user off to a browser. That is the
// one thing we must not do: a browser attaches `com.apple.quarantine` to the
// download, and a quarantined unsigned app is exactly what macOS blocks — or
// deletes as malware (see docs/MACOS-INSTALL.md).
//
// Nothing about that check is triggered by *our* fetching the release: the
// quarantine attribute is set by the downloading app through LaunchServices,
// and a plain file written by net.request never gets one. So this module does
// what scripts/install-mac.sh does, from inside the running app: fetch the
// universal .zip, unpack it, ad-hoc sign it, swap it into place and relaunch.

const { app, net } = require('electron');
const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// /Applications/DeskHatch.app/Contents/MacOS/DeskHatch -> /Applications/DeskHatch.app
function currentAppPath() {
  return path.resolve(app.getPath('exe'), '..', '..', '..');
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || '').trim()));
      else resolve(stdout);
    });
  });
}

// `codesign` is part of the Xcode Command Line Tools, and on a Mac without them
// /usr/bin/codesign is a shim that pops the "install developer tools?" dialog.
// Check first so we never spring that on someone mid-update.
function hasCodesign() {
  try { execFileSync('/usr/bin/xcode-select', ['-p'], { stdio: 'ignore' }); return true; }
  catch (_) { return false; }
}

// The universal .zip rather than the .dmg: nothing to mount, and `ditto -x -k`
// preserves the symlinks and extended attributes an .app bundle needs (plain
// unzip does not).
function pickAsset(rel) {
  const assets = (rel && rel.assets) || [];
  return assets.find((a) => /-universal\.zip$/.test(a.name || '')) || null;
}

function download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, redirect: 'follow' });
    req.setHeader('User-Agent', 'DeskHatch-Updater');
    req.on('response', (res) => {
      if (res.statusCode >= 400) { reject(new Error('HTTP ' + res.statusCode)); return; }
      const total = parseInt(res.headers['content-length'], 10) || 0;
      let got = 0;
      const out = fs.createWriteStream(dest);
      res.on('data', (chunk) => {
        got += chunk.length;
        out.write(chunk);
        if (onProgress && total) onProgress(got / total);
      });
      res.on('end', () => out.end(() => resolve(got)));
      res.on('error', reject);
      out.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function bundleVersion(appPath) {
  try {
    const plist = fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'), 'utf8');
    const m = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
    return m ? m[1] : '';
  } catch (_) { return ''; }
}

// Fetch + stage the new version. Returns the staged .app path; the caller
// installs it separately so a failed download never touches the running app.
async function stage(rel, onProgress) {
  const asset = pickAsset(rel);
  if (!asset) throw new Error('no universal .zip in that release');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskhatch-update-'));
  const zip = path.join(dir, 'DeskHatch.zip');
  const got = await download(asset.browser_download_url, zip, onProgress);
  // The release metadata says how big the asset is, so a truncated transfer is
  // caught here rather than as a confusing failure three steps later.
  if (asset.size && got !== asset.size) {
    throw new Error('download incomplete (' + got + ' of ' + asset.size + ' bytes)');
  }

  const unpacked = path.join(dir, 'app');
  await run('/usr/bin/ditto', ['-x', '-k', zip, unpacked]);
  const staged = path.join(unpacked, 'DeskHatch.app');
  if (!fs.existsSync(staged)) throw new Error('DeskHatch.app missing from the archive');

  const ver = bundleVersion(staged);
  const want = String(rel.tag_name || '').replace(/^v/, '');
  if (ver && want && ver !== want) throw new Error('archive is v' + ver + ', expected v' + want);

  // Releases built before the afterPack ad-hoc signing hook shipped carry no
  // signature at all, which makes macOS call the bundle damaged. Signing here
  // is a no-op for builds that already have one, and is never fatal.
  if (hasCodesign()) {
    try {
      await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', staged]);
    } catch (e) { console.warn('[update] ad-hoc signing skipped: ' + e.message); }
  }

  return { staged, dir };
}

// Swap the staged bundle in. Replacing a running .app is safe on macOS — the
// running process keeps its own inodes — and this is what Squirrel.Mac does
// too. The old bundle is renamed aside first (an atomic rename within the same
// directory) so a failed copy can be rolled back instead of leaving no app.
async function install(staged) {
  const target = currentAppPath();
  if (!/\.app$/.test(target)) throw new Error('not running from an .app bundle');

  const parent = path.dirname(target);
  try { fs.accessSync(parent, fs.constants.W_OK); }
  catch (_) { throw new Error('no write permission for ' + parent); }

  const aside = target + '.old-' + Date.now();
  fs.renameSync(target, aside);
  try {
    await run('/usr/bin/ditto', [staged, target]);
  } catch (e) {
    try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) {}
    fs.renameSync(aside, target);  // put the working app back
    throw e;
  }
  try { fs.rmSync(aside, { recursive: true, force: true }); } catch (_) {}
  return target;
}

async function downloadAndInstall(rel, onProgress) {
  const { staged, dir } = await stage(rel, onProgress);
  try {
    return await install(staged);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { downloadAndInstall, currentAppPath, bundleVersion, pickAsset };
