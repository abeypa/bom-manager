const path = require('path');
const { loadConfig, hasStorageCredentials } = require('./lib/config');
const { ensureDir, pruneOldDirectories, readJson, timestampForPath, writeJson, writeText } = require('./lib/fs-utils');
const {
  buildIncrementalSql,
  createClient,
  fetchChangedRows,
  fetchIncrementalTables,
  fetchMaxCursorValue,
} = require('./lib/postgres');
const { backupStorage, createStorageClient } = require('./lib/storage');

async function main() {
  const config = loadConfig();
  const state = readJson(config.stateFile, null);

  if (!state || !state.database || !state.database.tables) {
    throw new Error('No baseline found. Run npm run backup:full first.');
  }

  const timestamp = timestampForPath();
  const backupDir = path.join(config.backupRoot, 'incremental', timestamp);
  const databaseDir = path.join(backupDir, 'database');
  const storageDir = path.join(backupDir, 'storage');

  ensureDir(databaseDir);
  ensureDir(storageDir);

  const client = await createClient(config.database.connectConfig);
  const tables = await fetchIncrementalTables(
    client,
    config.database.incrementalSchemas,
    config.database.incrementalCursorColumns
  );

  const changedTables = [];
  const skippedTables = [];
  const nextTableState = { ...state.database.tables };
  const applyStatements = ['BEGIN;', ''];

  for (const tableInfo of tables) {
    if (!tableInfo.cursorColumn) {
      skippedTables.push({
        table: tableInfo.key,
        reason: `No incremental cursor column found. Expected one of: ${config.database.incrementalCursorColumns.join(', ')}`,
      });
      continue;
    }

    const baseline = state.database.tables[tableInfo.key] || {};
    const changedRows = await fetchChangedRows(client, tableInfo, baseline.lastValue || null);
    const newMaxValue = await fetchMaxCursorValue(client, tableInfo);

    nextTableState[tableInfo.key] = {
      cursorColumn: tableInfo.cursorColumn,
      primaryKeys: tableInfo.primaryKeys,
      lastValue: newMaxValue,
    };

    if (changedRows.length === 0) {
      continue;
    }

    const tableFileName = `${tableInfo.schema}.${tableInfo.table}.sql`;
    const tableFilePath = path.join(databaseDir, tableFileName);
    const sql = buildIncrementalSql(tableInfo, changedRows);
    writeText(tableFilePath, sql);
    applyStatements.push(`\\i '${tableFileName.replace(/\\/g, '/')}'`);

    changedTables.push({
      table: tableInfo.key,
      cursorColumn: tableInfo.cursorColumn,
      rowCount: changedRows.length,
      file: tableFileName,
    });
  }

  await client.end();
  applyStatements.push('', 'COMMIT;', '');
  writeText(path.join(databaseDir, 'apply.sql'), applyStatements.join('\n'));

  let storageSummary = {
    currentObjects: state.storage.objects || [],
    changedObjects: [],
    deletedObjects: [],
    skipped: true,
  };

  if (hasStorageCredentials(config)) {
    const storageClient = createStorageClient(config.storage);
    storageSummary = await backupStorage({
      client: storageClient,
      destinationRoot: storageDir,
      previousManifest: state.storage.objects || [],
    });
  } else {
    console.log('Storage credentials not configured. Skipping storage backup.');
  }

  const manifest = {
    type: 'incremental',
    createdAt: new Date().toISOString(),
    basedOnFullBackup: state.database.lastFullBackupDir || null,
    changedTables,
    skippedTables,
    storage: {
      included: !storageSummary.skipped,
      downloadedObjectCount: storageSummary.changedObjects.length,
      deletedObjectCount: storageSummary.deletedObjects.length,
      deletedObjects: storageSummary.deletedObjects,
    },
  };

  writeJson(path.join(backupDir, 'manifest.json'), manifest);
  writeJson(config.stateFile, {
    database: {
      lastFullBackupDir: state.database.lastFullBackupDir,
      lastIncrementalBackupDir: backupDir,
      tables: nextTableState,
    },
    storage: {
      objects: storageSummary.currentObjects,
    },
  });

  const deleted = pruneOldDirectories(path.join(config.backupRoot, 'incremental'), config.retention.incremental);
  if (deleted.length > 0) {
    console.log(`Pruned ${deleted.length} old incremental backup folder(s).`);
  }

  console.log('Incremental backup completed successfully.');
  if (changedTables.length === 0) {
    console.log('No database row changes detected for configured incremental tables.');
  }
}

main().catch((error) => {
  console.error(`Incremental backup failed: ${error.message}`);
  process.exitCode = 1;
});
