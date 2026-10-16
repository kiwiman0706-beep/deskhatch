import { describe, it, expect } from 'vitest';
import la from '../src/renderer/lib/localapp.js';

describe('isLoopback', () => {
  it('accepts the loopback addresses a companion app may serve on', () => {
    expect(la.isLoopback('http://127.0.0.1:47817/')).toBe(true);
    expect(la.isLoopback('http://localhost:8080/x')).toBe(true);
    expect(la.isLoopback('http://[::1]:3000/')).toBe(true);
    expect(la.isLoopback('https://127.0.0.1:443/')).toBe(true);
  });

  it('rejects anything that would reach off this machine', () => {
    expect(la.isLoopback('http://192.168.1.5:47817/')).toBe(false);
    expect(la.isLoopback('http://example.com/')).toBe(false);
    // A hostname that merely starts with the loopback name is not loopback.
    expect(la.isLoopback('http://localhost.evil.com/')).toBe(false);
    expect(la.isLoopback('http://127.0.0.1.evil.com/')).toBe(false);
  });

  it('rejects non-HTTP schemes and junk', () => {
    expect(la.isLoopback('file:///etc/passwd')).toBe(false);
    expect(la.isLoopback('ftp://127.0.0.1/')).toBe(false);
    expect(la.isLoopback('javascript:alert(1)')).toBe(false);
    expect(la.isLoopback('')).toBe(false);
    expect(la.isLoopback(null)).toBe(false);
  });
});

describe('endpoint', () => {
  it('resolves a relative health path against the drawer url', () => {
    expect(la.endpoint('http://127.0.0.1:47817/', '/ping')).toBe('http://127.0.0.1:47817/ping');
    expect(la.endpoint('http://127.0.0.1:47817/shelf/', 'show')).toBe('http://127.0.0.1:47817/shelf/show');
  });

  it('returns empty for a missing path', () => {
    expect(la.endpoint('http://127.0.0.1:47817/', '')).toBe('');
  });
});

describe('expandEnv', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\k\\AppData\\Local', HOME: '/Users/k' };

  it('expands a Windows %VAR%', () => {
    expect(la.expandEnv('%LOCALAPPDATA%\\Programs\\DSBooks\\DSBooks.exe', env))
      .toBe('C:\\Users\\k\\AppData\\Local\\Programs\\DSBooks\\DSBooks.exe');
  });

  it('matches the variable name case-insensitively, as Windows does', () => {
    expect(la.expandEnv('%localappdata%\\x.exe', env)).toBe('C:\\Users\\k\\AppData\\Local\\x.exe');
  });

  it('leaves an unknown variable alone so the error can show it', () => {
    expect(la.expandEnv('%NOPE%\\x.exe', env)).toBe('%NOPE%\\x.exe');
  });

  it('expands a leading ~', () => {
    expect(la.expandEnv('~/Apps/Thing', env)).toBe('/Users/k/Apps/Thing');
  });
});

describe('matchExpect', () => {
  it('accepts a health body carrying the expected keys', () => {
    expect(la.matchExpect({ app: 'dsbooks', version: '0.2.0' }, { app: 'dsbooks' })).toBe(true);
  });

  it('rejects another process that happens to hold the port', () => {
    expect(la.matchExpect({ app: 'something-else' }, { app: 'dsbooks' })).toBe(false);
    expect(la.matchExpect({}, { app: 'dsbooks' })).toBe(false);
    expect(la.matchExpect(null, { app: 'dsbooks' })).toBe(false);
  });

  it('accepts anything when nothing is expected', () => {
    expect(la.matchExpect(null, null)).toBe(true);
    expect(la.matchExpect(null, {})).toBe(true);
  });
});

describe('launchSpecFor / isSupported', () => {
  const tab = {
    launch: { win32: { exe: 'A.exe', args: ['--background'] }, mac: { exe: '/Applications/A.app' } },
    platforms: ['win32'],
  };

  it('picks the spec for the running platform, accepting the short aliases', () => {
    expect(la.launchSpecFor(tab, 'win32').exe).toBe('A.exe');
    expect(la.launchSpecFor(tab, 'darwin').exe).toBe('/Applications/A.app');
    expect(la.launchSpecFor(tab, 'linux')).toBeNull();
    expect(la.launchSpecFor({}, 'win32')).toBeNull();
  });

  it('hides a drawer on a platform its app does not ship for', () => {
    expect(la.isSupported(tab, 'win32')).toBe(true);
    expect(la.isSupported(tab, 'darwin')).toBe(false);
  });

  it('shows a drawer everywhere when platforms is omitted', () => {
    expect(la.isSupported({}, 'darwin')).toBe(true);
    expect(la.isSupported({ platforms: [] }, 'darwin')).toBe(true);
  });
});

describe('nextStep', () => {
  it('shows the UI when the app is already answering', () => {
    expect(la.nextStep({ healthy: true, hasLaunchSpec: false, exePath: '' })).toBe('show');
  });

  it('launches when it is not running but we know the executable', () => {
    expect(la.nextStep({ healthy: false, hasLaunchSpec: true, exePath: 'A.exe' })).toBe('launch');
  });

  it('asks for the path when the executable is not where we expected', () => {
    expect(la.nextStep({ healthy: false, hasLaunchSpec: true, exePath: '' })).toBe('missing');
    expect(la.nextStep({ healthy: false, hasLaunchSpec: true, exePath: 'A.exe', exeExists: false })).toBe('missing');
  });

  it('reports unsupported when there is no launch spec for this platform', () => {
    expect(la.nextStep({ healthy: false, hasLaunchSpec: false, exePath: '' })).toBe('unsupported');
  });
});

describe('pollDelays', () => {
  it('covers roughly the requested window', () => {
    const d = la.pollDelays(15000);
    const total = d.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(15000);
    expect(total).toBeLessThan(17000);
  });

  it('probes quickly at first, so an already-warm app shows almost at once', () => {
    expect(la.pollDelays(15000)[0]).toBeLessThanOrEqual(200);
  });

  it('settles to a steady interval rather than spinning', () => {
    const d = la.pollDelays(15000);
    expect(d[d.length - 1]).toBe(1000);
  });

  it('returns nothing for a zero budget', () => {
    expect(la.pollDelays(0)).toEqual([]);
  });
});
