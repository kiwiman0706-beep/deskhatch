import { describe, it, expect } from 'vitest';
import updater from '../src/main/updater.js';

const { pickRelease, isNewer } = updater;

const rel = (tag, { prerelease = false, draft = false, mac = true } = {}) => ({
  tag_name: tag,
  prerelease,
  draft,
  assets: [
    { name: 'DeskHatch-Setup-' + tag.replace(/^v/, '') + '-x64.exe' },
    ...(mac ? [{ name: 'DeskHatch-' + tag.replace(/^v/, '') + '-universal.zip' }] : []),
  ],
});

describe('pickRelease', () => {
  const list = [
    rel('v0.1.72-beta.1', { prerelease: true, mac: false }), // macOS job failed
    rel('v0.1.71-beta.2', { prerelease: true }),
    rel('v0.1.66'),
  ];

  it('skips a release with no macOS asset when one is required', () => {
    expect(pickRelease(list, true, true).tag_name).toBe('v0.1.71-beta.2');
  });

  it('still offers that release where the macOS asset is irrelevant', () => {
    expect(pickRelease(list, true, false).tag_name).toBe('v0.1.72-beta.1');
  });

  it('skips prereleases on the stable channel', () => {
    expect(pickRelease(list, false, true).tag_name).toBe('v0.1.66');
  });

  it('skips drafts', () => {
    const withDraft = [rel('v0.1.73', { draft: true }), ...list];
    expect(pickRelease(withDraft, false, true).tag_name).toBe('v0.1.66');
  });

  it('returns null rather than throwing on a bad response', () => {
    expect(pickRelease(null, true, true)).toBeNull();
    expect(pickRelease({ message: 'rate limited' }, true, true)).toBeNull();
    expect(pickRelease([], true, true)).toBeNull();
  });
});

describe('isNewer', () => {
  it('sees a newer patch, and not an older one', () => {
    expect(isNewer('0.1.71', '0.1.72')).toBe(true);
    expect(isNewer('0.1.72', '0.1.71')).toBe(false);
    expect(isNewer('0.1.72', '0.1.72')).toBe(false);
  });

  it('orders betas of the same version', () => {
    expect(isNewer('0.1.72-beta.1', '0.1.72-beta.2')).toBe(true);
    expect(isNewer('0.1.72-beta.2', '0.1.72-beta.1')).toBe(false);
  });

  it('treats a stable release as newer than its own beta', () => {
    expect(isNewer('0.1.72-beta.2', '0.1.72')).toBe(true);
    expect(isNewer('0.1.72', '0.1.72-beta.2')).toBe(false);
  });
});
