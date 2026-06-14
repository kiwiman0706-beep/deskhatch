'use strict';

// Detect when a full-screen app is in the foreground (a game, a full-screen
// video, or Presentation Mode) so the bar can get out of the way. We combine
// two Win32 signals, loaded through the optional `koffi` FFI dependency and
// fully guarded — any failure just reports "not full-screen":
//
//   1. SHQueryUserNotificationState (shell32) — the same signal Windows uses to
//      silence toasts during games/video. Tells us a full-screen app IS running
//      (and, importantly, that a merely-maximized window is NOT).
//   2. GetForegroundWindow + GetWindowRect (user32) — to find WHICH monitor the
//      full-screen window covers, so we only hide that monitor's bar (not every
//      monitor).
//
// QUERY_USER_NOTIFICATION_STATE values:
//   1 NOT_PRESENT  2 BUSY  3 RUNNING_D3D_FULL_SCREEN  4 PRESENTATION_MODE
//   5 ACCEPTS_NOTIFICATIONS  6 QUIET_TIME  7 APP (Store app full-screen)
const FULLSCREEN_STATES = new Set([2, 3, 4, 7]);

let shQuery = null;  // cached SHQueryUserNotificationState, or false
let u32 = null;      // cached { getForeground, getRect }, or false

function loadKoffi() { try { return require('koffi'); } catch (_) { return null; } }

function ensureShQuery() {
  if (shQuery !== null) return shQuery;
  if (process.platform !== 'win32') { shQuery = false; return shQuery; }
  try {
    const shell32 = loadKoffi().load('shell32.dll');
    shQuery = shell32.func('long __stdcall SHQueryUserNotificationState(_Out_ int *pquns)');
  } catch (_) { shQuery = false; }
  return shQuery;
}

function ensureUser32() {
  if (u32 !== null) return u32;
  if (process.platform !== 'win32') { u32 = false; return u32; }
  try {
    const koffi = loadKoffi();
    const user32 = koffi.load('user32.dll');
    koffi.struct('FS_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    const getForeground = user32.func('uintptr_t __stdcall GetForegroundWindow()');
    const getRect = user32.func('bool __stdcall GetWindowRect(uintptr_t hWnd, _Out_ FS_RECT* r)');
    u32 = { getForeground, getRect };
  } catch (_) { u32 = false; }
  return u32;
}

// True when the system reports a full-screen / presentation app is running.
function isActive() {
  const f = ensureShQuery();
  if (!f) return false;
  try {
    const out = [0];
    if (f(out) !== 0) return false;        // S_OK == 0
    return FULLSCREEN_STATES.has(out[0]);
  } catch (_) { return false; }
}

// Physical-pixel rect of the foreground window, or null.
function foregroundRect() {
  const api = ensureUser32();
  if (!api) return null;
  try {
    const hwnd = api.getForeground();
    if (!hwnd) return null;
    const r = { left: 0, top: 0, right: 0, bottom: 0 };
    if (!api.getRect(hwnd, r)) return null;
    return { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top };
  } catch (_) { return null; }
}

// Which Electron displays a full-screen foreground window covers.
// Returns:
//   []    -> nothing full-screen (show every bar)
//   [ids] -> hide only those displays' bars
//   null  -> full-screen active but couldn't localize it -> caller hides all
function activeDisplayIds() {
  if (!isActive()) return [];
  const fr = foregroundRect();
  if (!fr) return null;
  let screen;
  try { screen = require('electron').screen; } catch (_) { return null; }
  const ids = [];
  for (const d of screen.getAllDisplays()) {
    let phys;
    try { phys = screen.dipToScreenRect(null, d.bounds); }
    catch (_) { phys = { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height }; }
    const tol = 4;
    const covers = fr.x <= phys.x + tol && fr.y <= phys.y + tol
      && (fr.x + fr.w) >= (phys.x + phys.width - tol)
      && (fr.y + fr.h) >= (phys.y + phys.height - tol);
    if (covers) ids.push(d.id);
  }
  return ids.length ? ids : null; // active but unmatched -> hide all (safe)
}

module.exports = { isActive, activeDisplayIds };
