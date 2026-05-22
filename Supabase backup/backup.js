require('dotenv').config();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// 1. Prepare Connection Details
const dbHost = process.env.DB_HOST || 'db.buvzefqfoeyupxsmhgkd.supabase.co';
const dbUser = process.env.DB_USER || 'postgres';
const dbName = process.env.DB_NAME || 'postgres';
const dbPort = process.env.DB_PORT || '5432';
const dbPassword = process.env.DB_PASSWORD;

// 2. Create Timestamped Filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const outputFile = path.join(__dirname, `backup_${timestamp}.sql`);

console.log('----------------------------------------------------');
console.log('Backing up BOM Manager Database...');
console.log(`Target: ${dbHost}`);
console.log(`Output: ${outputFile}`);
console.log('----------------------------------------------------');

// 3. Build Connection String (Encoded)
const connString = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${dbName}`;

// 4. Run the backup using npx (No local install needed)
console.log('Running: npx pg-dump...');

exec(`npx pg-dump "${connString}" > "${outputFile}"`, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error: ${error.message}`);
        return;
    }
    if (stderr && !stderr.includes('dumping')) {
        console.error(`Status: ${stderr}`);
    }
    
    console.log('----------------------------------------------------');
    console.log('SUCCESS! Your backup is saved.');
    console.log('----------------------------------------------------');
});
