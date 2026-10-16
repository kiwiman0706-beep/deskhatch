// Pure decision logic for "local app" drawers — a drawer backed by a companion
// desktop app that serves its UI over loopback HTTP. No DOM, no IPC.
//
// The contract a companion app must satisfy is documented in
// docs/LOCALAPP-PROTOCOL.md. In short, a drawer definition looks like:
//
//   { id: 'dsbooks', type: 'localapp', label: '本棚', icon: '📚', width: 520,
//     url: 'http://127.0.0.1:47817/',      // the UI, loopback only
//     health: '/ping',                      // GET -> JSON
//     expect: { app: 'dsbooks' },           // subset the health JSON must match
//     launch: { win32: { exe: '%LOCALAPPDATA%\\Programs\\DSBooks\\DSBooks.exe',
//                        args: ['--background'] } },
//     actions: [ ... ],                     // extra right-click entries
//     platforms: ['win32'], download: 'https://…' }
//
// Nothing here is app-specific: adding a second companion app is a new preset,
// not new code.
;(function (root) {
  'use strict';

  // Only loopback. The health probe and the action GETs are issued by the main
  // process on the renderer's say-so, so the address they may reach has to be
  // pinned to this machine — a drawer definition must never be able to make
  // DeskHatch fetch an arbitrary host.
  function isLoopback(urlStr) {
    let u;
    try { u = new URL(String(urlStr)); } catch (_) { return false; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname.replace(/^\[|\]$/g, '');
    return h === '127.0.0.1' || h === '::1' || h === 'localhost';
  }

  // Absolute URL for the health endpoint / an action path, resolved against the
  // drawer's own url so a definition can use "/ping" rather than repeat the port.
  function endpoint(baseUrl, pathOrUrl) {
    if (!pathOrUrl) return '';
    try { return new URL(pathOrUrl, baseUrl).href; } catch (_) { return ''; }
  }

  // Windows-style %VAR% expansion, plus a leading ~ for the Unix side. An
  // unknown variable is left as-is so the "not found" path can show the user
  // the literal string they need to fix.
  function expandEnv(p, env) {
    if (!p) return '';
    const e = env || {};
    let out = String(p).replace(/%([^%]+)%/g, (m, name) => {
      const hit = Object.keys(e).find((k) => k.toLowerCase() === String(name).toLowerCase());
      return hit ? e[hit] : m;
    });
    if (/^~[/\\]/.test(out) && (e.HOME || e.USERPROFILE)) {
      out = (e.HOME || e.USERPROFILE) + out.slice(1);
    }
    return out;
  }

  // Does the health response prove this is the app we expect? A shallow subset
  // match: every key in `expect` must be present and equal. An empty `expect`
  // means any JSON body (or any 2xx) counts.
  function matchExpect(body, expect) {
    if (!expect || typeof expect !== 'object' || !Object.keys(expect).length) return true;
    if (!body || typeof body !== 'object') return false;
    return Object.keys(expect).every((k) => body[k] === expect[k]);
  }

  // The launch spec for this platform. `launch` is keyed by process.platform
  // ('win32' | 'darwin' | 'linux'); 'win'/'mac' are accepted as aliases because
  // they read better in a hand-written definition.
  const ALIAS = { win32: ['win32', 'win'], darwin: ['darwin', 'mac'], linux: ['linux'] };
  function launchSpecFor(tab, platform) {
    const l = tab && tab.launch;
    if (!l || typeof l !== 'object') return null;
    for (const key of (ALIAS[platform] || [platform])) {
      if (l[key]) return l[key];
    }
    return null;
  }

  // Is this drawer meant to exist on this platform at all? `platforms` is
  // optional; without it the drawer shows everywhere.
  function isSupported(tab, platform) {
    const list = tab && tab.platforms;
    if (!Array.isArray(list) || !list.length) return true;
    return list.some((p) => (ALIAS[platform] || [platform]).includes(p));
  }

  // What should opening the drawer do right now?
  //   'show'     -> the app answered its health check; load the UI
  //   'launch'   -> not running, but we know where the executable is
  //   'missing'  -> not running and no usable executable: ask the user for it
  //   'unsupported' -> no launch spec for this platform
  function nextStep(s) {
    if (s.healthy) return 'show';
    if (!s.hasLaunchSpec) return 'unsupported';
    if (!s.exePath) return 'missing';
    if (s.exeExists === false) return 'missing';
    return 'launch';
  }

  // Poll schedule for "we just launched it, wait for the port to answer".
  // Returns the delays in ms; the caller probes after each. Front-loaded
  // because an already-warm app answers almost immediately, and an app that
  // has to open a database takes seconds.
  function pollDelays(totalMs) {
    const total = Math.max(0, totalMs == null ? 15000 : totalMs);
    const out = [];
    let t = 0;
    let step = 150;
    while (t < total) {
      out.push(step);
      t += step;
      if (step < 1000) step = Math.min(1000, Math.round(step * 1.6));
    }
    return out;
  }

  const api = { isLoopback, endpoint, expandEnv, matchExpect, launchSpecFor, isSupported, nextStep, pollDelays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SSLocalApp = api;
})(typeof window !== 'undefined' ? window : null);
