'use strict';

// Launchers for Windows system locations + a clipboard reader. All targets are
// a fixed whitelist (no arbitrary commands from the renderer).

const { ipcMain, shell, clipboard } = require('electron');
const { exec } = require('child_process');

function run(cmd) {
  exec(cmd, { windowsHide: true }, () => {}); // best-effort; cmd.exe handles `start`/shell verbs
}

const TARGETS = {
  settings: () => shell.openExternal('ms-settings:'),
  control: () => run('control'),
  devmgr: () => run('start "" devmgmt.msc'),
  godmode: () => run('explorer shell:::{ED7BA470-8E54-465E-825C-99712043E01C}'),
  printers: () => run('control printers'),
  scanners: () => shell.openExternal('ms-settings:printers'),
};

function register() {
  ipcMain.handle('system:open', (_e, key) => {
    if (process.platform !== 'win32') return false;
    const fn = TARGETS[key];
    if (!fn) return false;
    try { fn(); return true; } catch (_) { return false; }
  });

  ipcMain.handle('system:clipboard', () => {
    const img = clipboard.readImage();
    return { text: clipboard.readText(), image: img.isEmpty() ? null : img.toDataURL() };
  });
}

module.exports = { register };
