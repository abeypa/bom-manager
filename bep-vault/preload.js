const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vault', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  importEnv: () => ipcRenderer.invoke('settings:import-env'),
  testConnection: () => ipcRenderer.invoke('settings:test'),

  getOverview: () => ipcRenderer.invoke('overview:get'),
  getTableCounts: () => ipcRenderer.invoke('overview:tables'),

  listBackups: () => ipcRenderer.invoke('backups:list'),
  runFullBackup: () => ipcRenderer.invoke('backups:run-full'),
  runIncrementalBackup: () => ipcRenderer.invoke('backups:run-incremental'),
  restoreBackup: (options) => ipcRenderer.invoke('backups:restore', options),
  openBackupFolder: (dir) => ipcRenderer.invoke('backups:open-folder', dir),

  listProjects: () => ipcRenderer.invoke('archive:list-projects'),
  previewArchive: (projectId) => ipcRenderer.invoke('archive:preview', projectId),
  runArchive: (options) => ipcRenderer.invoke('archive:run', options),
  listArchives: () => ipcRenderer.invoke('archive:list'),
  restoreArchive: (file) => ipcRenderer.invoke('archive:restore', file),
  copyArchive: (file) => ipcRenderer.invoke('archive:copy', file),
  importArchive: () => ipcRenderer.invoke('archive:import'),
  openArchiveFolder: () => ipcRenderer.invoke('archive:open-folder'),

  pickFolder: (title) => ipcRenderer.invoke('dialog:pick-folder', title),
  readLog: () => ipcRenderer.invoke('log:read'),

  onProgress: (callback) => {
    ipcRenderer.on('op:progress', (_event, message) => callback(message));
  },
  onOperationStarted: (callback) => {
    ipcRenderer.on('op:started', (_event, name) => callback(name));
  },
  onOperationDone: (callback) => {
    ipcRenderer.on('op:done', (_event, payload) => callback(payload));
  },
});
