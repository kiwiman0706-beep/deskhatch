'use strict';
// UI i18n via external language packs in src/renderer/locales/<code>.json
// (key = Japanese source string, value = translation). Japanese is the source
// language, so it needs no pack. Add a language by dropping in a new JSON file
// with a "__name__"; preload reads the folder and it shows up in Settings.
(function () {
  function detect() {
    try { const s = localStorage.getItem('ss-lang'); if (s) return s; } catch (_) {}
    return String(navigator.language || 'en').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  }
  const LANG = detect();
  let DICT = {};
  if (LANG !== 'ja' && window.i18n && window.i18n.load) {
    try { DICT = window.i18n.load(LANG) || {}; } catch (_) { DICT = {}; }
  }
  function L(s) { return Object.prototype.hasOwnProperty.call(DICT, s) ? DICT[s] : s; }
  window.LANG = LANG; window.L = L;
})();
