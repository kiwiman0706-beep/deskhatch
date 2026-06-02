'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  platform: process.platform,

  // Toggle click pass-through. When `ignore` is true, mouse events fall through
  // the (transparent) overlay to the desktop below.
  setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore-mouse', ignore),

  // Ask the main process to resize the overlay window to fit the open drawers,
  // so the desktop below stays clickable where nothing is shown.
  setHeight: (height) => ipcRenderer.send('overlay:set-height', height),

  // Resolve the absolute path of a dropped File (Electron removed File.path).
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (_) {
      return (file && file.path) || '';
    }
  },
});

// File browser bridge for the "My Documents" drawer.
contextBridge.exposeInMainWorld('files', {
  list: (dir) => ipcRenderer.invoke('files:list', dir),
  places: () => ipcRenderer.invoke('files:places'),
  icon: (p) => ipcRenderer.invoke('files:icon', p),
  open: (p) => ipcRenderer.invoke('files:open', p),
  reveal: (p) => ipcRenderer.invoke('files:reveal', p),
  copyPath: (p) => ipcRenderer.invoke('files:copy-path', p),
  pickFolder: () => ipcRenderer.invoke('files:pick-folder'),
  copyTo: (src, dir) => ipcRenderer.invoke('files:copy-to', src, dir),
  trash: (p) => ipcRenderer.invoke('files:trash', p),
  contextMenu: (info) => ipcRenderer.invoke('files:context-menu', info),
});

// Google sign-in helper (shared session for all embedded pages).
contextBridge.exposeInMainWorld('auth', {
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
});
