'use strict';
// Sticky-note window: a single scrapbook note shown as a small frameless,
// always-on-top card. Reads/writes the underlying box file via the `files`
// bridge (so the content stays Drive-syncable); colour + geometry are persisted
// by the main process per machine. The ✕ button unpins (removes the sticky);
// closing is never silent so a stray click can't lose the note.
(function () {
  var q = new URLSearchParams(location.search);
  var p = q.get('path') || '';
  var ja = String(q.get('lang') || navigator.language || '').toLowerCase().indexOf('ja') === 0;
  function L(j, e) { return ja ? j : e; }
  var F = window.files, O = window.overlay;
  var $ = function (id) { return document.getElementById(id); };
  var isHtml = /\.html?$/i.test(p);
  var saveTimer = null, savedTimer = null;

  var COLORS = {
    yellow: { bg: '#fff9c4', head: '#ffec99', dot: '#ffe14d' },
    pink:   { bg: '#ffe0ec', head: '#ffc1d9', dot: '#ff9ec4' },
    green:  { bg: '#dcf5d2', head: '#bbeaad', dot: '#8fdc78' },
    blue:   { bg: '#d9ecff', head: '#b3d9ff', dot: '#7cb8ff' },
    purple: { bg: '#ece0ff', head: '#d4bcff', dot: '#b48cff' },
  };
  var color = q.get('color') || 'yellow';
  if (!COLORS[color]) color = 'yellow';

  function applyColor(c) {
    var def = COLORS[c] || COLORS.yellow;
    document.documentElement.style.setProperty('--bg', def.bg);
    document.documentElement.style.setProperty('--head', def.head);
    Array.prototype.forEach.call(document.querySelectorAll('.dot'), function (d) {
      d.classList.toggle('sel', d.getAttribute('data-c') === c);
    });
  }
  function buildDots() {
    var box = $('dots'); box.innerHTML = '';
    Object.keys(COLORS).forEach(function (k) {
      var d = document.createElement('span'); d.className = 'dot'; d.setAttribute('data-c', k);
      d.style.background = COLORS[k].dot; d.title = k;
      d.onclick = function () { color = k; applyColor(k); if (O && O.stickySetColor) O.stickySetColor(p, k); };
      box.appendChild(d);
    });
  }

  function title() {
    var base = (p.split(/[\\/]/).pop() || 'note').replace(/\.(md|txt|html?)$/i, '');
    return base;
  }
  function flashSaved() {
    var s = $('saved'); s.classList.add('show');
    clearTimeout(savedTimer); savedTimer = setTimeout(function () { s.classList.remove('show'); }, 900);
  }

  $('title').textContent = title();
  $('close').title = L('付箋を外す', 'Unpin');
  buildDots(); applyColor(color);
  $('close').onclick = function () { if (O && O.closeSticky) O.closeSticky(p); else window.close(); };

  (async function () {
    var t = await F.readText(p);
    if (typeof t !== 'string') t = '';
    var body = $('body');
    if (isHtml) {
      var f = document.createElement('iframe'); f.setAttribute('sandbox', ''); f.srcdoc = t;
      body.appendChild(f);
    } else {
      var ta = document.createElement('textarea'); ta.value = t;
      ta.placeholder = L('メモ…', 'Note…');
      ta.oninput = function () {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { F.writePath(p, ta.value).then(flashSaved); }, 600);
      };
      body.appendChild(ta); ta.focus();
    }
  })();
})();
