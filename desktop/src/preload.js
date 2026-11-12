'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('fabtice', {
  systemInfo: () => ipcRenderer.invoke('fabtice:system'),
  ytdlpStatus: () => ipcRenderer.invoke('fabtice:ytdlp-status'),
  ytdlpCheck: (force = false) => ipcRenderer.invoke('fabtice:ytdlp-check', Boolean(force)),
  ytdlpInstall: () => ipcRenderer.invoke('fabtice:ytdlp-install'),
  extract: (link) => ipcRenderer.invoke('fabtice:extract', String(link)),
  copyText: (text) => ipcRenderer.invoke('fabtice:copy', String(text)),
  onYtdlpProgress: (cb) => subscribe('fabtice:ytdlp-progress', cb),
  onExtractProgress: (cb) => subscribe('fabtice:extract-progress', cb),
});
