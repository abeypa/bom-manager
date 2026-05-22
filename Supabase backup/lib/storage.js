const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const {
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const { ensureDir } = require('./fs-utils');

function createStorageClient(storageConfig) {
  return new S3Client({
    region: storageConfig.region,
    endpoint: storageConfig.endpoint,
    credentials: {
      accessKeyId: storageConfig.accessKeyId,
      secretAccessKey: storageConfig.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

async function listAllStorageObjects(client) {
  const bucketResponse = await client.send(new ListBucketsCommand({}));
  const buckets = bucketResponse.Buckets || [];
  const objects = [];

  for (const bucket of buckets) {
    let continuationToken;
    let more = true;

    while (more) {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket.Name,
          ContinuationToken: continuationToken,
        })
      );

      (response.Contents || [])
        .filter((entry) => entry.Key && !entry.Key.endsWith('/'))
        .forEach((entry) => {
          objects.push({
            bucket: bucket.Name,
            key: entry.Key,
            size: entry.Size || 0,
            etag: entry.ETag || '',
            lastModified: entry.LastModified ? entry.LastModified.toISOString() : null,
          });
        });

      more = Boolean(response.IsTruncated);
      continuationToken = response.NextContinuationToken;
    }
  }

  return objects.sort((left, right) => `${left.bucket}/${left.key}`.localeCompare(`${right.bucket}/${right.key}`));
}

async function downloadObject(client, destinationRoot, objectInfo) {
  const destinationFile = path.join(destinationRoot, objectInfo.bucket, objectInfo.key);
  ensureDir(path.dirname(destinationFile));

  const response = await client.send(
    new GetObjectCommand({
      Bucket: objectInfo.bucket,
      Key: objectInfo.key,
    })
  );

  await pipeline(response.Body, fs.createWriteStream(destinationFile));
}

async function backupStorage({ client, destinationRoot, previousManifest = [], mode = 'incremental' }) {
  const currentObjects = await listAllStorageObjects(client);
  const previousMap = new Map(previousManifest.map((entry) => [`${entry.bucket}/${entry.key}`, entry]));

  const changedObjects = mode === 'full'
    ? currentObjects
    : currentObjects.filter((entry) => {
        const existing = previousMap.get(`${entry.bucket}/${entry.key}`);
        if (!existing) {
          return true;
        }

        return existing.etag !== entry.etag || existing.size !== entry.size || existing.lastModified !== entry.lastModified;
      });

  for (const entry of changedObjects) {
    process.stdout.write(`Downloading storage object ${entry.bucket}/${entry.key}...\n`);
    await downloadObject(client, destinationRoot, entry);
  }

  const currentKeys = new Set(currentObjects.map((entry) => `${entry.bucket}/${entry.key}`));
  const deletedObjects = previousManifest.filter((entry) => !currentKeys.has(`${entry.bucket}/${entry.key}`));

  return {
    currentObjects,
    changedObjects,
    deletedObjects,
  };
}

async function restoreStorage({ client, sourceRoot }) {
  if (!fs.existsSync(sourceRoot)) {
    return { uploadedFiles: [] };
  }

  const uploadedFiles = [];
  const bucketDirectories = fs
    .readdirSync(sourceRoot)
    .map((entry) => path.join(sourceRoot, entry))
    .filter((entryPath) => fs.statSync(entryPath).isDirectory());

  for (const bucketPath of bucketDirectories) {
    const bucketName = path.basename(bucketPath);
    const pendingPaths = [bucketPath];

    while (pendingPaths.length > 0) {
      const currentPath = pendingPaths.pop();
      const children = fs.readdirSync(currentPath).map((entry) => path.join(currentPath, entry));

      for (const child of children) {
        const stats = fs.statSync(child);
        if (stats.isDirectory()) {
          pendingPaths.push(child);
          continue;
        }

        const key = path.relative(bucketPath, child).replace(/\\/g, '/');
        process.stdout.write(`Uploading storage object ${bucketName}/${key}...\n`);
        await client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: fs.createReadStream(child),
          })
        );
        uploadedFiles.push({ bucket: bucketName, key });
      }
    }
  }

  return { uploadedFiles };
}

module.exports = {
  backupStorage,
  createStorageClient,
  restoreStorage,
};
