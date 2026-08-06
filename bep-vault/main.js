const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell, Notification } = require('electron');
const fs = require('fs');
const path = require('path');

const {
  buildRuntimeConfig,
  hasLegacyEnv,
  importFromLegacyEnv,
  initConfig,
  isConfigured,
  loadSettings,
  saveSettings,
} = require('./engine/config');
const { runFullBackup, runIncrementalBackup } = require('./engine/backup');
const { runRestore } = require('./engine/restore');
const { checkPgTools, getTableCounts, lastFullBackup, listBackups, testConnection } = require('./engine/overview');
const archive = require('./engine/archive');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let runningOperation = null;

const logFile = () => path.join(app.getPath('userData'), 'vault-log.txt');

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  try {
    fs.appendFileSync(logFile(), `${line}\n`, 'utf8');
  } catch (_) { /* logging must never break the app */ }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('op:progress', message);
  }
}

function notify(title, body) {
  try {
    new Notification({ title, body }).show();
  } catch (_) { /* notifications are best-effort */ }
}

function iconPath() {
  const candidate = path.join(__dirname, 'build', 'icon.ico');
  return fs.existsSync(candidate) ? candidate : null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'BEP Vault — Backup & Archive',
    icon: iconPath() || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (event) => {
    const settings = loadSettings();
    if (!isQuitting && settings.schedule.enabled && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = iconPath();
  if (!icon) return;
  tray = new Tray(icon);
  tray.setToolTip('BEP Vault');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open BEP Vault', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { label: 'Backup Now', click: () => runOperation('scheduled-manual', () => runFullBackupOp()) },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

function currentConfig() {
  return buildRuntimeConfig(loadSettings());
}

async function runOperation(name, fn) {
  if (runningOperation) {
    throw new Error(`Another operation is already running (${runningOperation}). Please wait for it to finish.`);
  }
  runningOperation = name;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('op:started', name);
  try {
    const result = await fn();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('op:done', { name, ok: true });
    return result;
  } catch (error) {
    log(`ERROR in ${name}: ${error.message}`);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('op:done', { name, ok: false, error: error.message });
    throw error;
  } finally {
    runningOperation = null;
  }
}

async function runFullBackupOp() {
  const config = currentConfig();
  log('Starting full backup...');
  const result = await runFullBackup(config, log);
  const settings = loadSettings();
  settings.schedule.lastRunAt = new Date().toISOString();
  saveSettings(settings);
  notify('BEP Vault', 'Full backup completed successfully.');
  return { backupDir: result.backupDir };
}

// ── Weekly scheduler ─────────────────────────────────────────────
let lastScheduleCheckMinute = null;
const appStartedAt = Date.now();

function scheduleTick() {
  const settings = loadSettings();
  if (!settings.schedule.enabled || !isConfigured(settings) || runningOperation) return;
  // Grace period after startup so the user isn't surprised by an instant backup.
  if (Date.now() - appStartedAt < 3 * 60 * 1000) return;

  const now = new Date();
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
  if (minuteKey === lastScheduleCheckMinute) return;
  lastScheduleCheckMinute = minuteKey;

  const lastRun = settings.schedule.lastRunAt ? new Date(settings.schedule.lastRunAt) : null;
  const hoursSinceRun = lastRun ? (now - lastRun) / 36e5 : Infinity;

  const slotMatches =
    now.getDay() === Number(settings.schedule.dayOfWeek) &&
    now.getHours() === Number(settings.schedule.hour) &&
    now.getMinutes() === Number(settings.schedule.minute);

  // Catch-up: scheduled slot was missed (app was closed) and last run > 7 days ago.
  const overdue = hoursSinceRun > 7 * 24 + 1;

  if (slotMatches && hoursSinceRun > 12) {
    log('Scheduled weekly backup starting...');
    runOperation('scheduled-backup', runFullBackupOp).catch(() => notify('BEP Vault', 'Scheduled backup FAILED — open BEP Vault for details.'));
  } else if (overdue) {
    log('Backup overdue (missed schedule) — running catch-up backup...');
    runOperation('catchup-backup', runFullBackupOp).catch(() => notify('BEP Vault', 'Catch-up backup FAILED — open BEP Vault for details.'));
  }
}

// ── IPC ──────────────────────────────────────────────────────────
function registerIpc() {
  ipcMain.handle('settings:get', () => ({
    settings: loadSettings(),
    hasLegacyEnv: hasLegacyEnv(),
    configured: isConfigured(loadSettings()),
    logFile: logFile(),
  }));

  ipcMain.handle('settings:save', (_event, settings) => {
    saveSettings(settings);
    try {
      app.setLoginItemSettings({ openAtLogin: Boolean(settings.startWithWindows) });
    } catch (_) { /* not critical */ }
    log('Settings saved.');
    return loadSettings();
  });

  ipcMain.handle('settings:import-env', () => {
    const next = importFromLegacyEnv(loadSettings());
    saveSettings(next);
    log('Imported connection settings from existing backup toolkit .env');
    return next;
  });

  ipcMain.handle('settings:test', async () => {
    const config = currentConfig();
    const tools = checkPgTools(config.pgBinDir);
    let db = { ok: false, error: 'Not configured' };
    try {
      db = await testConnection(config);
    } catch (error) {
      db = { ok: false, error: error.message };
    }
    return { db, tools };
  });

  ipcMain.handle('overview:get', async () => {
    const settings = loadSettings();
    const config = currentConfig();
    const backups = listBackups(config.backupRoot);
    const last = backups.find((entry) => entry.type === 'full') || null;
    return {
      configured: isConfigured(settings),
      lastFullBackup: last,
      backupCount: backups.length,
      schedule: settings.schedule,
      archiveCount: archive.listArchives(config.archiveRoot).filter((a) => !a.error).length,
    };
  });

  ipcMain.handle('overview:tables', async () => getTableCounts(currentConfig()));

  ipcMain.handle('backups:list', () => listBackups(currentConfig().backupRoot));

  ipcMain.handle('backups:run-full', () => runOperation('full-backup', runFullBackupOp));

  ipcMain.handle('backups:run-incremental', () => runOperation('incremental-backup', async () => {
    const config = currentConfig();
    log('Starting incremental backup...');
    const result = await runIncrementalBackup(config, log);
    notify('BEP Vault', 'Incremental backup completed.');
    return { backupDir: result.backupDir };
  }));

  ipcMain.handle('backups:restore', (_event, { backupDir, databaseOnly, storageOnly }) =>
    runOperation('restore', async () => {
      const config = currentConfig();
      log(`Starting RESTORE from ${backupDir}...`);
      const result = await runRestore(config, backupDir, { databaseOnly, storageOnly }, log);
      notify('BEP Vault', 'Restore completed.');
      return result;
    })
  );

  ipcMain.handle('backups:open-folder', (_event, dir) => shell.openPath(dir || currentConfig().backupRoot));

  ipcMain.handle('archive:list-projects', () => archive.listProjects(currentConfig()));

  ipcMain.handle('archive:preview', (_event, projectId) => archive.previewArchive(currentConfig(), projectId));

  ipcMain.handle('archive:run', (_event, { projectId, deleteCloudFiles }) =>
    runOperation('archive-project', async () => {
      const config = currentConfig();
      const result = await archive.archiveProject(config, projectId, { deleteCloudFiles }, log);
      notify('BEP Vault', `Project archived: ${path.basename(result.archivePath)}`);
      return result;
    })
  );

  ipcMain.handle('archive:list', () => archive.listArchives(currentConfig().archiveRoot));

  ipcMain.handle('archive:restore', (_event, archiveFile) =>
    runOperation('restore-archive', async () => {
      const config = currentConfig();
      log(`Restoring archived project from ${archiveFile}...`);
      const result = await archive.restoreArchive(config, archiveFile, log);
      notify('BEP Vault', `Project ${result.manifest.project.project_number} restored.`);
      return result;
    })
  );

  ipcMain.handle('archive:copy', async (_event, archiveFile) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save a copy of the archive',
      defaultPath: path.basename(archiveFile),
      filters: [{ name: 'BEP Vault archive', extensions: ['bepvault'] }],
    });
    if (canceled || !filePath) return { copied: false };
    fs.copyFileSync(archiveFile, filePath);
    log(`Archive copy saved to ${filePath}`);
    return { copied: true, filePath };
  });

  ipcMain.handle('archive:open-folder', () => shell.openPath(currentConfig().archiveRoot));

  ipcMain.handle('archive:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import a BEP Vault archive',
      filters: [{ name: 'BEP Vault archive', extensions: ['bepvault'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { imported: false };
    const config = currentConfig();
    const target = path.join(config.archiveRoot, path.basename(filePaths[0]));
    archive.readArchiveManifest(filePaths[0]); // validates
    fs.mkdirSync(config.archiveRoot, { recursive: true });
    fs.copyFileSync(filePaths[0], target);
    return { imported: true, target };
  });

  ipcMain.handle('dialog:pick-folder', async (_event, title) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: title || 'Choose folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    return canceled || !filePaths.length ? null : filePaths[0];
  });

  ipcMain.handle('log:read', () => {
    try {
      const text = fs.readFileSync(logFile(), 'utf8');
      return text.split('\n').slice(-300).join('\n');
    } catch (_) {
      return '';
    }
  });
}

app.whenReady().then(() => {
  initConfig(app.getPath('userData'));
  registerIpc();
  createWindow();
  createTray();
  setInterval(scheduleTick, 30 * 1000);
  log('BEP Vault started.');
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  const settings = loadSettings();
  if (!settings.schedule.enabled || !tray) {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
