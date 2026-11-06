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

  // Every native dependency we asarUnpack ships prebuilt binaries that are the
  // same in both halves of the universal build, and @electron/universal refuses
  // to merge an identical Mach-O unless it is declared. Two separate files hit
  // this while releasing v0.1.73-beta.1: ffmpeg-static's ffmpeg (one binary for
  // whichever arch ran npm install) and koffi's darwin_arm64/darwin_x64
  // koffi.node (correctly per-arch by directory, so identical across builds).
  //
  // The pattern covers app.asar.unpacked rather than naming files, so adding a
  // native dependency does not break the mac build. It deliberately does NOT
  // reach Electron's own binaries, which really do differ per arch and must
  // still be lipo'd. See docs/KNOWN-ISSUES.md.
  it('declares the unpacked native binaries so the universal merge can proceed', async () => {
    const c = await getConfig(process.cwd(), null, null);
    expect(c.mac.x64ArchFiles).toBe('**/app.asar.unpacked/**');
  });

  it('covers every unpacked native binary, and nothing of Electron itself', async () => {
    const { minimatch } = await import('minimatch');
    const c = await getConfig(process.cwd(), null, null);
    const m = (p) => minimatch(p, c.mac.x64ArchFiles, { matchBase: true });
    const unpacked = 'Contents/Resources/app.asar.unpacked/node_modules/';
    for (const p of [
      unpacked + 'ffmpeg-static/ffmpeg',
      unpacked + 'koffi/build/koffi/darwin_arm64/koffi.node',
      unpacked + 'koffi/build/koffi/darwin_x64/koffi.node',
    ]) expect(m(p), p).toBe(true);
    for (const p of [
      'Contents/MacOS/DeskHatch',
      'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework',
      'Contents/Frameworks/DeskHatch Helper (GPU).app/Contents/MacOS/DeskHatch Helper (GPU)',
    ]) expect(m(p), p).toBe(false);
  });
});
