'use strict';

// Detect when a full-screen app is in the foreground (a game, a full-screen
// video, or Presentation Mode) so the bar can get out of the way. We use the
// same Win32 signal Windows itself uses to silence toast notifications during
// games/video: SHQueryUserNotificationState (shell32). Loaded through the
// optional `koffi` FFI dependency and fully guarded — any failure just reports
// "not full-screen", so the bar behaves normally.
//
// QUERY_USER_NOTIFICATION_STATE values:
//   1 QUNS_NOT_PRESENT           screensaver / locked
//   2 QUNS_BUSY                  a full-screen app is running OR presentation settings
//   3 QUNS_RUNNING_D3D_FULL_SCREEN   exclusive-mode Direct3D (most full-screen games)
//   4 QUNS_PRESENTATION_MODE     presentation mode
//   5 QUNS_ACCEPTS_NOTIFICATIONS normal desktop
//   6 QUNS_QUIET_TIME            first hour after a new login
//   7 QUNS_APP                   a Store app running full-screen
const FULLSCREEN_STATES = new Set([2, 3, 4, 7]);

let fn = null;       // cached koffi func, or false once we know it's unavailable

function ensure() {
  if (fn !== null) return fn;
  if (process.platform !== 'win32') { fn = false; return fn; }
  try {
    // eslint-disable-next-line global-require
    const koffi = require('koffi');
    const shell32 = koffi.load('shell32.dll');
    fn = shell32.func('long __stdcall SHQueryUserNotificationState(_Out_ int *pquns)');
  } catch (_) {
    fn = false;
  }
  return fn;
}

// Returns true when a full-screen / presentation app is in the foreground.
function isActive() {
  const f = ensure();
  if (!f) return false;
  try {
    const out = [0];
    const hr = f(out);
    if (hr !== 0) return false;            // S_OK == 0
    return FULLSCREEN_STATES.has(out[0]);
  } catch (_) {
    return false;
  }
}

module.exports = { isActive };
