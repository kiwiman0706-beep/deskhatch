import { describe, it, expect } from 'vitest';
import hook from '../scripts/mac-adhoc-sign.js';

const { appToAdhocSign } = hook;
const mac = (appOutDir) => ({ electronPlatformName: 'darwin', appOutDir, productFilename: 'DeskHatch' });

describe('appToAdhocSign', () => {
  it('signs the packaged app on a Mac with no certificate', () => {
    expect(appToAdhocSign(mac('dist/mac-universal'), {}, 'darwin'))
      .toBe('dist/mac-universal/DeskHatch.app');
  });

  it('skips the per-arch halves of a universal build', () => {
    expect(appToAdhocSign(mac('dist/mac-universal-x64-temp'), {}, 'darwin')).toBeNull();
    expect(appToAdhocSign(mac('dist/mac-universal-arm64-temp'), {}, 'darwin')).toBeNull();
  });

  it('stands aside when a Developer ID certificate is configured', () => {
    expect(appToAdhocSign(mac('dist/mac-universal'), { CSC_LINK: 'base64...' }, 'darwin')).toBeNull();
    expect(appToAdhocSign(mac('dist/mac-universal'), { CSC_NAME: 'Developer ID Application: X' }, 'darwin')).toBeNull();
  });

  it('does nothing for Windows and Linux packs', () => {
    expect(appToAdhocSign({ ...mac('dist/win-unpacked'), electronPlatformName: 'win32' }, {}, 'darwin')).toBeNull();
    expect(appToAdhocSign({ ...mac('dist/linux-unpacked'), electronPlatformName: 'linux' }, {}, 'darwin')).toBeNull();
  });

  it('does nothing when the build host has no codesign', () => {
    expect(appToAdhocSign(mac('dist/mac-universal'), {}, 'linux')).toBeNull();
    expect(appToAdhocSign(mac('dist/mac-universal'), {}, 'win32')).toBeNull();
  });
});
