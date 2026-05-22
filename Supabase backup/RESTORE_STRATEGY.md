# 🏗️ BOM Manager - Restore Strategy

Follow this guide to restore your **Database** and **Storage Files** to a new or existing Supabase project.

---

## Phase 1: Restore the Database (.sql file)

### Option A: Restore to a NEW Project (Recommended for disaster recovery)
1.  Create a new project in the Supabase Dashboard.
2.  Open the **SQL Editor** in your new project.
3.  Copy and paste the contents of your latest `.sql` backup file into the SQL Editor and click **Run**.
    *   *Note: If the file is too large (over 5MB), use the command line below.*

### Option B: Command Line Restore
If you have `psql` installed, run this in your terminal:
```powershell
psql -h db.buvzefqfoeyupxsmhgkd.supabase.co -U postgres -d postgres -f "YOUR_BACKUP_FILE.sql"
```

---

## Phase 2: Restore Storage Files (Pictures/Docs)

To upload all your files back to the storage buckets, use the **[`restore_storage.js`](./restore_storage.js)** script included in this folder.

### 1. Update your `.env`
If you are restoring to a **new project**, you MUST update the `.env` file with the **new project's** keys:
*   `S3_ACCESS_KEY_ID`
*   `S3_SECRET_ACCESS_KEY`
*   `S3_ENDPOINT`

### 2. Run the Restore Script
```powershell
node restore_storage.js
```
This script will:
*   Re-create the buckets (like `drawings`).
*   Upload every file from your `storage_backup` folder back to the clouds.

---

## Phase 3: Verification Check
1.  **Check Projects**: Log in to your app and ensure your projects list is visible.
2.  **Check Pictures**: Open a part and verify its drawing/picture is displaying.
3.  **Check Permissions**: Ensure your RLS policies (from the .sql file) are active so users can only see what they should.

---

## ⚠️ Important Notes
*   **Sequence**: Always restore the **Database (.sql)** FIRST, then the **Storage Files**.
*   **Existing Data**: If you restore to a project that already has data, you might get "Duplicate Primary Key" errors. It is best to restore to a clean schema.
