'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browser', {
  open: (url) => ipcRenderer.invoke('tabs:open', url),
  activate: (id) => ipcRenderer.invoke('tabs:activate', id),
  close: (id) => ipcRenderer.invoke('tabs:close', id),
  list: () => ipcRenderer.invoke('tabs:list'),
  engineInfo: () => ipcRenderer.invoke('engine:info'),
  onTabs: (cb) => ipcRenderer.on('tabs:changed', (_e, tabs) => cb(tabs)),
});
