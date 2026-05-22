# Supabase backup toolkit

This folder now follows a simpler standard:

- `backup_full.js`: full database + storage backup
- `backup_incremental.js`: incremental database + storage backup
- `restore_backup.js`: restore a saved backup
- `database_overview.sql`: inspection query for Supabase SQL Editor

## Before you run anything

1. Install PostgreSQL client tools so `pg_dump` and `psql` are available on your laptop.
2. Copy `.env.example` to `.env` if you ever need to recreate the file.
3. Keep your real `.env` private. It contains credentials.

## Recommended order

1. Review the database in Supabase SQL Editor with [`database_overview.sql`](./database_overview.sql)
2. Run a full backup first
3. Run incremental backups during normal work
4. Restore to a clean project when disaster recovery is needed

## Commands

```powershell
cd "E:\Coding\BOM Software\V3\Supabase backup"
npm install
npm run backup:full
npm run backup:incremental
npm run restore -- --backup ".\backups\full\YOUR_BACKUP_FOLDER"
```

## What full backup does

- dumps configured schemas with `pg_dump`
- saves schema and data separately
- downloads Supabase Storage objects
- records a baseline state for later incremental backups

## What incremental backup does

- exports row changes only for tables that have a cursor column like `updated_at`
- downloads only new or changed storage objects
- keeps a local state file in `runtime/state/backup-state.json`

## Important note about "progressive" backups

This toolkit provides an application-level incremental backup.

That means:

- inserts and updates are covered for configured tables
- hard deletes are not captured
- exact point-in-time recovery still requires Supabase PITR/WAL backups

Supabase recommends logical exports with `pg_dump` or the Supabase CLI for downloadable backups, and Storage objects must be backed up separately from the database.
