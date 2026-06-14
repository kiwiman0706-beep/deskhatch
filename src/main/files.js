'use strict';

// File-system access for the "My Documents" browser drawer. All privileged
// operations live here in the main process; the renderer talks to them through
// the `files` bridge in preload.js (contextIsolation stays on).

const { ipcMain, shell, clipboard, dialog, Menu, app, nativeImage, net } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
function downloadBuf(url, cap) {
  return new Promise((resolve, reject) => {
    try {
      const req = net.request(url);
      req.on('response', (res) => {
        if (res.statusCode >= 400) { reject(new Error('http ' + res.statusCode)); return; }
        const ct = String(res.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
        const chunks = []; let size = 0;
        res.on('data', (d) => { size += d.length; if (size > (cap || 8 * 1024 * 1024)) { try { req.abort(); } catch (_) {} reject(new Error('too big')); return; } chunks.push(d); });
        res.on('end', () => resolve({ buf: Buffer.concat(chunks), mime: ct }));
      });
      req.on('error', reject);
      req.end();
    } catch (e) { reject(e); }
  });
}
function extFromMime(mime, url) {
  const m = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/bmp': '.bmp', 'image/avif': '.avif' };
  if (m[mime]) return m[mime];
  const x = String(url).split('?')[0].match(/\.(jpe?g|png|gif|webp|svg|bmp|avif)$/i);
  return x ? '.' + x[1].toLowerCase().replace('jpeg', 'jpg') : '.img';
}

const PC = '::pc'; // virtual root: "This PC" (drive list)

function listDrives() {
  const drives = [];
  for (let c = 65; c <= 90; c++) {
    const p = String.fromCharCode(c) + ':\\';
    try {
      fs.accessSync(p);
      drives.push({ name: String.fromCharCode(c) + ':', path: p, isDir: true, isFile: false });
    } catch (_) {
      /* drive not present */
    }
  }
  return drives;
}

async function listDir(dir) {
  if (dir === PC) {
    const entries = process.platform === 'win32'
      ? listDrives()
      : [{ name: '/', path: '/', isDir: true, isFile: false }];
    return { path: PC, parent: null, entries };
  }

  const dirents = await fsp.readdir(dir, { withFileTypes: true });
  const entries = [];
  for (const d of dirents) {
    let isDir = d.isDirectory();
    let isFile = d.isFile();
    if (d.isSymbolicLink()) {
      try {
        const st = fs.statSync(path.join(dir, d.name));
        isDir = st.isDirectory();
        isFile = st.isFile();
      } catch (_) { /* dangling link */ }
    }
    entries.push({
      name: d.name,
      path: path.join(dir, d.name),
      isDir,
      isFile,
      ext: path.extname(d.name).toLowerCase(),
    });
  }
  // folders first, then files, both alphabetical (Japanese-aware)
  entries.sort((a, b) =>
    a.isDir === b.isDir ? a.name.localeCompare(b.name, 'ja') : a.isDir ? -1 : 1);

  let parent = path.dirname(dir);
  if (parent === dir) parent = PC; // at a drive root -> go up to "This PC"
  return { path: dir, parent, entries };
}

async function getIcon(p) {
  try {
    const img = await app.getFileIcon(p, { size: 'small' });
    return img.isEmpty() ? null : img.toDataURL();
  } catch (_) {
    return null;
  }
}

function register(getWin) {
  ipcMain.handle('files:list', (_e, dir) =>
    listDir(dir).catch((err) => ({ error: err.message, path: dir, entries: [] })));

  ipcMain.handle('files:places', () => {
    const places = [{ name: 'PC', path: PC, icon: '🖥' }];
    const add = (name, key, icon) => {
      try { places.push({ name, path: app.getPath(key), icon }); } catch (_) { /* not available */ }
    };
    add('デスクトップ', 'desktop', '🖳');
    add('ドキュメント', 'documents', '📄');
    add('ダウンロード', 'downloads', '📥');
    add('ホーム', 'home', '🏠');
    return places;
  });

  ipcMain.handle('files:icon', (_e, p) => getIcon(p));

  // Resolve a well-known location ("@desktop", "@pc", "@apps", ...) to a path.
  const startMenuPrograms = () =>
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  ipcMain.handle('files:special', (_e, key) => {
    if (key === 'pc') return PC;
    // Installed-apps folder, per OS: Windows Start Menu programs / macOS Applications.
    if (key === 'apps') {
      if (process.platform === 'win32') return startMenuPrograms();
      if (process.platform === 'darwin') return '/Applications';
      try { return app.getPath('home'); } catch (_) { return PC; }
    }
    if (key === 'startmenu') return startMenuPrograms();
    if (key === 'applications') return '/Applications';
    try { return app.getPath(key); } catch (_) { return PC; }
  });

  // Classic Start Menu: read the Programs tree(s) recursively and return a
  // nested {name, path, isDir, children?} structure. On Windows the all-users
  // (ProgramData) and per-user (AppData) menus are merged by folder name, just
  // like the real Start Menu. macOS falls back to /Applications.
  const menuRoots = () => {
    if (process.platform === 'win32') {
      const r = [startMenuPrograms()];
      try { r.push(path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')); } catch (_) {}
      return r;
    }
    if (process.platform === 'darwin') return ['/Applications'];
    return [];
  };
  const APP_EXTS = new Set(['.lnk', '.url', '.exe', '.appref-ms', '.bat', '.cmd', '.msc', '.com']);
  function readMenuNode(dir, depth) {
    let dirents;
    try { dirents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
    const items = [];
    for (const d of dirents) {
      const full = path.join(dir, d.name);
      let isDir = d.isDirectory();
      if (d.isSymbolicLink()) { try { isDir = fs.statSync(full).isDirectory(); } catch (_) { continue; } }
      if (isDir) {
        if (process.platform === 'darwin' && /\.app$/i.test(d.name)) { items.push({ name: d.name.replace(/\.app$/i, ''), path: full, isDir: false }); continue; }
        const children = depth > 0 ? readMenuNode(full, depth - 1) : [];
        items.push({ name: d.name, path: full, isDir: true, children });
      } else {
        const ext = path.extname(d.name).toLowerCase();
        if (process.platform === 'win32' && !APP_EXTS.has(ext)) continue;
        if (/^(uninstall|アンインストール|setup|readme|license|help)\b/i.test(d.name)) continue;
        items.push({ name: d.name.replace(/\.(lnk|url|appref-ms)$/i, ''), path: full, isDir: false });
      }
    }
    return items;
  }
  function mergeMenu(a, b) {
    const out = a.slice();
    for (const it of b) {
      if (it.isDir) {
        const ex = out.find((x) => x.isDir && x.name.toLowerCase() === it.name.toLowerCase());
        if (ex) ex.children = mergeMenu(ex.children || [], it.children || []);
        else out.push(it);
      } else if (!out.some((x) => !x.isDir && x.name.toLowerCase() === it.name.toLowerCase())) {
        out.push(it);
      }
    }
    return out;
  }
  function sortMenu(items) {
    items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, 'ja') : a.isDir ? -1 : 1));
    items.forEach((i) => { if (i.children) sortMenu(i.children); });
    return items;
  }
  ipcMain.handle('files:menu-tree', () => {
    try {
      let tree = [];
      for (const r of menuRoots()) tree = mergeMenu(tree, readMenuNode(r, 5));
      return sortMenu(tree);
    } catch (_) { return []; }
  });

  ipcMain.handle('files:stat', (_e, p) => {
    try {
      const st = fs.statSync(p);
      return { isDir: st.isDirectory(), isFile: st.isFile(), name: path.basename(p), ext: path.extname(p).toLowerCase() };
    } catch (_) {
      return { error: true, name: path.basename(p || '') };
    }
  });

  ipcMain.handle('files:read-text', async (_e, p) => {
    try {
      const buf = await fsp.readFile(p);
      return buf.slice(0, 1024 * 1024).toString('utf8'); // up to 1MB
    } catch (e) {
      return '（読み込めません: ' + (e && e.message) + '）';
    }
  });

  ipcMain.handle('files:open', (_e, p) => shell.openPath(p));
  ipcMain.handle('files:reveal', (_e, p) => { shell.showItemInFolder(p); return true; });
  ipcMain.handle('files:copy-path', (_e, p) => { clipboard.writeText(p); return true; });

  ipcMain.handle('files:pick-files', async () => {
    const r = await dialog.showOpenDialog(getWin(), { properties: ['openFile', 'multiSelections'] });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle('files:pick-folder', async () => {
    const r = await dialog.showOpenDialog(getWin(), { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('files:write-path', async (_e, p, text) => {
    try { await fsp.writeFile(p, text == null ? '' : String(text), 'utf8'); return true; } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('files:mkdir', async (_e, p) => {
    try { await fsp.mkdir(p, { recursive: true }); return true; } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('files:copy-to', async (_e, src, destDir) => {
    const dest = path.join(destDir, path.basename(src));
    await fsp.copyFile(src, dest);
    return dest;
  });

  // Download a remote image and return it as a data: URI (for self-contained
  // web-clips). Capped to keep clips reasonable; returns null on any failure.
  ipcMain.handle('files:fetch-data-uri', async (_e, url) => {
    try {
      if (!/^https?:\/\//i.test(String(url || ''))) return null;
      const { buf, mime } = await downloadBuf(url);
      if (!buf || !buf.length) return null;
      return 'data:' + (mime || 'application/octet-stream') + ';base64,' + buf.toString('base64');
    } catch (_) { return null; }
  });
  // Download a remote image into destDir and return the saved file name (for
  // Markdown clips that reference images by relative path).
  ipcMain.handle('files:fetch-asset', async (_e, url, destDir) => {
    try {
      if (!/^https?:\/\//i.test(String(url || ''))) return null;
      const { buf, mime } = await downloadBuf(url);
      if (!buf || !buf.length) return null;
      const name = crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 16) + extFromMime(mime, url);
      await fsp.mkdir(destDir, { recursive: true });
      await fsp.writeFile(path.join(destDir, name), buf);
      return name;
    } catch (_) { return null; }
  });

  ipcMain.handle('files:trash', async (_e, p) => { await shell.trashItem(p); return true; });

  // Drag a file out of the app to the OS (Explorer / other apps).
  ipcMain.on('files:start-drag', (e, p) => {
    try {
      const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
      e.sender.startDrag({ file: p, icon });
    } catch (_) { /* ignore */ }
  });

  ipcMain.handle('files:open-text', async () => {
    const r = await dialog.showOpenDialog(getWin(), {
      properties: ['openFile'],
      filters: [{ name: '設定', extensions: ['json', 'txt'] }, { name: 'すべて', extensions: ['*'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    try { return (await fsp.readFile(r.filePaths[0])).toString('utf8'); } catch (_) { return null; }
  });

  ipcMain.handle('files:save-text', async (_e, text) => {
    const r = await dialog.showSaveDialog(getWin(), {
      filters: [{ name: 'テキスト', extensions: ['txt'] }, { name: 'すべて', extensions: ['*'] }],
    });
    if (r.canceled) return null;
    await fsp.writeFile(r.filePath, text, 'utf8');
    return r.filePath;
  });

  // Native right-click menu. Returns the chosen action string (or null); the
  // renderer then awaits the matching operation so it can refresh afterwards.
  ipcMain.handle('files:context-menu', (_e, info) => new Promise((resolve) => {
    let picked = null;
    const tmpl = [
      { label: '開く', click: () => { picked = 'open'; } },
      { label: 'エクスプローラーで表示', click: () => { picked = 'reveal'; } },
      { type: 'separator' },
      { label: 'パスをコピー', click: () => { picked = 'copy-path'; } },
    ];
    if (info.isFile) {
      tmpl.push({ label: 'コピー…（フォルダを選んで）', click: () => { picked = 'copy-to'; } });
    }
    tmpl.push({ type: 'separator' }, { label: 'ゴミ箱に移動', click: () => { picked = 'trash'; } });
    const menu = Menu.buildFromTemplate(tmpl);
    menu.popup({ window: getWin(), callback: () => resolve(picked) });
  }));
}

module.exports = { register };
