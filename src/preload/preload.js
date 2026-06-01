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
