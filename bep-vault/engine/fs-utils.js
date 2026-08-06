const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, 'utf8');
}

function listDirectories(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath)
    .map((entry) => path.join(dirPath, entry))
    .filter((entryPath) => fs.statSync(entryPath).isDirectory())
    .sort();
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

function pruneOldDirectories(rootDir, keepCount) {
  if (!Number.isInteger(keepCount) || keepCount < 1) {
    return [];
  }

  const directories = listDirectories(rootDir);
  if (directories.length <= keepCount) {
    return [];
  }

  const directoriesToDelete = directories.slice(0, directories.length - keepCount);
  directoriesToDelete.forEach((dirPath) => fs.rmSync(dirPath, { recursive: true, force: true }));
  return directoriesToDelete;
}

function directorySize(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  const pending = [dirPath];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current)) {
      const entryPath = path.join(current, entry);
      const stats = fs.statSync(entryPath);
      if (stats.isDirectory()) pending.push(entryPath);
      else total += stats.size;
    }
  }
  return total;
}

module.exports = {
  directorySize,
  ensureDir,
  listDirectories,
  pruneOldDirectories,
  readJson,
  timestampForPath,
  writeJson,
  writeText,
};
