'use strict';

// Windows AppBar integration.
//
// A real AppBar (SHAppBarMessage) makes the OS *reserve* the screen edge so that
// maximized windows are pushed below our bar — exactly how the classic Lotus
// SmartCenter and the Windows taskbar behave. That requires calling a Win32 API,
// which we do through the optional `koffi` FFI dependency.
//
// This module is intentionally defensive: if we're not on Windows, or koffi
// isn't installed, or anything throws, we silently fall back to a plain
// top-pinned always-on-top overlay (already configured in main.js). The drawer
// UX works either way — only the space-reservation is lost in the fallback.
//
// NOTE: the native path below is wired but unverified on Windows hardware in CI;
// it is guarded so a failure can never crash the app. Treat it as experimental.

const ABM_NEW = 0x00000000;
const ABM_REMOVE = 0x00000001;
const ABM_SETPOS = 0x00000003;
const ABE_TOP = 1;

let state = null; // { koffi, SHAppBarMessage, data } once registered

function tryLoadKoffi() {
  try {
    // eslint-disable-next-line global-require
    return require('koffi');
  } catch (_) {
    return null;
  }
}

function register(win, opts = {}) {
  if (process.platform !== 'win32') return false;
  const koffi = tryLoadKoffi();
  if (!koffi) {
    console.info('[appbar] koffi not available — using plain top overlay (no space reservation).');
    return false;
  }

  try {
    const height = opts.height || 44;
    const shell32 = koffi.load('shell32.dll');

    koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    koffi.struct('APPBARDATA', {
      cbSize: 'uint32',
      hWnd: 'uintptr_t',
      uCallbackMessage: 'uint32',
      uEdge: 'uint32',
      rc: 'RECT',
      lParam: 'int64',
    });

    const SHAppBarMessage = shell32.func(
      'uintptr_t __stdcall SHAppBarMessage(uint32 dwMessage, _Inout_ APPBARDATA* pData)'
    );

    const handleBuf = win.getNativeWindowHandle();
    const hWnd = process.arch === 'x64' || process.arch === 'arm64'
      ? handleBuf.readBigUInt64LE(0)
      : BigInt(handleBuf.readUInt32LE(0));

    const { width } = win.getBounds();
    const data = {
      cbSize: koffi.sizeof('APPBARDATA'),
      hWnd: Number(hWnd),
      uCallbackMessage: 0,
      uEdge: ABE_TOP,
      rc: { left: 0, top: 0, right: width, bottom: height },
      lParam: 0,
    };

    SHAppBarMessage(ABM_NEW, data);
    SHAppBarMessage(ABM_SETPOS, data);
    win.setBounds({ x: data.rc.left, y: data.rc.top, width: data.rc.right - data.rc.left, height });

    state = { koffi, SHAppBarMessage, data };
    console.info('[appbar] registered top AppBar (space reserved).');
    return true;
  } catch (err) {
    console.warn('[appbar] registration failed, falling back to overlay:', err && err.message);
    state = null;
    return false;
  }
}

function unregister() {
  if (!state) return;
  try {
    state.SHAppBarMessage(ABM_REMOVE, state.data);
  } catch (_) {
    /* ignore */
  }
  state = null;
}

module.exports = { register, unregister };
