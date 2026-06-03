'use strict';

// File-system access for the "My Documents" browser drawer. All privileged
// operations live here in the main process; the renderer talks to them through
// the `files` bridge in preload.js (contextIsolation stays on).

const { ipcMain, shell, clipboard, dialog, Menu, app } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

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

  // Resolve a well-known location ("@desktop", "@pc", ...) to a real path.
  ipcMain.handle('files:special', (_e, key) => {
    if (key === 'pc') return PC;
    try { return app.getPath(key); } catch (_) { return PC; }
  });

  ipcMain.handle('files:open', (_e, p) => shell.openPath(p));
  ipcMain.handle('files:reveal', (_e, p) => { shell.showItemInFolder(p); return true; });
  ipcMain.handle('files:copy-path', (_e, p) => { clipboard.writeText(p); return true; });

  ipcMain.handle('files:pick-folder', async () => {
    const r = await dialog.showOpenDialog(getWin(), { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('files:copy-to', async (_e, src, destDir) => {
    const dest = path.join(destDir, path.basename(src));
    await fsp.copyFile(src, dest);
    return dest;
  });

  ipcMain.handle('files:trash', async (_e, p) => { await shell.trashItem(p); return true; });

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
