'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
  standardsFetchText: (url) => ipcRenderer.invoke('fabtice:standards-fetch', String(url)),
  copyText: (text) => ipcRenderer.invoke('fabtice:copy', String(text)),
  openInIRealPro: (link) => ipcRenderer.invoke('fabtice:open-ireal', String(link)),
  printChart: (options) => ipcRenderer.invoke('fabtice:print-chart', options),
  saveChartPdf: (options) => ipcRenderer.invoke('fabtice:save-chart-pdf', options),
  pendingProjects: () => ipcRenderer.invoke('fabtice:pending-projects'),
  readProjectFile: (token, offset, length) => ipcRenderer.invoke('fabtice:read-project', String(token), Number(offset), Number(length)),
  releaseProjectFile: (token) => ipcRenderer.invoke('fabtice:release-project', String(token)),
  onOpenProject: (cb) => subscribe('fabtice:open-project', cb),
  // The audio journal (audio-journal.js) and the Mac's power events (power-events.js).
  audioJournalAdd: (entry) => ipcRenderer.invoke('fabtice:audio-journal-add', {
    event: String(entry && entry.event),
    text: String(entry && entry.text),
    sticky: Boolean(entry && entry.sticky),
  }),
  audioJournal: () => ipcRenderer.invoke('fabtice:audio-journal'),
  onPower: (cb) => subscribe('fabtice:power', cb),
  recentProjects: () => ipcRenderer.invoke('fabtice:recent-projects'),
  openRecentProject: (token) => ipcRenderer.invoke('fabtice:open-recent-project', String(token)),
  clearRecentProjects: () => ipcRenderer.invoke('fabtice:clear-recent-projects'),
  // A project chosen in the page's file picker: its path (never shown to the page) goes in the recent list.
  rememberProjectFile: (file) => {
    let p = '';
    try {
      p = webUtils.getPathForFile(file);
    } catch {
      return Promise.resolve(false);
    }
    return p ? ipcRenderer.invoke('fabtice:remember-project', p) : Promise.resolve(false);
  },
  onYtdlpProgress: (cb) => subscribe('fabtice:ytdlp-progress', cb),
  onExtractProgress: (cb) => subscribe('fabtice:extract-progress', cb),
});
