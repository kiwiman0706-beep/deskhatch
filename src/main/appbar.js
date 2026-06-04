'use strict';

// Windows AppBar integration: reserves the top screen edge (SHAppBarMessage) so
// that maximized windows are pushed below our bar — like the Windows taskbar.
// Done through the optional `koffi` FFI dependency, fully guarded so a failure
// can never crash the app (we just fall back to a plain overlay).
//
// register() returns a status string: 'ok' | 'no-koffi' | 'not-win' | 'error:…'.

const ABM_NEW = 0x00000000;
const ABM_REMOVE = 0x00000001;
const ABM_QUERYPOS = 0x00000002;
const ABM_SETPOS = 0x00000003;
const ABE_TOP = 1;

let api = null;   // { SHAppBarMessage, sizeof } — built once
const regs = new Map(); // win.id -> APPBARDATA while registered (one per display)

function tryLoadKoffi() {
  try {
    // eslint-disable-next-line global-require
    return require('koffi');
  } catch (_) {
    return null;
  }
}

// Define the structs/function ONCE. koffi.struct throws if a name is redefined,
// which previously broke re-registration (toggling the setting on/off/on).
function initApi(koffi) {
  if (api) return;
  const shell32 = koffi.load('shell32.dll');
  koffi.struct('SS_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
  koffi.struct('SS_APPBARDATA', {
    cbSize: 'uint32',
    hWnd: 'uintptr_t',
    uCallbackMessage: 'uint32',
    uEdge: 'uint32',
    rc: 'SS_RECT',
    lParam: 'int64',
  });
  const SHAppBarMessage = shell32.func(
    'uintptr_t __stdcall SHAppBarMessage(uint32 dwMessage, _Inout_ SS_APPBARDATA* pData)'
  );
  api = { SHAppBarMessage, sizeof: koffi.sizeof('SS_APPBARDATA') };
}

function hwndOf(win) {
  const buf = win.getNativeWindowHandle();
  return process.arch === 'ia32' ? BigInt(buf.readUInt32LE(0)) : buf.readBigUInt64LE(0);
}

function register(win, opts = {}) {
  if (process.platform !== 'win32') return 'not-win';
  const koffi = tryLoadKoffi();
  if (!koffi) {
    console.info('[appbar] koffi not installed — cannot reserve space.');
    return 'no-koffi';
  }
  try {
    initApi(koffi);
    const { SHAppBarMessage, sizeof } = api;
    const height = opts.height || 44;
    const { screen } = require('electron');
    // Always reserve the DISPLAY's top edge (not the window's current, possibly
    // drifted, position). dipToScreenRect handles DIP->physical correctly across
    // secondary / mixed-DPI displays.
    const db = (opts.display && opts.display.bounds) || screen.getDisplayMatching(win.getBounds()).bounds;
    const phys = screen.dipToScreenRect(win, { x: db.x, y: db.y, width: db.width, height });

    const data = {
      cbSize: sizeof,
      hWnd: Number(hwndOf(win)),
      uCallbackMessage: 0,
      uEdge: ABE_TOP,
      rc: { left: phys.x, top: phys.y, right: phys.x + phys.width, bottom: phys.y + phys.height },
      lParam: 0,
    };

    if (!regs.has(win.id)) SHAppBarMessage(ABM_NEW, data); // register once per window
    SHAppBarMessage(ABM_QUERYPOS, data);
    data.rc.bottom = data.rc.top + phys.height;
    SHAppBarMessage(ABM_SETPOS, data);
    // NOTE: do NOT move the window here; main's rePin positions it in clean DIP.

    regs.set(win.id, data);
    console.info('[appbar] reserved rc=' + JSON.stringify(data.rc));
    return 'ok';
  } catch (err) {
    console.warn('[appbar] registration failed:', err && err.message);
    return 'error:' + (err && err.message);
  }
}

function unregister(win) {
  if (!api || !win || !regs.has(win.id)) return;
  try {
    api.SHAppBarMessage(ABM_REMOVE, regs.get(win.id));
    console.info('[appbar] released top edge.');
  } catch (_) {
    /* ignore */
  }
  regs.delete(win.id);
}

module.exports = { register, unregister };
