const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { ensureDir, readJson, writeJson } = require('./fs-utils');

// Default locations follow the existing CLI toolkit so old backups keep showing up.
const LEGACY_TOOLKIT_DIR = 'E:\\Coding\\BOM Software\\V3\\Supabase backup';

const DEFAULT_SETTINGS = {
  db: {
    host: '',
    port: 5432,
    name: 'postgres',
    user: 'postgres',
    password: '',
  },
  storage: {
    accessKeyId: '',
    secretAccessKey: '',
    region: 'ap-northeast-2',
    endpoint: '',
  },
  backupRoot: path.join(LEGACY_TOOLKIT_DIR, 'backups'),
  archiveRoot: path.join(LEGACY_TOOLKIT_DIR, 'archives'),
  pgBinDir: '',
  retention: { full: 5, incremental: 20 },
  schedule: {
    enabled: true,
    dayOfWeek: 1, // Monday
    hour: 10,
    minute: 0,
    lastRunAt: null,
  },
  startWithWindows: false,
  schemas: ['public', 'auth', 'storage'],
  incrementalSchemas: ['public'],
  incrementalCursorColumns: ['updated_at', 'modified_at', 'updated_on', 'modified_on', 'created_at'],
  excludeTables: ['storage.buckets_vectors', 'storage.vector_indexes'],
};

let settingsFile = null;

function initConfig(userDataDir) {
  ensureDir(userDataDir);
  settingsFile = path.join(userDataDir, 'settings.json');
}

function loadSettings() {
  const stored = readJson(settingsFile, {});
  return deepMerge(structuredClone(DEFAULT_SETTINGS), stored);
}

function saveSettings(settings) {
  writeJson(settingsFile, settings);
  return settings;
}

function deepMerge(target, source) {
  for (const key of Object.keys(source || {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object') {
      deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
  return target;
}

function legacyEnvPath() {
  return path.join(LEGACY_TOOLKIT_DIR, '.env');
}

function hasLegacyEnv() {
  return fs.existsSync(legacyEnvPath());
}

/** Import connection settings from the existing CLI toolkit .env file. */
function importFromLegacyEnv(settings) {
  const envFile = legacyEnvPath();
  if (!fs.existsSync(envFile)) {
    throw new Error(`.env not found at ${envFile}`);
  }
  const env = dotenv.parse(fs.readFileSync(envFile, 'utf8'));
  const next = structuredClone(settings);
  if (env.DB_HOST) next.db.host = env.DB_HOST;
  if (env.DB_PORT) next.db.port = Number(env.DB_PORT) || 5432;
  if (env.DB_NAME) next.db.name = env.DB_NAME;
  if (env.DB_USER) next.db.user = env.DB_USER;

  // Supabase retired direct db.<ref>.supabase.co hosts; translate to the
  // session pooler (verified region for this project: ap-northeast-2).
  const directMatch = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(next.db.host || '');
  if (directMatch) {
    next.db.host = 'aws-1-ap-northeast-2.pooler.supabase.com';
    next.db.user = `postgres.${directMatch[1]}`;
    next.db.port = 5432;
  }
  if (env.DB_PASSWORD) next.db.password = env.DB_PASSWORD;
  if (env.S3_ACCESS_KEY_ID) next.storage.accessKeyId = env.S3_ACCESS_KEY_ID;
  if (env.S3_SECRET_ACCESS_KEY) next.storage.secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (env.S3_REGION) next.storage.region = env.S3_REGION;
  if (env.S3_ENDPOINT) next.storage.endpoint = env.S3_ENDPOINT;
  if (env.FULL_BACKUP_RETENTION) next.retention.full = Number(env.FULL_BACKUP_RETENTION) || 5;
  if (env.INCREMENTAL_BACKUP_RETENTION) next.retention.incremental = Number(env.INCREMENTAL_BACKUP_RETENTION) || 20;
  return next;
}

/** Convert stored settings into the runtime config shape the engine functions use. */
function buildRuntimeConfig(settings) {
  const { db } = settings;
  const databaseUrl = `postgresql://${encodeURIComponent(db.user)}:${encodeURIComponent(db.password)}@${db.host}:${db.port}/${encodeURIComponent(db.name)}`;

  return {
    backupRoot: settings.backupRoot,
    archiveRoot: settings.archiveRoot,
    pgBinDir: settings.pgBinDir || '',
    stateFile: path.join(settings.backupRoot, '..', 'runtime', 'state', 'backup-state.json'),
    database: {
      host: db.host,
      port: db.port,
      name: db.name,
      user: db.user,
      password: db.password,
      url: databaseUrl,
      schemas: settings.schemas,
      incrementalSchemas: settings.incrementalSchemas,
      incrementalCursorColumns: settings.incrementalCursorColumns,
      excludeTables: settings.excludeTables,
      connectConfig: {
        host: db.host,
        port: db.port,
        database: db.name,
        user: db.user,
        password: db.password,
        ssl: { rejectUnauthorized: false },
      },
    },
    storage: settings.storage,
    retention: settings.retention,
  };
}

function hasStorageCredentials(config) {
  const { accessKeyId, secretAccessKey, endpoint } = config.storage;
  return Boolean(accessKeyId && secretAccessKey && endpoint);
}

function isConfigured(settings) {
  return Boolean(settings.db.host && settings.db.password);
}

module.exports = {
  DEFAULT_SETTINGS,
  buildRuntimeConfig,
  hasLegacyEnv,
  hasStorageCredentials,
  importFromLegacyEnv,
  initConfig,
  isConfigured,
  legacyEnvPath,
  loadSettings,
  saveSettings,
};
