# Production Setup Guide

This guide ensures your BOM Manager application is correctly configured for production deployment.

## 1. Database & Security Setup

Run the following SQL in your Supabase SQL Editor. This script prepares all tables and ensures Row-Level Security (RLS) policies are correctly set.

```sql
-- ENABLE RLS ON ALL TABLES
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON "projects";
CREATE POLICY "Allow All" ON "projects" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "project_sections" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON "project_sections";
CREATE POLICY "Allow All" ON "project_sections" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "project_parts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON "project_parts";
CREATE POLICY "Allow All" ON "project_parts" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON "suppliers";
CREATE POLICY "Allow All" ON "suppliers" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "mechanical_manufacture" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON "mechanical_manufacture";
CREATE POLICY "Allow All" ON "mechanical_manufacture" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "mechanical_bought_out" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON "mechanical_bought_out";
CREATE POLICY "Allow All" ON "mechanical_bought_out" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "electrical_manufacture" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON "electrical_manufacture";
CREATE POLICY "Allow All" ON "electrical_manufacture" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "electrical_bought_out" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON "electrical_bought_out";
CREATE POLICY "Allow All" ON "electrical_bought_out" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "pneumatic_bought_out" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON "pneumatic_bought_out";
CREATE POLICY "Allow All" ON "pneumatic_bought_out" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON "stock_movements";
CREATE POLICY "Allow All" ON "stock_movements" FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE "part_price_history" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow All" ON "part_price_history";
CREATE POLICY "Allow All" ON "part_price_history" FOR ALL USING (true) WITH CHECK (true);
```

## 2. Storage Configuration (Images & CAD)

1. Create a **Public** bucket named `bom_assets` in Supabase Storage.
2. Run the following SQL to enable uploads and access:

```sql
-- Ensure the bucket is PUBLIC
INSERT INTO storage.buckets (id, name, public)
VALUES ('bom_assets', 'bom_assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public Read Access
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
CREATE POLICY "Public Read Access" ON storage.objects FOR SELECT USING ( bucket_id = 'bom_assets' );

-- Authenticated Upload Access
DROP POLICY IF EXISTS "Allow Authenticated Uploads" ON storage.objects;
CREATE POLICY "Allow Authenticated Uploads" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'bom_assets' );

-- Authenticated Update/Delete Access
DROP POLICY IF EXISTS "Allow Authenticated Updates" ON storage.objects;
CREATE POLICY "Allow Authenticated Updates" ON storage.objects FOR UPDATE USING ( bucket_id = 'bom_assets' );

DROP POLICY IF EXISTS "Allow Authenticated Deletes" ON storage.objects;
CREATE POLICY "Allow Authenticated Deletes" ON storage.objects FOR DELETE USING ( bucket_id = 'bom_assets' );
```

## 3. Environment Variables

Create a `.env.production` file for your deployment platform (e.g., Cloudflare Pages):

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 4. Features & Assets

- **Unified Bucket:** All assets (Images, CAD, PDF Drawings, Datasheets) are now stored in the `bom_assets` bucket.
- **Clipboard Paste:** Images can be pasted directly (Ctrl+V) into the "Visual" and "Engineering Assets" sections.
- **JSON Import:** A strict schema is required for part imports. Ensure categories match table names.
- **Stock Movement:** Stock adjustments are logged in both the project view and the master "Registry" for audit purposes.
