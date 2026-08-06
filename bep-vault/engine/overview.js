const fs = require('fs');
const path = require('path');
const { createClient, findPostgresTool } = require('./postgres');
const { directorySize, listDirectories, readJson } = require('./fs-utils');

async function testConnection(config) {
  const client = await createClient(config.database.connectConfig);
  try {
    const result = await client.query('SELECT current_database() AS db, version() AS version');
    return { ok: true, database: result.rows[0].db, version: result.rows[0].version.split(',')[0] };
  } finally {
    await client.end();
  }
}

async function getTableCounts(config) {
  const client = await createClient(config.database.connectConfig);
  try {
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const counts = [];
    for (const row of tables.rows) {
      const result = await client.query(`SELECT COUNT(*)::int AS count FROM public."${row.table_name.replace(/"/g, '""')}"`);
      counts.push({ table: row.table_name, count: result.rows[0].count });
    }
    return counts;
  } finally {
    await client.end();
  }
}

function listBackups(backupRoot) {
  const results = [];
  for (const type of ['full', 'incremental']) {
    for (const dir of listDirectories(path.join(backupRoot, type))) {
      const manifest = readJson(path.join(dir, 'manifest.json'), null);
      if (!manifest) continue;
      results.push({
        dir,
        name: path.basename(dir),
        type: manifest.type || type,
        createdAt: manifest.createdAt || null,
        sizeBytes: directorySize(dir),
        storageIncluded: Boolean(manifest.storage && manifest.storage.included),
        changedTables: manifest.changedTables ? manifest.changedTables.length : null,
      });
    }
  }
  return results.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function lastFullBackup(backupRoot) {
  const backups = listBackups(backupRoot).filter((entry) => entry.type === 'full');
  return backups[0] || null;
}

function checkPgTools(pgBinDir) {
  const pgDump = findPostgresTool('pg_dump', pgBinDir);
  const psql = findPostgresTool('psql', pgBinDir);
  return {
    pgDump: pgDump && fs.existsSync(pgDump) ? pgDump : pgDump,
    psql,
    ok: Boolean(pgDump && psql),
  };
}

module.exports = { checkPgTools, getTableCounts, lastFullBackup, listBackups, testConnection };
