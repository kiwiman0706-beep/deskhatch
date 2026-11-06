import { describe, it, expect } from 'vitest';
import { getConfig, validateConfiguration } from 'app-builder-lib/out/util/config/config.js';
import { DebugLogger } from 'builder-util';

// The v0.1.73-beta.1 release failed in CI with "configuration.win should be one
// of these: null" — package.json carried win.publisherName, which electron-
// builder 26 moved under win.signtoolOptions, and WindowsConfiguration sets
// additionalProperties: false.
//
// It should not have reached CI. The check run before the upgrade only called
// getConfig(), which loads and merges the config but does not validate it
// against the schema; the schema check lives in validateConfiguration(), which
// Packager.build() calls. Loading a bad config succeeds. So this runs the real
// validator on the real build config, which is the thing that actually gates a
// release.
describe('electron-builder build config', () => {
  it('passes the installed electron-builder schema validator', async () => {
    const config = await getConfig(process.cwd(), null, null);
    // Throws an "Invalid configuration object" error listing the bad keys.
    await expect(validateConfiguration(config, new DebugLogger(false))).resolves.not.toThrow();
  });

  it('keeps the macOS signing settings the ad-hoc/notarized build depends on', async () => {
    const c = await getConfig(process.cwd(), null, null);
    expect(c.mac.hardenedRuntime).toBe(true);
    expect(c.mac.entitlements).toBe('build/entitlements.mac.plist');
    expect(c.mac.entitlementsInherit).toBe('build/entitlements.mac.inherit.plist');
    expect(c.afterPack).toBe('scripts/mac-adhoc-sign.js');
  });

  it('still builds the Windows and macOS targets the release workflow uploads', async () => {
    const c = await getConfig(process.cwd(), null, null);
    expect(c.win.target).toEqual(['nsis', 'portable']);
    expect(c.mac.target).toEqual(['dmg', 'zip']);
  });

  // ffmpeg-static fetches ONE binary for the machine running npm install, so on
  // the arm64 macOS runner both halves of the universal build get the same
  // arm64 ffmpeg. @electron/universal refuses to merge an identical Mach-O
  // unless it is declared, which is what broke the v0.1.73-beta.1 mac build.
  // Verified against the shipped v0.1.72-beta.2: its bundled ffmpeg is already
  // a single-arch arm64 binary, so this declaration restores the previous
  // behaviour rather than introducing a regression. See docs/KNOWN-ISSUES.md.
  it('declares the single-arch ffmpeg so the universal merge can proceed', async () => {
    const c = await getConfig(process.cwd(), null, null);
    expect(c.mac.x64ArchFiles).toBe('**/ffmpeg-static/ffmpeg');
  });
});
