-- Run this in Supabase SQL Editor for a high-level picture of the database.

-- 1. Schemas
SELECT schema_name
FROM information_schema.schemata
ORDER BY schema_name;

-- 2. Tables with estimated row counts and size
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.reltuples::bigint AS estimated_rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname;

-- 3. Columns
SELECT
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name, ordinal_position;

-- 4. Primary keys
SELECT
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
 AND tc.table_name = kcu.table_name
WHERE tc.constraint_type = 'PRIMARY KEY'
ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position;

-- 5. Foreign keys
SELECT
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_schema, tc.table_name, kcu.column_name;

-- 6. Indexes
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename, indexname;

-- 7. RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
ORDER BY schemaname, tablename, policyname;

-- 8. Triggers
SELECT
  event_object_schema AS schema_name,
  event_object_table AS table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
ORDER BY event_object_schema, event_object_table, trigger_name;

-- 9. Storage buckets
SELECT *
FROM storage.buckets
ORDER BY id;

-- 10. Storage object count per bucket
SELECT
  bucket_id,
  COUNT(*) AS object_count
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;
