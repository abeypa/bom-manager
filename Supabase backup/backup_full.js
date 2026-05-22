const path = require('path');
const { loadConfig, hasStorageCredentials } = require('./lib/config');
const { ensureDir, pruneOldDirectories, readJson, timestampForPath, writeJson } = require('./lib/fs-utils');
const {
  createClient,
  fetchIncrementalTables,
  fetchMaxCursorValue,
  findPostgresTool,
  runPgDump,
} = require('./lib/postgres');
const { backupStorage, createStorageClient } = require('./lib/storage');

async function main() {
  const config = loadConfig();
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

  const pgDump = findPostgresTool('pg_dump');
  console.log(`Using pg_dump: ${pgDump}`);
  console.log(`Creating full backup in: ${backupDir}`);

  const schemaFile = path.join(databaseDir, 'schema.sql');
  const dataFile = path.join(databaseDir, 'data.sql');

  await runPgDump({
    executable: pgDump,
    dbUrl: config.database.url,
    outputFile: schemaFile,
    schemas: config.database.schemas,
    extraArgs: ['--schema-only', '--clean', '--if-exists'],
  });

  await runPgDump({
    executable: pgDump,
    dbUrl: config.database.url,
    outputFile: dataFile,
    schemas: config.database.schemas,
    excludes: config.database.excludeTables,
    extraArgs: ['--data-only', '--inserts', '--column-inserts'],
  });

  const client = await createClient(config.database.connectConfig);
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
    const storageClient = createStorageClient(config.storage);
    const previousManifest = state.storage.objects || [];
    storageSummary = await backupStorage({
      client: storageClient,
      destinationRoot: storageDir,
      previousManifest,
    });
  } else {
    console.log('Storage credentials not configured. Skipping storage backup.');
  }

  const manifest = {
    type: 'full',
    createdAt: new Date().toISOString(),
    database: {
      schemas: config.database.schemas,
      schemaFile: path.relative(backupDir, schemaFile),
      dataFile: path.relative(backupDir, dataFile),
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
    console.log(`Pruned ${deleted.length} old full backup folder(s).`);
  }

  console.log('Full backup completed successfully.');
}

main().catch((error) => {
  console.error(`Full backup failed: ${error.message}`);
  process.exitCode = 1;
});
