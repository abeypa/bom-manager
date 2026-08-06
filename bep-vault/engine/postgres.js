const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function quoteQualifiedName(schemaName, tableName) {
  return `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
}

function findPostgresTool(toolName, pgBinDir) {
  const binDir = pgBinDir || process.env.PG_BIN_DIR;
  if (binDir) {
    const candidate = path.join(binDir, process.platform === 'win32' ? `${toolName}.exe` : toolName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const whereCommand = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(whereCommand, [toolName], { encoding: 'utf8' });
  if (result.status === 0) {
    const candidate = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (candidate) {
      return candidate;
    }
  }

  // Common Windows install locations as a last resort
  if (process.platform === 'win32') {
    const roots = ['C:\\Program Files\\PostgreSQL', 'C:\\Program Files (x86)\\PostgreSQL'];
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      const versions = fs.readdirSync(root).sort().reverse();
      for (const version of versions) {
        const candidate = path.join(root, version, 'bin', `${toolName}.exe`);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }

  return null;
}

function runTool(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, ...(options.env || {}) },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (options.onOutput) options.onOutput(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (options.onOutput) options.onOutput(text);
    });

    child.on('error', (error) => {
      if (error && error.code === 'ENOENT') {
        reject(new Error(`Required tool not found: ${executable}. Install PostgreSQL client tools so pg_dump and psql are available, or set the PostgreSQL bin folder in Settings.`));
        return;
      }

      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${path.basename(executable)} exited with code ${code}. ${stderr.slice(-500)}`));
    });
  });
}

async function runPgDump({ executable, dbUrl, outputFile, schemas, excludes = [], extraArgs = [], onOutput }) {
  const args = [
    '--no-owner',
    '--no-privileges',
    '--quote-all-identifiers',
    '--dbname',
    dbUrl,
    '--file',
    outputFile,
    ...extraArgs,
  ];

  schemas.forEach((schemaName) => {
    args.push('--schema', schemaName);
  });

  excludes.forEach((entry) => {
    args.push('--exclude-table-data', entry);
  });

  return runTool(executable, args, { onOutput });
}

async function runPsqlFiles({ executable, dbUrl, files, onOutput }) {
  for (const file of files) {
    await runTool(executable, ['--single-transaction', '--set', 'ON_ERROR_STOP=1', '--dbname', dbUrl, '--file', file], { onOutput });
  }
}

async function createClient(connectConfig) {
  const client = new Client(connectConfig);
  await client.connect();
  return client;
}

async function fetchIncrementalTables(client, schemas, candidateColumns) {
  const tableResult = await client.query(
    `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema = ANY($1::text[])
      ORDER BY table_schema, table_name
    `,
    [schemas]
  );

  const columnResult = await client.query(
    `
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = ANY($1::text[])
      ORDER BY ordinal_position
    `,
    [schemas]
  );

  const primaryKeyResult = await client.query(
    `
      SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
       AND tc.table_name = kcu.table_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = ANY($1::text[])
      ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position
    `,
    [schemas]
  );

  const columnMap = new Map();
  columnResult.rows.forEach((row) => {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!columnMap.has(key)) {
      columnMap.set(key, []);
    }
    columnMap.get(key).push(row.column_name);
  });

  const pkMap = new Map();
  primaryKeyResult.rows.forEach((row) => {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!pkMap.has(key)) {
      pkMap.set(key, []);
    }
    pkMap.get(key).push(row.column_name);
  });

  return tableResult.rows.map((row) => {
    const key = `${row.table_schema}.${row.table_name}`;
    const columns = columnMap.get(key) || [];
    const cursorColumn = candidateColumns.find((candidate) => columns.includes(candidate)) || null;
    return {
      schema: row.table_schema,
      table: row.table_name,
      key,
      columns,
      cursorColumn,
      primaryKeys: pkMap.get(key) || [],
    };
  });
}

