const path = require('path');
const dotenv = require('dotenv');
const { ensureDir } = require('./fs-utils');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const projectRoot = path.join(__dirname, '..');
const backupRoot = path.join(projectRoot, 'backups');
const runtimeRoot = path.join(projectRoot, 'runtime');

function parseCsv(value, fallback) {
  const source = value || fallback;
  return source
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadConfig() {
  const dbPassword = process.env.DB_PASSWORD;
  const dbUser = process.env.DB_USER || 'postgres';
  const dbHost = process.env.DB_HOST;
  const dbPort = parseInteger(process.env.DB_PORT, 5432);
  const dbName = process.env.DB_NAME || 'postgres';

  if (!dbHost) {
    throw new Error('Missing DB_HOST in .env.');
  }

  if (!dbPassword) {
    throw new Error('Missing DB_PASSWORD in .env.');
  }

  const databaseUrl = `postgresql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${encodeURIComponent(dbName)}`;
  const schemas = parseCsv(process.env.BACKUP_DB_SCHEMAS, 'public,auth,storage');
  const incrementalSchemas = parseCsv(process.env.INCREMENTAL_DB_SCHEMAS, 'public');
  const incrementalCursorColumns = parseCsv(
    process.env.INCREMENTAL_CURSOR_COLUMNS,
    'updated_at,modified_at,updated_on,modified_on,created_at'
  );
  const excludeTables = parseCsv(
    process.env.BACKUP_EXCLUDE_TABLES,
    'storage.buckets_vectors,storage.vector_indexes'
  );

  ensureDir(backupRoot);
  ensureDir(runtimeRoot);

  return {
    projectRoot,
    backupRoot,
    runtimeRoot,
    stateFile: path.join(runtimeRoot, 'state', 'backup-state.json'),
    database: {
      host: dbHost,
      port: dbPort,
      name: dbName,
      user: dbUser,
      password: dbPassword,
      url: databaseUrl,
      schemas,
      incrementalSchemas,
      incrementalCursorColumns,
      excludeTables,
      connectConfig: {
        host: dbHost,
        port: dbPort,
        database: dbName,
        user: dbUser,
        password: dbPassword,
        ssl: { rejectUnauthorized: false },
      },
    },
    storage: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      region: process.env.S3_REGION || 'ap-northeast-2',
      endpoint: process.env.S3_ENDPOINT || '',
    },
    retention: {
      full: parseInteger(process.env.FULL_BACKUP_RETENTION, 5),
      incremental: parseInteger(process.env.INCREMENTAL_BACKUP_RETENTION, 20),
    },
  };
}

function hasStorageCredentials(config) {
  const { accessKeyId, secretAccessKey, endpoint } = config.storage;
  return Boolean(accessKeyId && secretAccessKey && endpoint);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

module.exports = {
  hasStorageCredentials,
  loadConfig,
  parseArgs,
};
