const fs = require('fs');
const path = require('path');
const { hasStorageCredentials } = require('./config');
const { readJson } = require('./fs-utils');
const {
  computeInsertOrder,
  createClient,
  fetchForeignKeys,
  findPostgresTool,
  quoteIdentifier,
  quoteQualifiedName,
  runPsqlFiles,
} = require('./postgres');
const { createStorageClient, restoreStorage } = require('./storage');

/**
 * Restore a JSON-mode full backup: wipe all public tables in one transaction,
 * re-insert rows parents-first, then fix identity sequences. Works without psql.
 */
async function restoreJsonDatabase(config, backupPath, manifest, onProgress) {
  const tablesDir = path.join(backupPath, 'database', 'tables');
  const tableNames = Object.keys(manifest.database.tables || {});
  if (!tableNames.length) throw new Error('This backup contains no table data.');

  const client = await createClient(config.database.connectConfig);
  try {
    const fks = await fetchForeignKeys(client);
    const insertOrder = computeInsertOrder(tableNames, fks);

    await client.query('BEGIN');
    try {
      onProgress('Clearing current tables...');
      const existing = [];
      for (const table of tableNames) {
        const check = await client.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
          [table]
        );
        if (check.rowCount) existing.push(table);
        else onProgress(`Table ${table} no longer exists — skipped.`);
      }
      if (existing.length) {
        await client.query(`TRUNCATE ${existing.map((table) => quoteQualifiedName('public', table)).join(', ')} CASCADE`);
      }

      for (const table of insertOrder) {
        if (!existing.includes(table)) continue;
        const file = path.join(tablesDir, `${table}.json`);
        if (!fs.existsSync(file)) continue;
        const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!rows.length) continue;

        // Parents-before-children within self-referencing tables.
        if (rows[0] && rows[0].id !== undefined) {
          rows.sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0));
        }

        for (let start = 0; start < rows.length; start += 200) {
          const chunk = rows.slice(start, start + 200);
          await client.query(
            `INSERT INTO ${quoteQualifiedName('public', table)} SELECT * FROM jsonb_populate_recordset(NULL::${quoteQualifiedName('public', table)}, $1::jsonb)`,
            [JSON.stringify(chunk)]
          );
        }
        onProgress(`Restored ${rows.length} row(s) into ${table}`);
      }

      onProgress('Fixing ID counters...');
      for (const table of existing) {
        const seqResult = await client.query(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [`public.${table}`]);
        const seq = seqResult.rows[0] && seqResult.rows[0].seq;
        if (!seq) continue;
        await client.query(`
          SELECT setval('${seq.replace(/'/g, "''")}', GREATEST(
            COALESCE((SELECT MAX(${quoteIdentifier('id')}) FROM ${quoteQualifiedName('public', table)}), 1),
            1
          ))
        `);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function runRestore(config, backupDir, { databaseOnly = false, storageOnly = false } = {}, onProgress = () => {}) {
  const resolvedBackupPath = path.resolve(backupDir);
  const manifestPath = path.join(resolvedBackupPath, 'manifest.json');
  const manifest = readJson(manifestPath, null);

  if (!manifest) {
    throw new Error(`Backup manifest not found: ${manifestPath}`);
  }

  if (!storageOnly) {
    if (manifest.type === 'full' && manifest.database && manifest.database.mode === 'json') {
      onProgress('Restoring database from built-in table export...');
      await restoreJsonDatabase(config, resolvedBackupPath, manifest, onProgress);
    } else {
      const psql = findPostgresTool('psql', config.pgBinDir);
      if (!psql) {
        throw new Error('psql was not found on this computer. Install PostgreSQL client tools, or set the PostgreSQL bin folder in Settings.');
      }

      const files = manifest.type === 'full'
        ? [
            path.join(resolvedBackupPath, manifest.database.schemaFile),
            path.join(resolvedBackupPath, manifest.database.dataFile),
          ]
        : [path.join(resolvedBackupPath, 'database', 'apply.sql')];

      onProgress(manifest.type === 'full'
        ? 'Restoring database schema and data (this can take several minutes)...'
        : 'Applying incremental changes...');

      await runPsqlFiles({
        executable: psql,
        dbUrl: config.database.url,
        files,
        onOutput: (text) => {
          const line = text.trim().split('\n').pop();
          if (line) onProgress(line.slice(0, 120));
        },
      });
    }
  }

  let uploadedCount = 0;
  if (!databaseOnly) {
    if (!hasStorageCredentials(config)) {
      onProgress('Storage credentials not configured — skipping file storage restore.');
    } else {
      const storagePath = path.join(resolvedBackupPath, 'storage');
      const storageClient = createStorageClient(config.storage);
      const result = await restoreStorage({
        client: storageClient,
        sourceRoot: storagePath,
        onProgress,
      });
      uploadedCount = result.uploadedFiles.length;
      onProgress(`Uploaded ${uploadedCount} storage file(s).`);
    }
  }

  onProgress('Restore completed successfully.');
  return { manifestType: manifest.type, uploadedCount };
}

module.exports = { runRestore };
