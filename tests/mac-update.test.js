import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import mac from '../src/main/mac-update.js';

const asset = (name, size = 1) => ({ name, size, browser_download_url: 'https://example.invalid/' + name });

describe('pickAsset', () => {
  it('picks the universal zip out of a release', () => {
    const rel = { assets: [
      asset('DeskHatch-Setup-0.1.72-x64.exe'),
      asset('DeskHatch-0.1.72-universal.dmg'),
      asset('DeskHatch-0.1.72-universal.zip'),
    ] };
    expect(mac.pickAsset(rel).name).toBe('DeskHatch-0.1.72-universal.zip');
  });

  it('does not mistake the dmg for the zip', () => {
    expect(mac.pickAsset({ assets: [asset('DeskHatch-0.1.72-universal.dmg')] })).toBeNull();
  });

  it('returns null for a release with no assets', () => {
    expect(mac.pickAsset({ assets: [] })).toBeNull();
    expect(mac.pickAsset({})).toBeNull();
  });
});

describe('bundleVersion', () => {
  const withPlist = (body) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-test-'));
    fs.mkdirSync(path.join(dir, 'Contents'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Contents', 'Info.plist'), body);
    return dir;
  };

  it('reads CFBundleShortVersionString', () => {
    const dir = withPlist(`<plist><dict>
      <key>CFBundleVersion</key><string>0.1.72</string>
      <key>CFBundleShortVersionString</key><string>0.1.72</string>
    </dict></plist>`);
    expect(mac.bundleVersion(dir)).toBe('0.1.72');
  });

  it('keeps a prerelease suffix intact', () => {
    const dir = withPlist('<plist><dict><key>CFBundleShortVersionString</key><string>0.1.72-beta.1</string></dict></plist>');
    expect(mac.bundleVersion(dir)).toBe('0.1.72-beta.1');
  });

  it('returns an empty string when there is no readable plist', () => {
    expect(mac.bundleVersion('/nonexistent/DeskHatch.app')).toBe('');
  });
});
