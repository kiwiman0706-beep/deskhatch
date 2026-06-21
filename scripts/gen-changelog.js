'use strict';
const fs = require('fs');

// version, publish time (UTC, from GitHub Releases), channel
const versions = [
  ['v0.1.71-beta.2','2026-06-20T20:45:28Z','beta'],
  ['v0.1.71-beta.1','2026-06-20T12:26:25Z','beta'],
  ['v0.1.68-beta.3','2026-06-19T01:43:39Z','beta'],
  ['v0.1.68-beta.2','2026-06-18T19:43:17Z','beta'],
  ['v0.1.68-beta.1','2026-06-18T16:58:22Z','beta'],
  ['v0.1.66','2026-06-16T02:41:48Z','stable'],
  ['v0.1.66-beta.2','2026-06-16T00:38:27Z','beta'],
  ['v0.1.66-beta.1','2026-06-15T03:59:02Z','beta'],
  ['v0.1.65','2026-06-15T00:22:32Z','stable'],
  ['v0.1.64','2026-06-15T00:04:58Z','stable'],
  ['v0.1.63','2026-06-14T23:54:46Z','stable'],
  ['v0.1.62','2026-06-14T22:43:18Z','stable'],
  ['v0.1.61','2026-06-14T16:23:19Z','stable'],
  ['v0.1.60','2026-06-14T15:06:52Z','stable'],
  ['v0.1.59','2026-06-14T13:10:53Z','stable'],
  ['v0.1.58','2026-06-14T05:58:16Z','stable'],
  ['v0.1.57','2026-06-14T05:26:41Z','stable'],
  ['v0.1.56','2026-06-14T02:04:45Z','stable'],
  ['v0.1.55','2026-06-13T16:14:29Z','stable'],
  ['v0.1.54','2026-06-13T16:11:59Z','stable'],
  ['v0.1.53','2026-06-13T16:09:25Z','stable'],
  ['v0.1.52','2026-06-13T16:07:55Z','stable'],
  ['v0.1.51','2026-06-13T15:54:11Z','stable'],
  ['v0.1.50','2026-06-13T12:15:08Z','stable'],
  ['v0.1.49','2026-06-13T12:10:00Z','stable'],
  ['v0.1.48','2026-06-13T12:05:21Z','stable'],
  ['v0.1.47','2026-06-13T11:58:56Z','stable'],
  ['v0.1.46','2026-06-13T11:50:41Z','stable'],
  ['v0.1.45','2026-06-12T23:34:29Z','stable'],
  ['v0.1.44','2026-06-12T09:44:44Z','stable'],
  ['v0.1.43','2026-06-12T09:02:39Z','stable'],
  ['v0.1.42','2026-06-12T01:34:18Z','stable'],
  ['v0.1.41','2026-06-11T21:14:38Z','stable'],
  ['v0.1.40','2026-06-11T21:10:56Z','stable'],
  ['v0.1.39','2026-06-11T20:48:46Z','stable'],
  ['v0.1.38','2026-06-11T16:45:20Z','stable'],
  ['v0.1.37','2026-06-11T16:13:23Z','stable'],
  ['v0.1.36','2026-06-11T15:03:43Z','stable'],
  ['v0.1.35','2026-06-11T14:46:04Z','stable'],
  ['v0.1.34','2026-06-11T14:28:27Z','stable'],
  ['v0.1.33','2026-06-11T14:08:41Z','stable'],
  ['v0.1.32','2026-06-11T14:06:16Z','stable'],
  ['v0.1.31','2026-06-11T03:06:17Z','stable'],
  ['v0.1.30','2026-06-11T02:53:19Z','stable'],
  ['v0.1.29','2026-06-11T02:32:25Z','stable'],
  ['v0.1.28','2026-06-11T01:55:27Z','stable'],
  ['v0.1.27','2026-06-11T01:38:47Z','stable'],
  ['v0.1.26','2026-06-11T01:17:31Z','stable'],
  ['v0.1.25','2026-06-11T01:11:42Z','stable'],
  ['v0.1.24','2026-06-11T00:53:00Z','stable'],
  ['v0.1.23','2026-06-10T22:33:42Z','stable'],
  ['v0.1.22','2026-06-10T16:25:43Z','stable'],
  ['v0.1.20','2026-06-10T15:59:21Z','stable'],
  ['v0.1.19','2026-06-10T15:53:35Z','stable'],
  ['v0.1.18','2026-06-10T15:33:01Z','stable'],
  ['v0.1.17','2026-06-10T14:56:49Z','stable'],
  ['v0.1.16','2026-06-10T14:26:00Z','stable'],
  ['v0.1.15','2026-06-10T12:02:02Z','stable'],
  ['v0.1.14','2026-06-10T01:53:34Z','stable'],
  ['v0.1.13','2026-06-09T13:40:49Z','stable'],
  ['v0.1.12','2026-06-09T13:36:55Z','stable'],
  ['v0.1.11','2026-06-09T07:48:48Z','stable'],
  ['v0.1.10','2026-06-09T06:35:21Z','stable'],
  ['v0.1.9','2026-06-09T00:33:13Z','stable'],
  ['v0.1.8','2026-06-09T00:23:13Z','stable'],
  ['v0.1.7','2026-06-09T00:04:43Z','stable'],
  ['v0.1.6','2026-06-08T22:58:01Z','stable'],
  ['v0.1.5','2026-06-08T16:29:09Z','stable'],
  ['v0.1.4','2026-06-08T15:53:33Z','stable'],
  ['v0.1.3','2026-06-08T13:04:41Z','stable'],
  ['v0.1.2','2026-06-08T12:12:31Z','stable'],
  ['v0.1.1','2026-06-08T11:56:15Z','stable'],
  ['v0.1.0','2026-06-08T05:59:17Z','stable'],
];
// oldest -> newest for bucketing
const asc = versions.slice().reverse().map(([tag,t,ch]) => ({tag, t: Date.parse(t), ch, commits: []}));
const unreleased = [];

