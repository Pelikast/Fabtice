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
  lastImportReport: () => ipcRenderer.invoke('fabtice:last-import-report'),
  reportSeparation: (text) => ipcRenderer.invoke('fabtice:separation-report', String(text)),
  lastSeparationReport: () => ipcRenderer.invoke('fabtice:last-separation-report'),
  copyText: (text) => ipcRenderer.invoke('fabtice:copy', String(text)),
  openInIRealPro: (link) => ipcRenderer.invoke('fabtice:open-ireal', String(link)),
  onYtdlpProgress: (cb) => subscribe('fabtice:ytdlp-progress', cb),
  onExtractProgress: (cb) => subscribe('fabtice:extract-progress', cb),
});
