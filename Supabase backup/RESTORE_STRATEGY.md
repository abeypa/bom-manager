# Restore strategy

Use a new or empty Supabase project whenever possible.

## 1. Restore a full backup

```powershell
cd "E:\Coding\BOM Software\V3\Supabase backup"
node restore_backup.js --backup ".\backups\full\YOUR_BACKUP_FOLDER"
```

This restores:

- `database/schema.sql`
- `database/data.sql`
- all downloaded storage objects in the backup folder

## 2. Restore an incremental backup

Only run this after the related full backup has already been restored.

```powershell
cd "E:\Coding\BOM Software\V3\Supabase backup"
node restore_backup.js --backup ".\backups\incremental\YOUR_INCREMENTAL_FOLDER" --database-only
```

## 3. Important limitations

- The incremental database backup is application-level, not WAL/PITR.
- It captures inserts and updates for tables that have a timestamp cursor column such as `updated_at`.
- Hard deletes are not replayed by the incremental script.
- For exact point-in-time recovery, use Supabase PITR in the Dashboard.
