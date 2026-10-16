import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import main from '../src/main/localapp.js';

// A stand-in for a companion app: answers /ping like DSBooks does, plus a /show
// action endpoint that records that it was hit.
let server, port, shown = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/ping') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ app: 'dsbooks', version: '0.2.0' }));
    } else if (req.url === '/show') {
      shown++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    } else if (req.url === '/notjson') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});

afterAll(() => new Promise((r) => server.close(r)));

const base = () => 'http://127.0.0.1:' + port;

describe('get', () => {
  it('reads a health endpoint and parses its JSON', async () => {
    const r = await main.get(base() + '/ping');
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ app: 'dsbooks', version: '0.2.0' });
  });

  it('hits an action endpoint', async () => {
    const before = shown;
    const r = await main.get(base() + '/show');
    expect(r.ok).toBe(true);
    expect(shown).toBe(before + 1);
  });

  it('reports a non-JSON body as ok with no json rather than throwing', async () => {
    const r = await main.get(base() + '/notjson');
    expect(r.ok).toBe(true);
    expect(r.json).toBeNull();
  });

  it('reports a 404 as not ok', async () => {
    const r = await main.get(base() + '/nope');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });

  it('reports a closed port as not running, without throwing', async () => {
    // Port 1 on loopback: nothing listens there.
    const r = await main.get('http://127.0.0.1:1/ping', 500);
    expect(r.ok).toBe(false);
  });

  it('refuses to fetch anything that is not loopback', async () => {
    for (const url of [
      'http://example.com/ping',
      'http://192.168.1.5/ping',
      'http://localhost.evil.com/ping',
      'file:///etc/passwd',
    ]) {
      const r = await main.get(url);
      expect(r.ok).toBe(false);
      expect(r.error).toBe('not a loopback URL');
    }
  });
});

describe('resolveExe', () => {
  it('finds a file that exists', () => {
    const r = main.resolveExe(process.execPath);
    expect(r.exists).toBe(true);
    expect(r.path).toBe(process.execPath);
  });

  it('reports a missing file, keeping the path it looked for', () => {
    const p = path.join(os.tmpdir(), 'deskhatch-no-such-app-xyz');
    const r = main.resolveExe(p);
    expect(r.exists).toBe(false);
    expect(r.path).toBe(p);
  });

  it('does not treat a directory as an executable', () => {
    const r = main.resolveExe(os.tmpdir());
    expect(r.exists).toBe(false);
  });

  it('expands environment variables before looking', () => {
    const saved = process.env.DESKHATCH_TEST_DIR;
    process.env.DESKHATCH_TEST_DIR = path.dirname(process.execPath);
    try {
      const r = main.resolveExe('%DESKHATCH_TEST_DIR%' + path.sep + path.basename(process.execPath));
      expect(r.exists).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.DESKHATCH_TEST_DIR; else process.env.DESKHATCH_TEST_DIR = saved;
    }
  });

  it('handles an empty path', () => {
    expect(main.resolveExe('')).toEqual({ path: '', exists: false });
  });
});

describe('launch', () => {
  it('refuses a path that is not there, rather than spawning a shell', () => {
    const r = main.launch(path.join(os.tmpdir(), 'deskhatch-no-such-app-xyz'), ['--background']);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not found');
  });

  it('starts a real executable with its arguments', async () => {
    // node writes a marker file, proving argv reached the child and that the
    // child outlives this call (it is detached and unref'd).
    const marker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dh-launch-')), 'ran.txt');
    const r = main.launch(process.execPath, ['-e', `require("fs").writeFileSync(${JSON.stringify(marker)}, "ok")`]);
    expect(r.ok).toBe(true);
    for (let i = 0; i < 100 && !fs.existsSync(marker); i++) await new Promise((res) => setTimeout(res, 50));
    expect(fs.readFileSync(marker, 'utf8')).toBe('ok');
  });

  it('passes arguments as argv, so shell metacharacters are inert', async () => {
    // If this went through a shell, the `;` would run a second command and the
    // file would contain something other than the literal string.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-launch-'));
    const marker = path.join(dir, 'arg.txt');
    const nasty = 'a; echo pwned > ' + path.join(dir, 'pwned.txt');
    const r = main.launch(process.execPath, ['-e', `require("fs").writeFileSync(${JSON.stringify(marker)}, process.argv[1])`, nasty]);
    expect(r.ok).toBe(true);
    for (let i = 0; i < 100 && !fs.existsSync(marker); i++) await new Promise((res) => setTimeout(res, 50));
    expect(fs.readFileSync(marker, 'utf8')).toBe(nasty);
    expect(fs.existsSync(path.join(dir, 'pwned.txt'))).toBe(false);
  });
});