async function fetchMaxCursorValue(client, tableInfo) {
  if (!tableInfo.cursorColumn) {
    return null;
  }

  const result = await client.query(
    `SELECT MAX(${quoteIdentifier(tableInfo.cursorColumn)}) AS max_value FROM ${quoteQualifiedName(tableInfo.schema, tableInfo.table)}`
  );
  return result.rows[0].max_value || null;
}

async function fetchChangedRows(client, tableInfo, lastValue) {
  const whereClause = lastValue === null
    ? ''
    : `WHERE ${quoteIdentifier(tableInfo.cursorColumn)} > $1`;
  const params = lastValue === null ? [] : [lastValue];
  const query = `
    SELECT row_to_json(t) AS row_json
    FROM (
      SELECT *
      FROM ${quoteQualifiedName(tableInfo.schema, tableInfo.table)}
      ${whereClause}
      ORDER BY ${quoteIdentifier(tableInfo.cursorColumn)} ASC
    ) AS t
  `;

  const result = await client.query(query, params);
  return result.rows.map((row) => row.row_json);
}

/** All FK constraints in public schema with delete rules. */
async function fetchForeignKeys(client) {
  const result = await client.query(`
    SELECT
      tc.table_name AS referencing_table,
      kcu.column_name AS referencing_column,
      ccu.table_name AS referenced_table,
      ccu.column_name AS referenced_column,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  `);
  return result.rows;
}

/**
 * Order tables so parents are inserted before children (Kahn's algorithm).
 * Self-references are ignored; cycles fall back to alphabetical order.
 */
function computeInsertOrder(tableNames, fks) {
  const tables = new Set(tableNames);
  const dependsOn = new Map(tableNames.map((table) => [table, new Set()]));
  for (const fk of fks) {
    if (fk.referencing_table === fk.referenced_table) continue;
    if (tables.has(fk.referencing_table) && tables.has(fk.referenced_table)) {
      dependsOn.get(fk.referencing_table).add(fk.referenced_table);
    }
  }

  const ordered = [];
  const remaining = new Set(tableNames);
  while (remaining.size) {
    const ready = Array.from(remaining).filter((table) =>
      Array.from(dependsOn.get(table)).every((dep) => !remaining.has(dep))
    ).sort();
    if (!ready.length) {
      // Cycle — append what's left in stable order.
      ordered.push(...Array.from(remaining).sort());
      break;
    }
    for (const table of ready) {
      ordered.push(table);
      remaining.delete(table);
    }
  }
  return ordered;
}

function escapeJsonForSql(value) {
  return JSON.stringify(value).replace(/'/g, "''");
}

function buildIncrementalSql(tableInfo, rows) {
  const target = quoteQualifiedName(tableInfo.schema, tableInfo.table);
  const source = `jsonb_populate_recordset(NULL::${target}, '${escapeJsonForSql(rows)}'::jsonb)`;

  if (tableInfo.primaryKeys.length === 0) {
    return [
      `-- ${tableInfo.key}: table has no primary key, so delta restore uses plain INSERTs.`,
      `INSERT INTO ${target}`,
      `SELECT * FROM ${source};`,
      '',
    ].join('\n');
  }

  const primaryKeyList = tableInfo.primaryKeys.map((column) => quoteIdentifier(column)).join(', ');
  const updatableColumns = tableInfo.columns
    .filter((column) => !tableInfo.primaryKeys.includes(column))
    .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`);
  const conflictAction = updatableColumns.length === 0
    ? 'DO NOTHING'
    : `DO UPDATE SET ${updatableColumns.join(', ')}`;

  return [
    `INSERT INTO ${target}`,
    `SELECT * FROM ${source}`,
    `ON CONFLICT (${primaryKeyList}) ${conflictAction};`,
    '',
  ].join('\n');
}

module.exports = {
  buildIncrementalSql,
  computeInsertOrder,
  createClient,
  fetchChangedRows,
  fetchForeignKeys,
  fetchIncrementalTables,
  fetchMaxCursorValue,
  findPostgresTool,
  quoteIdentifier,
  quoteQualifiedName,
  runPgDump,
  runPsqlFiles,
};
