'use strict';

// Runs in the Google sign-in window (contextIsolation:false) BEFORE the page's
// own scripts. Even when the User-Agent string is a real Chrome one, Electron
// still leaks the "Electron" brand through User-Agent Client Hints
// (navigator.userAgentData) and may expose navigator.webdriver — both of which
// Google's sign-in reads to flag us as an unsupported / embedded browser.
// We hide those so an ordinary Chrome is reported instead.

(function disguise() {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  } catch (_) { /* ignore */ }

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
})();