const lines = fs.readFileSync('/tmp/gitlog.txt','utf8').trim().split('\n');
for (const ln of lines) {
  const i = ln.indexOf('|'); const j = ln.indexOf('|', i+1);
  const ct = Date.parse(ln.slice(0,i));
  const hash = ln.slice(i+1,j);
  const subj = ln.slice(j+1);
  // first version whose publish time >= commit time
  const v = asc.find(v => v.t >= ct);
  if (v) v.commits.push({hash, subj}); else unreleased.push({hash, subj});
}

function fmtDate(t){ return t.slice(0,16).replace('T',' ') + ' UTC'; }

let out = '';
out += '# Changelog / バージョン履歴\n\n';
out += 'DeskHatch の全リリースを公開日（**UTC**、日本時間 JST は +9h）とともに記録。\n';
out += '各バージョンの変更内容は、そのリリースが公開された時刻までのコミットを機械的に割り当てたもの（近似。リリースは GitHub Actions の自動ビルドで頻繁に切られているため、ごく短時間差のリリースは「再ビルドのみ」のことがある）。\n\n';
out += 'GitHub Releases: <https://github.com/kiwiman0706-beep/deskhatch/releases>\n\n';
out += '凡例: **stable**=通常版 / **beta**=テスト版（プレリリース）\n\n';
out += '---\n\n';

if (unreleased.length) {
  out += '## Unreleased（未リリース）\n\n';
  for (const c of unreleased) out += `- ${c.subj} (\`${c.hash}\`)\n`;
  out += '\n';
}

for (const v of asc.slice().reverse()) {
  out += `## ${v.tag} — ${fmtDate(new Date(v.t).toISOString())} · ${v.ch}\n\n`;
  if (!v.commits.length) { out += '_（再ビルド／微修正のみ — 新規コミットなし）_\n\n'; continue; }
  for (const c of v.commits) out += `- ${c.subj} (\`${c.hash}\`)\n`;
  out += '\n';
}

out += '---\n\n';
out += '> リポジトリは `smartsuite.next` → `deskhatch` にリネーム済み。リリースは `release` ワークフロー（タグ push / 手動実行）で Windows・macOS を自動ビルドし公開。\n';

fs.writeFileSync('CHANGELOG.md', out);
const total = asc.reduce((a,v)=>a+v.commits.length,0) + unreleased.length;
console.log('versions:', asc.length, 'commits bucketed:', total, 'unreleased:', unreleased.length);
