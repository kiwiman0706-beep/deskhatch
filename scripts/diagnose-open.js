'use strict';

// Windows diagnostic: why might a URL (e.g. google.com) open the wrong app or
// nothing at all? Prints the default https handler, the browser .exe DeskHatch
// will launch directly, and any Google apps/PWAs that could be intercepting
// links. Run:  npm run diagnose:open
//
// Read-only (only `reg query` / Get-AppxPackage); changes nothing.

const { execSync } = require('child_process');

function run(cmd) {
  try { return execSync(cmd, { windowsHide: true, encoding: 'utf8' }).trim(); }
  catch (e) { return ((e.stdout || '') + (e.stderr || '')).trim() || '(取得できず)'; }
}

if (process.platform !== 'win32') {
  console.log('このスクリプトは Windows 専用です。');
  process.exit(0);
}

const UC = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice';

console.log('===== DeskHatch URL を開く診断 =====\n');

console.log('■ 既定の https ハンドラ (UserChoice)');
const ucOut = run('reg query "' + UC + '" /v ProgId');
console.log(ucOut, '\n');

const pm = ucOut.match(/REG_SZ\s+(\S+)/);
const progId = pm ? pm[1] : null;
console.log('  → ProgId =', progId || '(不明)', '\n');

if (progId) {
  console.log('■ ' + progId + ' の open コマンド（＝既定ブラウザの実体）');
  const cmd = run('reg query "HKEY_CLASSES_ROOT\\' + progId + '\\shell\\open\\command" /ve');
  console.log(cmd, '\n');
  const exe = cmd.match(/"([^"]+\.exe)"/i) || cmd.match(/(\S+\.exe)/i);
  console.log('  → DeskHatch が直接起動する exe =', exe ? exe[1] : '(解決できず → shell.openExternal にフォールバック)', '\n');
  if (progId.startsWith('App') || /AppX/i.test(progId)) {
    console.log('  ⚠ 既定ブラウザ自体が Store/PWA(AppX) のようです。通常のブラウザ(Chrome/Edge/Firefox)を既定にすると安定します。\n');
  }
}

console.log('■ Google 関連のインストール済みアプリ/PWA (これがリンクを横取りしている可能性)');
console.log(run('powershell -NoProfile -Command "Get-AppxPackage *google* | Select-Object Name,PackageFullName | Format-List"'), '\n');

console.log('■ 既定の「Web サイト用アプリ」関連付け状態');
console.log(run('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AppHost" /s'), '\n');

console.log('ヒント:');
console.log(' - ProgId が ChromeHTML / MSEdgeHTM / FirefoxURL 等の通常ブラウザなら、');
console.log('   DeskHatch の新方式（exe 直接起動）で google.com も開くはずです。');
console.log(' - 上の Google アプリ一覧に何か出ていれば、それが「対応リンクを開く」設定で');
console.log('   横取りしている可能性大。設定→アプリ→そのアプリ→詳細→「対応するリンクを開く」OFF。');
