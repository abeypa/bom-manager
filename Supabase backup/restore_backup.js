const fs = require('fs');
const path = require('path');
const { loadConfig, hasStorageCredentials, parseArgs } = require('./lib/config');
const { readJson } = require('./lib/fs-utils');
const { findPostgresTool, runPsqlFiles } = require('./lib/postgres');
const { createStorageClient, restoreStorage } = require('./lib/storage');

async function main() {
  const config = loadConfig();
  const args = parseArgs(process.argv.slice(2));
  const backupPath = args.backup;

  if (!backupPath) {
    throw new Error('Usage: node restore_backup.js --backup "<full-or-incremental-backup-folder>" [--database-only] [--storage-only]');
  }

  const resolvedBackupPath = path.resolve(backupPath);
  const manifestPath = path.join(resolvedBackupPath, 'manifest.json');
  const manifest = readJson(manifestPath, null);

  if (!manifest) {
    throw new Error(`Backup manifest not found: ${manifestPath}`);
  }

  const databaseOnly = Boolean(args['database-only']);
  const storageOnly = Boolean(args['storage-only']);

  if (!storageOnly) {
    const psql = findPostgresTool('psql');
    console.log(`Using psql: ${psql}`);

    const files = manifest.type === 'full'
      ? [
          path.join(resolvedBackupPath, manifest.database.schemaFile),
          path.join(resolvedBackupPath, manifest.database.dataFile),
        ]
      : [path.join(resolvedBackupPath, 'database', 'apply.sql')];

    await runPsqlFiles({
      executable: psql,
      dbUrl: config.database.url,
      files,
    });
  }

  if (!databaseOnly) {
    if (!hasStorageCredentials(config)) {
      console.log('Storage credentials not configured. Skipping storage restore.');
    } else {
      const storagePath = path.join(resolvedBackupPath, 'storage');
      const storageClient = createStorageClient(config.storage);
      const result = await restoreStorage({
        client: storageClient,
        sourceRoot: storagePath,
      });
      console.log(`Uploaded ${result.uploadedFiles.length} storage file(s).`);
    }
  }

  console.log('Restore completed successfully.');
}

main().catch((error) => {
  console.error(`Restore failed: ${error.message}`);
  process.exitCode = 1;
});
