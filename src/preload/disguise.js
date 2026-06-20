'use strict';

// Runs BEFORE a page's own scripts (contextIsolation:false) in both the Google
// sign-in window AND the embedded-browser drawers, so the page sees an ordinary
// desktop Chrome instead of Electron. Even with a real Chrome User-Agent string,
// Electron still leaks "embedded browser" tells that Google's sign-in reads to
// throw "this browser or app may not be secure":
//   - navigator.userAgentData  -> still carries the "Electron" brand
//   - navigator.webdriver      -> may be true
//   - window.chrome            -> missing/empty (real Chrome always has it)
// We normalise those to a plain Chrome here. Idempotent: safe to run again on
// every navigation inside a long-lived drawer webview.

(function disguise() {
  if (window.__ssDisguised) return;
  window.__ssDisguised = true;

  // 1) navigator.webdriver -> false (automation tell).
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  } catch (_) { /* ignore */ }

  // 2) navigator.userAgentData -> plain Chrome brands (no "Electron").
  try {
    const major = (String(navigator.userAgent).match(/Chrome\/(\d+)/) || [])[1] || '124';
    const fullVer =
      (String(navigator.userAgent).match(/Chrome\/([\d.]+)/) || [])[1] || major + '.0.0.0';
    const brands = [
      { brand: 'Chromium', version: major },
      { brand: 'Google Chrome', version: major },
      { brand: 'Not-A.Brand', version: '99' },
    ];
    const fullBrands = [
      { brand: 'Chromium', version: fullVer },
      { brand: 'Google Chrome', version: fullVer },
      { brand: 'Not-A.Brand', version: '99.0.0.0' },
    ];
    const prev = navigator.userAgentData || {};
    const platform = prev.platform || 'Windows';
    const high = {
      architecture: 'x86',
      bitness: '64',
      brands,
      fullVersionList: fullBrands,
      mobile: false,
      model: '',
      platform,
      platformVersion: '15.0.0',
      uaFullVersion: fullVer,
      wow64: false,
    };
    const fake = {
      brands,
      mobile: false,
      platform,
      getHighEntropyValues: (hints) => {
        const out = {};
        for (const h of hints || []) if (h in high) out[h] = high[h];
        out.brands = brands;
        out.mobile = false;
        out.platform = platform;
        return Promise.resolve(out);
      },
      toJSON: () => ({ brands, mobile: false, platform }),
    };
    Object.defineProperty(navigator, 'userAgentData', { get: () => fake, configurable: true });
  } catch (_) { /* ignore */ }

  // 3) window.chrome -> present with a plausible shape. Real Chrome always
  //    exposes window.chrome (runtime/app/loadTimes/csi); its absence is a
  //    classic "embedded/automated browser" signal. We add only the surface
  //    detectors probe — no real privileged APIs.
  try {
    const chrome = window.chrome && typeof window.chrome === 'object' ? window.chrome : {};
    if (!chrome.runtime) chrome.runtime = {};
    if (!chrome.loadTimes) chrome.loadTimes = function () { return {}; };
    if (!chrome.csi) chrome.csi = function () { return {}; };
    if (!chrome.app) {
      chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: function () { return null; },
        getIsInstalled: function () { return false; },
      };
    }
    Object.defineProperty(window, 'chrome', { get: () => chrome, configurable: true });
  } catch (_) { /* ignore */ }
})();
