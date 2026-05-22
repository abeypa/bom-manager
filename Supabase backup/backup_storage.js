const { S3Client, ListBucketsCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

// --- Manual .env Parser ---
try {
  const envText = fs.readFileSync('.env', 'utf8');
  envText.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
} catch (e) { console.log('Notice: Could not load .env manually.'); }

const s3Client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const BASE_BACKUP_DIR = path.join(__dirname, 'storage_backup');

async function downloadFile(bucketName, key) {
  const downloadPath = path.join(BASE_BACKUP_DIR, bucketName, key);
  const dir = path.dirname(downloadPath);
  
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  const response = await s3Client.send(command).catch(err => {
      console.error(`\nFailed to download ${key}: ${err.message}`);
      return null;
  });
  
  if (response && response.Body) {
    await pipeline(response.Body, fs.createWriteStream(downloadPath));
  }
}

async function startBackup() {
  console.log('----------------------------------------------------');
  console.log('Starting FULL Storage Backup (All Buckets)');
  console.log('----------------------------------------------------');

  try {
    if (!fs.existsSync(BASE_BACKUP_DIR)) fs.mkdirSync(BASE_BACKUP_DIR);

    // 1. Find all available buckets
    const listBucketsCmd = new ListBucketsCommand({});
    const { Buckets } = await s3Client.send(listBucketsCmd);

    if (!Buckets || Buckets.length === 0) {
        console.log('No buckets found.');
        return;
    }

    console.log(`Found ${Buckets.length} buckets: ${Buckets.map(b => b.Name).join(', ')}`);

    // 2. Process each bucket
    for (const bucket of Buckets) {
      const bucketName = bucket.Name;
      console.log(`\n--- Processing Bucket: ${bucketName} ---`);
      
      let isTruncated = true;
      let continuationToken;
      let count = 0;

      while (isTruncated) {
        const listCommand = new ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken,
        });

        const { Contents, IsTruncated, NextContinuationToken } = await s3Client.send(listCommand);
        
        if (Contents) {
          for (const object of Contents) {
            if (object.Key.endsWith('/')) continue;
            process.stdout.write(`Downloading [${bucketName}]: ${object.Key}... `);
            await downloadFile(bucketName, object.Key);
            console.log('Done!');
            count++;
          }
        }

        isTruncated = IsTruncated;
        continuationToken = NextContinuationToken;
      }
      console.log(`Finished ${bucketName}: ${count} files.`);
    }

    console.log('\n----------------------------------------------------');
    console.log('SUCCESS! Full storage backup complete.');
    console.log('----------------------------------------------------');
  } catch (err) {
    console.error('Storage Backup Error:', err.message);
  }
}

startBackup();
