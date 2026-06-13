'use strict';
// Standalone 3-pane scrapbook window: boxes (folders) | notes | content.
// Disk-backed (the scrap root is passed as ?root=). Uses the shared `files`
// preload bridge. Drop text/html/files anywhere to clip into the current box.
(function () {
  var q = new URLSearchParams(location.search);
  var root = q.get('root') || '';
  var ja = String(q.get('lang') || navigator.language || '').toLowerCase().indexOf('ja') === 0;
  function L(j, e) { return ja ? j : e; }
  function join(a, b) { return a.replace(/[\\/]+$/, '') + (a.indexOf('\\') >= 0 ? '\\' : '/') + b; }
  function sanit(x) { return (String(x || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'note'); }
  var F = window.files;
  var $ = function (id) { return document.getElementById(id); };
  var curBox = null, curBoxName = '', curNote = null, saveTimer = null;

  document.title = L('スクラップブック — DeskHatch', 'Scrapbook — DeskHatch');
  $('newBox').placeholder = L('新しい箱', 'New box');
  $('addNote').textContent = L('＋メモ', '+ Note');
  $('chgRoot').textContent = L('保存先を変更', 'Change folder');
  $('search').placeholder = L('🔍 すべて検索', '🔍 Search all');
  $('dropHint').textContent = L('ここにドロップして取り込み', 'Drop here to clip');

  function rootLabel() { return '📒 ' + (root.split(/[\\/]/).filter(Boolean).pop() || root || '?'); }

  async function pickRoot() { var d = await F.pickFolder(); if (d) { root = d; curBox = null; curNote = null; await loadBoxes(); } }

  async function loadBoxes() {
    $('rootName').textContent = rootLabel();
    if (!root) return;
    var res = await F.list(root);
    var dirs = ((res && res.entries) || []).filter(function (e) { return e.isDir; });
    if (!dirs.length) { var inbox = join(root, 'Inbox'); await F.mkdir(inbox); dirs = [{ name: 'Inbox', path: inbox }]; }
    var box = $('boxList'); box.innerHTML = '';
    dirs.forEach(function (d) {
      var r = document.createElement('div'); r.className = 'row' + (d.path === curBox ? ' sel' : ''); r.textContent = '📁 ' + d.name;
      r.onclick = function () { selectBox(d.path, d.name); };
      box.appendChild(r);
    });
    if (!curBox && dirs[0]) selectBox(dirs[0].path, dirs[0].name);
  }
  async function selectBox(p, name) { curBox = p; curBoxName = name || ''; curNote = null; $('boxName').textContent = '📁 ' + curBoxName; clearView(); await loadBoxes(); await loadNotes(); }

  async function loadNotes() {
    var list = $('noteList'); list.innerHTML = '';
    if (!curBox) return;
    var res = await F.list(curBox);
    var files = ((res && res.entries) || []).filter(function (e) { return e.isFile && /\.(md|txt|html?)$/i.test(e.name); });
    if (!files.length) { var m = document.createElement('div'); m.className = 'empty'; m.textContent = L('（メモなし）', '(no notes)'); list.appendChild(m); return; }
    files.forEach(function (fl) {
      var isHtml = /\.html?$/i.test(fl.name);
      var r = document.createElement('div'); r.className = 'row' + (fl.path === curNote ? ' sel' : '');
      r.textContent = (isHtml ? '🌐 ' : '📝 ') + fl.name.replace(/\.(md|txt|html?)$/i, '');
      r.onclick = function () { openNote(fl.path, fl.name); };
      list.appendChild(r);
    });
  }
  function clearView() { $('view').innerHTML = ''; $('noteName').textContent = '—'; }
  async function openNote(p, name) {
    curNote = p; $('noteName').textContent = name; await loadNotes();
    var view = $('view'); view.innerHTML = '';
    var t = await F.readText(p);
    if (/\.html?$/i.test(name)) {
      var f = document.createElement('iframe'); f.setAttribute('sandbox', ''); f.srcdoc = (typeof t === 'string' ? t : '');
      view.appendChild(f);
    } else {
      var ta = document.createElement('textarea'); ta.value = (typeof t === 'string' ? t : '');
      ta.oninput = function () { clearTimeout(saveTimer); saveTimer = setTimeout(function () { F.writePath(p, ta.value); }, 600); };
      view.appendChild(ta); ta.focus();
    }
  }
  async function newNote(text) {
    if (!curBox) return;
    var base = sanit((text || '').split('\n')[0] || 'note');
    var name = base + '.md';
    var res = await F.list(curBox); var names = ((res && res.entries) || []).map(function (e) { return e.name.toLowerCase(); });
    if (names.indexOf(name.toLowerCase()) >= 0) name = base + '-' + Date.now().toString(36) + '.md';
    var p = join(curBox, name); await F.writePath(p, text || ''); await loadNotes(); openNote(p, name);
  }

  $('addNote').onclick = function () { newNote(''); };
  $('addBox').onclick = async function () { var v = $('newBox').value.trim(); if (!v || !root) return; var p = join(root, sanit(v)); await F.mkdir(p); $('newBox').value = ''; await loadBoxes(); selectBox(p, sanit(v)); };
  $('newBox').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('addBox').click(); });
  $('chgRoot').onclick = pickRoot;
  var searchTimer = null;
  $('search').addEventListener('input', function () {
    var v = this.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { if (v) searchAll(v); else { $('boxName').textContent = '📁 ' + curBoxName; loadNotes(); } }, 250);
  });
  async function searchAll(q) {
    q = q.toLowerCase();
    $('boxName').textContent = L('検索結果', 'Search results');
    var list = $('noteList'); list.innerHTML = '';
    if (!root) return;
    var res = await F.list(root);
    var dirs = ((res && res.entries) || []).filter(function (e) { return e.isDir; });
    var hits = 0;
    for (var di = 0; di < dirs.length; di++) {
      var fr = await F.list(dirs[di].path);
      var files = ((fr && fr.entries) || []).filter(function (e) { return e.isFile && /\.(md|txt|html?)$/i.test(e.name); });
      for (var fi = 0; fi < files.length; fi++) {
        var f = files[fi];
        var inName = f.name.toLowerCase().indexOf(q) >= 0;
        var t = await F.readText(f.path); if (typeof t !== 'string') t = '';
        var plain = /\.html?$/i.test(f.name) ? t.replace(/<[^>]+>/g, ' ') : t;
        if (!inName && plain.toLowerCase().indexOf(q) < 0) continue;
        hits++;
        var isHtml = /\.html?$/i.test(f.name);
        var row = document.createElement('div'); row.className = 'row';
        row.innerHTML = '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (isHtml ? '🌐 ' : '📝 ') + f.name.replace(/\.(md|txt|html?)$/i, '') + '</div><div style="font-size:11px;color:#9ab">📁 ' + dirs[di].name + '</div>';
        (function (p, n, bp, bn) { row.onclick = function () { curBox = bp; curBoxName = bn; openNote(p, n); }; })(f.path, f.name, dirs[di].path, dirs[di].name);
        list.appendChild(row);
        if (hits >= 200) { di = dirs.length; break; }
      }
    }
    if (!hits) { var m = document.createElement('div'); m.className = 'empty'; m.textContent = L('該当なし', 'No matches'); list.appendChild(m); }
  }

  // --- rich capture on drop --------------------------------------------------
  function isRich(html) { return !!html && /<(img|table|h[1-6]|ul|ol|blockquote|p|figure|pre|video)\b/i.test(html); }
  function sanitizeHtml(html) {
    try {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script,style,link,meta,iframe,object,embed,noscript,form,input,button,source').forEach(function (n) { n.remove(); });
      doc.querySelectorAll('[srcset]').forEach(function (n) { n.removeAttribute('srcset'); });
      doc.querySelectorAll('*').forEach(function (n) { Array.prototype.slice.call(n.attributes).forEach(function (a) { if (a.name.toLowerCase().indexOf('on') === 0) n.removeAttribute(a.name); }); });
      return doc.body ? doc.body.innerHTML : html;
    } catch (_) { return html; }
  }
  async function embed(html) {
    try {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var imgs = Array.prototype.slice.call(doc.querySelectorAll('img'));
      for (var i = 0; i < imgs.length; i++) {
        var src = imgs[i].getAttribute('src') || '';
        if (src.indexOf('data:') === 0) continue;
        if (!/^https?:\/\//i.test(src)) { imgs[i].removeAttribute('src'); continue; }
        var d = await F.fetchDataUri(src);
        if (d) imgs[i].setAttribute('src', d); else imgs[i].removeAttribute('src');
      }
      return doc.body ? doc.body.innerHTML : html;
    } catch (_) { return html; }
  }
  function wrap(frag) { if (/<html[\s>]/i.test(frag)) return frag; return '<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px/1.7 sans-serif;color:#222;margin:14px;word-wrap:break-word}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #ccc;padding:4px 8px}a{color:#1a73e8}</style></head><body>' + frag + '</body></html>'; }
  async function saveRich(box, label, html) { var base = sanit((label || 'web-clip').split('\n')[0]); var emb = await embed(sanitizeHtml(html)); await F.writePath(join(box, base + '.html'), wrap(emb)); await loadNotes(); }

  document.body.addEventListener('dragover', function (e) { e.preventDefault(); $('dropHint').style.display = 'flex'; });
  document.body.addEventListener('dragleave', function (e) { if (e.relatedTarget === null) $('dropHint').style.display = 'none'; });
  document.body.addEventListener('drop', async function (e) {
    e.preventDefault(); $('dropHint').style.display = 'none';
    if (!curBox) { alert(L('先に箱を選んでください', 'Pick a box first')); return; }
    var dt = e.dataTransfer;
    var files = Array.prototype.slice.call(dt.files || []);
    if (files.length) {
      for (var i = 0; i < files.length; i++) { var p = (window.overlay && window.overlay.getPathForFile) ? window.overlay.getPathForFile(files[i]) : ''; if (p) await F.copyTo(p, curBox); }
      await loadNotes(); return;
    }
    var html = dt.getData('text/html') || '';
    var plain = (dt.getData('text/plain') || '').trim();
    var uris = (dt.getData('text/uri-list') || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (isRich(html)) { await saveRich(curBox, plain || uris[0] || 'web clip', html); }
    else if (uris.length || /^https?:/i.test(plain)) { await newNote('# ' + (uris[0] || plain) + '\n\n' + (uris[0] || plain)); }
    else if (plain) { await newNote(plain); }
  });

  if (root) loadBoxes(); else pickRoot();
})();
