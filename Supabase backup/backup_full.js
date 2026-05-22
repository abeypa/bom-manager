const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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

const config = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'db.buvzefqfoeyupxsmhgkd.supabase.co',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD,
  port: 5432,
  ssl: { rejectUnauthorized: false }
};

if (!config.password || config.password === 'your_database_password_here') {
    console.error('ERROR: Database password not found in .env!');
    process.exit(1);
}

async function backup() {
  const client = new Client(config);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const outputFile = path.join(__dirname, `BOM_MANAGER_BACKUP_${timestamp}.sql`);
  const stream = fs.createWriteStream(outputFile);

  try {
    console.log('Connecting to Supabase...');
    await client.connect();
    console.log('Connected! Starting data export...');

    // 1. Get all public tables
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);

    const tables = tableRes.rows.map(r => r.table_name);
    console.log(`Found ${tables.length} tables to backup...`);

    stream.write(`-- DB BACKUP: BOM Manager / EngineFlow-PM --\n`);
    stream.write(`-- Generated at: ${new Date().toISOString()} --\n\n`);

    // 2. Dump each table
    for (const table of tables) {
      console.log(`Exporting table: ${table}...`);
      stream.write(`-- Table: ${table} --\n`);
      
      const dataRes = await client.query(`SELECT * FROM "${table}"`);
      
      if (dataRes.rows.length === 0) {
        stream.write(`-- (Empty table: ${table})\n\n`);
        continue;
      }

      // Generate INSERT statements
      for (const row of dataRes.rows) {
        const columns = Object.keys(row).map(c => `"${c}"`).join(', ');
        const values = Object.values(row).map(v => {
          if (v === null) return 'NULL';
          if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
          if (v instanceof Date) return `'${v.toISOString()}'`;
          return v;
        }).join(', ');
        
        stream.write(`INSERT INTO "${table}" (${columns}) VALUES (${values});\n`);
      }
      stream.write(`\n`);
    }

    console.log('----------------------------------------------------');
    console.log('SUCCESS! Pure JS backup completed.');
    console.log(`File: ${outputFile}`);
    console.log('----------------------------------------------------');

  } catch (err) {
    console.error('Backup Error:', err.message);
  } finally {
    await client.end();
    stream.end();
  }
}

backup();
