'use strict';
// Region-screenshot overlay: shows a frozen screen capture, lets the user drag a
// rectangle, crops it, and hands the PNG data URL back to the main process (which
// relays it to the bar as an image clip). Esc cancels.
(function () {
  var img = document.getElementById('img');
  var sel = document.getElementById('sel');
  var hint = document.getElementById('hint');
  var ja = String(navigator.language || '').toLowerCase().indexOf('ja') === 0;
  hint.textContent = ja ? 'ドラッグで範囲選択 / Esc で中止' : 'Drag to select a region / Esc to cancel';
  var sx = 0, sy = 0, dragging = false;

  if (window.overlay && window.overlay.onShotImage) window.overlay.onShotImage(function (url) { img.src = url; });
  function done(url) { if (window.overlay && window.overlay.shotDone) window.overlay.shotDone(url); }
  function cancel() { if (window.overlay && window.overlay.shotCancel) window.overlay.shotCancel(); }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cancel(); });
  document.addEventListener('mousedown', function (e) {
    dragging = true; sx = e.clientX; sy = e.clientY;
    sel.style.display = 'block'; sel.style.left = sx + 'px'; sel.style.top = sy + 'px'; sel.style.width = '0px'; sel.style.height = '0px';
  });
  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY), w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
    sel.style.left = x + 'px'; sel.style.top = y + 'px'; sel.style.width = w + 'px'; sel.style.height = h + 'px';
  });
  document.addEventListener('mouseup', function (e) {
    if (!dragging) return; dragging = false;
    var x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY), w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
    if (w < 5 || h < 5) { cancel(); return; }
    var nW = img.naturalWidth || window.innerWidth, nH = img.naturalHeight || window.innerHeight;
    var rx = nW / window.innerWidth, ry = nH / window.innerHeight;
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * rx)); cv.height = Math.max(1, Math.round(h * ry));
    try {
      cv.getContext('2d').drawImage(img, x * rx, y * ry, w * rx, h * ry, 0, 0, cv.width, cv.height);
      done(cv.toDataURL('image/png'));
    } catch (_) { cancel(); }
  });
})();
