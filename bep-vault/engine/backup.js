const path = require('path');
const { hasStorageCredentials } = require('./config');
const { ensureDir, pruneOldDirectories, readJson, timestampForPath, writeJson, writeText } = require('./fs-utils');
const {
  buildIncrementalSql,
  createClient,
  fetchChangedRows,
  fetchIncrementalTables,
  fetchMaxCursorValue,
  findPostgresTool,
  quoteQualifiedName,
  runPgDump,
} = require('./postgres');
const { backupStorage, createStorageClient } = require('./storage');

async function runFullBackup(config, onProgress = () => {}) {
  const timestamp = timestampForPath();
  const backupDir = path.join(config.backupRoot, 'full', timestamp);
  const databaseDir = path.join(backupDir, 'database');
  const storageDir = path.join(backupDir, 'storage');
  const state = readJson(config.stateFile, {
    database: { tables: {} },
    storage: { objects: [] },
  });

  ensureDir(databaseDir);
  ensureDir(storageDir);

  const pgDump = findPostgresTool('pg_dump', config.pgBinDir);
  const mode = pgDump ? 'sql' : 'json';
  const schemaFile = path.join(databaseDir, 'schema.sql');
  const dataFile = path.join(databaseDir, 'data.sql');
  let jsonTables = null;

  if (mode === 'sql') {
    onProgress('Exporting database schema...');
    await runPgDump({
      executable: pgDump,
      dbUrl: config.database.url,
      outputFile: schemaFile,
      schemas: config.database.schemas,
      extraArgs: ['--schema-only', '--clean', '--if-exists'],
    });

    onProgress('Exporting database data (this can take a minute)...');
    await runPgDump({
      executable: pgDump,
      dbUrl: config.database.url,
      outputFile: dataFile,
      schemas: config.database.schemas,
      excludes: config.database.excludeTables,
      extraArgs: ['--data-only', '--inserts', '--column-inserts'],
    });
  } else {
    onProgress('pg_dump not installed — using built-in table export instead (all public tables as JSON).');
  }

  const client = await createClient(config.database.connectConfig);

  if (mode === 'json') {
    const tablesDir = path.join(databaseDir, 'tables');
    ensureDir(tablesDir);
    const tableList = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    jsonTables = {};
    for (const row of tableList.rows) {
      const table = row.table_name;
      onProgress(`Exporting table ${table}...`);
      const data = await client.query(
        `SELECT row_to_json(t) AS row_json FROM ${quoteQualifiedName('public', table)} t`
      );
      const rows = data.rows.map((entry) => entry.row_json);
      writeText(path.join(tablesDir, `${table}.json`), JSON.stringify(rows));
      jsonTables[table] = rows.length;
    }
  }

  onProgress('Recording incremental baseline...');
  const incrementalTables = await fetchIncrementalTables(
    client,
    config.database.incrementalSchemas,
    config.database.incrementalCursorColumns
  );

  const tableState = {};
  for (const tableInfo of incrementalTables) {
    tableState[tableInfo.key] = {
      cursorColumn: tableInfo.cursorColumn,
      primaryKeys: tableInfo.primaryKeys,
      lastValue: await fetchMaxCursorValue(client, tableInfo),
    };
  }
  await client.end();

  let storageSummary = {
    currentObjects: [],
    changedObjects: [],
    deletedObjects: [],
    skipped: true,
  };

  if (hasStorageCredentials(config)) {
    onProgress('Backing up storage files (drawings, PDFs, images)...');
    const storageClient = createStorageClient(config.storage);
    const previousManifest = state.storage.objects || [];
    storageSummary = await backupStorage({
      client: storageClient,
      destinationRoot: storageDir,
      previousManifest,
      mode: 'full',
      onProgress,
    });
    storageSummary.skipped = false;
  } else {
    onProgress('Storage credentials not configured — skipping file storage backup.');
  }

  const manifest = {
    type: 'full',
    createdAt: new Date().toISOString(),
    database: mode === 'sql'
      ? {
          mode: 'sql',
          schemas: config.database.schemas,
          schemaFile: path.relative(backupDir, schemaFile),
          dataFile: path.relative(backupDir, dataFile),
        }
      : {
          mode: 'json',
          schemas: ['public'],
          tables: jsonTables,
        },
    incrementalBaseline: tableState,
    storage: {
      included: !storageSummary.skipped,
      objectCount: storageSummary.currentObjects.length,
      downloadedObjectCount: storageSummary.changedObjects.length,
      deletedObjectCount: storageSummary.deletedObjects.length,
    },
  };

  writeJson(path.join(backupDir, 'manifest.json'), manifest);
  writeJson(config.stateFile, {
    database: {
      lastFullBackupDir: backupDir,
      tables: tableState,
    },
    storage: {
      objects: storageSummary.currentObjects,
    },
  });

  const deleted = pruneOldDirectories(path.join(config.backupRoot, 'full'), config.retention.full);
  if (deleted.length > 0) {
    onProgress(`Removed ${deleted.length} old full backup folder(s) per retention settings.`);
  }

  onProgress('Full backup completed successfully.');
  return { backupDir, manifest };
}

async function runIncrementalBackup(config, onProgress = () => {}) {
  const state = readJson(config.stateFile, null);

  if (!state || !state.database || !state.database.tables) {
    throw new Error('No baseline found. Run a full backup first.');
  }

  const timestamp = timestampForPath();
  const backupDir = path.join(config.backupRoot, 'incremental', timestamp);
  const databaseDir = path.join(backupDir, 'database');
  const storageDir = path.join(backupDir, 'storage');

  ensureDir(databaseDir);
  ensureDir(storageDir);

  onProgress('Scanning for changed rows...');
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

    onProgress(`Captured ${changedRows.length} changed row(s) in ${tableInfo.key}`);
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
    onProgress('Backing up changed storage files...');
    const storageClient = createStorageClient(config.storage);
    storageSummary = await backupStorage({
      client: storageClient,
      destinationRoot: storageDir,
      previousManifest: state.storage.objects || [],
      onProgress,
    });
    storageSummary.skipped = false;
  } else {
    onProgress('Storage credentials not configured — skipping file storage backup.');
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
    onProgress(`Removed ${deleted.length} old incremental backup folder(s) per retention settings.`);
  }

  onProgress(
    changedTables.length === 0
      ? 'Incremental backup completed — no database changes detected.'
      : `Incremental backup completed — ${changedTables.length} table(s) had changes.`
  );
  return { backupDir, manifest };
}

module.exports = { runFullBackup, runIncrementalBackup };
