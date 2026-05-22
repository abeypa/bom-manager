const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const mime = require('mime-types'); // You'll need to run: npm install mime-types

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
  region: process.env.S3_REGION || 'ap-northeast-2',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const BACKUP_DIR = path.join(__dirname, 'storage_backup');

async function uploadFile(bucketPath, relativePath) {
  const fullPath = path.join(BACKUP_DIR, bucketPath, relativePath);
  const fileStream = fs.createReadStream(fullPath);
  const contentType = mime.lookup(fullPath) || 'application/octet-stream';

  const command = new PutObjectCommand({
    Bucket: bucketPath,
    Key: relativePath.replace(/\\/g, '/'), // S3 uses forward slashes
    Body: fileStream,
    ContentType: contentType,
  });

  await s3Client.send(command).catch(err => {
    if (err.name === 'NoSuchBucket') {
        console.error(`\nERROR: Bucket "${bucketPath}" does not exist in the new project. Please create it first in the Supabase Dashboard!`);
    } else {
        console.error(`\nFailed to upload ${relativePath}: ${err.message}`);
    }
    throw err;
  });
}

function getFiles(dir, allFiles = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, allFiles);
    } else {
      allFiles.push(name);
    }
  }
  return allFiles;
}

async function startRestore() {
  console.log('----------------------------------------------------');
  console.log('Starting Storage RESTORE (Uploading to Supabase)');
  console.log('----------------------------------------------------');

  if (!fs.existsSync(BACKUP_DIR)) {
      console.error('Error: "storage_backup" folder not found! Run backup_storage.js first.');
      return;
  }

  try {
    const bucketFolders = fs.readdirSync(BACKUP_DIR).filter(f => fs.statSync(path.join(BACKUP_DIR, f)).isDirectory());
    
    for (const bucket of bucketFolders) {
        console.log(`\n--- Restoring Bucket: ${bucket} ---`);
        const bucketPath = path.join(BACKUP_DIR, bucket);
        const files = getFiles(bucketPath);
        
        let count = 0;
        for (const fullPath of files) {
            const relativePath = path.relative(bucketPath, fullPath);
            process.stdout.write(`Uploading to [${bucket}]: ${relativePath}... `);
            await uploadFile(bucket, relativePath);
            console.log('Done!');
            count++;
        }
        console.log(`Finished ${bucket}: ${count} files restored.`);
    }

    console.log('\n----------------------------------------------------');
    console.log('SUCCESS! Full storage restore complete.');
    console.log('----------------------------------------------------');
  } catch (err) {
    console.error('\nRestore Stopped Due to Error:', err.message);
  }
}

startRestore();
