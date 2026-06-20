'use strict';

// Windows-only window manager (koffi FFI): list top-level windows and
// move/raise/minimize/close an arbitrary one. This is what lets the shell drive
// the real browser's app-mode windows as if they were our own tabs. Every call
// is fully guarded — on any failure (non-Windows, no koffi) it degrades to
// empty/false so the app never crashes.
//
// Adapted from DeskHatch's src/main/winmgr.js, plus close() (PostMessage
// WM_CLOSE) so we can shut a tab's browser window.

let api = null; // cached { ...funcs } | false

function ensure() {
  if (api !== null) return api;
  if (process.platform !== 'win32') { api = false; return api; }
  try {
    // eslint-disable-next-line global-require
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    koffi.struct('WB_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    const EnumProc = koffi.proto('bool __stdcall WBEnumProc(uintptr_t hwnd, intptr_t lparam)');
    api = {
      koffi,
      EnumProc,
      EnumWindows: user32.func('bool __stdcall EnumWindows(void* proc, intptr_t lparam)'),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(uintptr_t hwnd)'),
      GetWindowTextW: user32.func('int __stdcall GetWindowTextW(uintptr_t hwnd, _Out_ uint16* str, int max)'),
      GetWindowThreadProcessId: user32.func('uint32 __stdcall GetWindowThreadProcessId(uintptr_t hwnd, _Out_ uint32* pid)'),
      ShowWindow: user32.func('bool __stdcall ShowWindow(uintptr_t hwnd, int cmd)'),
      SetWindowPos: user32.func('bool __stdcall SetWindowPos(uintptr_t hwnd, uintptr_t after, int x, int y, int cx, int cy, uint32 flags)'),
      SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(uintptr_t hwnd)'),
      GetForegroundWindow: user32.func('uintptr_t __stdcall GetForegroundWindow()'),
      IsIconic: user32.func('bool __stdcall IsIconic(uintptr_t hwnd)'),
      GetWindowRect: user32.func('bool __stdcall GetWindowRect(uintptr_t hwnd, _Out_ WB_RECT* r)'),
      PostMessageW: user32.func('bool __stdcall PostMessageW(uintptr_t hwnd, uint32 msg, uintptr_t wParam, intptr_t lParam)'),
    };
  } catch (_) { api = false; }
  return api;
}

// All visible top-level windows that have a title. [{ hwnd, title, pid }]
function listWindows() {
  const a = ensure();
  if (!a) return [];
  const out = [];
  const buf = Buffer.alloc(1024); // 512 UTF-16 chars
  const pid = [0];
  let cb = null;
  try {
    cb = a.koffi.register((hwnd, _lparam) => {
      try {
        if (!a.IsWindowVisible(hwnd)) return true;
        const len = a.GetWindowTextW(hwnd, buf, 512);
        if (len > 0) {
          const title = buf.toString('utf16le', 0, len * 2).replace(/ +$/, '');
          if (title && title.trim()) {
            pid[0] = 0; a.GetWindowThreadProcessId(hwnd, pid);
            out.push({ hwnd: Number(hwnd), title, pid: pid[0] });
          }
        }
      } catch (_) { /* skip this window */ }
      return true; // keep enumerating
    }, a.koffi.pointer(a.EnumProc));
    a.EnumWindows(cb, 0);
  } catch (_) { /* enumeration failed */ }
  finally { if (cb) { try { a.koffi.unregister(cb); } catch (_) {} } }
  return out;
}

const SW_MINIMIZE = 6, SW_RESTORE = 9, SW_SHOW = 5;
const SWP_NOZORDER = 0x4, SWP_SHOWWINDOW = 0x40;
const WM_CLOSE = 0x0010;

function restore(hwnd) {
  const a = ensure();
  if (!a || !hwnd) return false;
  try { if (a.IsIconic(hwnd)) a.ShowWindow(hwnd, SW_RESTORE); else a.ShowWindow(hwnd, SW_SHOW); return true; }
  catch (_) { return false; }
}

function getRect(hwnd) {
  const a = ensure();
  if (!a || !hwnd) return null;
  try {
    const r = { left: 0, top: 0, right: 0, bottom: 0 };
    if (!a.GetWindowRect(hwnd, r)) return null;
    return { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top };
  } catch (_) { return null; }
}

function move(hwnd, rect) {
  const a = ensure();
  if (!a || !hwnd || !rect) return false;
  try { return !!a.SetWindowPos(hwnd, 0, rect.x, rect.y, rect.w, rect.h, SWP_NOZORDER | SWP_SHOWWINDOW); }
  catch (_) { return false; }
}

function front(hwnd) {
  const a = ensure();
  if (!a || !hwnd) return false;
  try { return !!a.SetForegroundWindow(hwnd); } catch (_) { return false; }
}

function tuck(hwnd) {
  const a = ensure();
  if (!a || !hwnd) return false;
  try { a.ShowWindow(hwnd, SW_MINIMIZE); return true; } catch (_) { return false; }
}

function close(hwnd) {
  const a = ensure();
  if (!a || !hwnd) return false;
  try { return !!a.PostMessageW(hwnd, WM_CLOSE, 0, 0); } catch (_) { return false; }
}

function foregroundPid() {
  const a = ensure();
  if (!a) return 0;
  try { const h = a.GetForegroundWindow(); const pid = [0]; a.GetWindowThreadProcessId(h, pid); return pid[0]; }
  catch (_) { return 0; }
}

module.exports = { listWindows, restore, getRect, move, front, tuck, close, foregroundPid };
