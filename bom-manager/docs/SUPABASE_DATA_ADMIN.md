# Supabase Data Admin Guide

This project is already built around Supabase. The safest next step is not ad-hoc SQL in production, but a repeatable admin workflow for auditing and cleaning data.

## What This Adds

- A repo-native audit command: `npm run db:audit`
- A safe normalization command: `npm run db:normalize`
- Dry-run by default, with `--apply` required for writes
- Duplicate detection before any risky name/code cleanup is attempted

## Required Environment Variables

Add these to your local `bom-manager/.env` file:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_public_anon_key

SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Notes:

- `VITE_*` values are for the app itself.
- `SUPABASE_SERVICE_ROLE_KEY` is only for local admin scripts and must never be committed.
- `SUPABASE_URL` usually matches `VITE_SUPABASE_URL`.

## Recommended Workflow

1. Run a read-only audit:

```bash
npm run db:audit
```

2. Review the JSON report:

- `normalization.safe_update_candidates`
- `normalization.duplicate_groups`
- `integrity`

3. Preview safe cleanup changes:

```bash
npm run db:normalize
```

4. Apply only the low-risk cleanup pass:

```bash
npm run db:normalize -- --apply
```

5. Re-run the audit to confirm the database is cleaner:

```bash
npm run db:audit
```

## Table Filter

You can scope work to a smaller area:

```bash
npm run db:audit -- --table suppliers,projects
npm run db:normalize -- --table suppliers,project_sections --apply
```

## What Counts As Safe Cleanup

The normalization step only performs low-risk formatting fixes:

- Trims leading/trailing whitespace
- Collapses repeated spaces in human-readable text fields
- Lowercases email addresses
- Uppercases currencies
- Converts empty optional strings to `NULL`

It does not merge duplicate records, delete rows, or invent missing business data.

## What Still Needs Human Review

The audit can surface issues that should be reviewed manually before any merge/delete work:

- Duplicate suppliers
- Duplicate projects or project numbers
- Duplicate part numbers
- Orphan project hierarchy rows
- Project-part links pointing to missing master parts
- POs with missing supplier/project references

## Fresh Database Setup Note

This repository contains older setup docs plus newer migrations. For a fresh Supabase instance, treat the current migration folders as the source of truth for new application features:

- [`bom-manager/sql`](/E:/Coding/BOM%20Software/V3/bom-manager/sql)
- [`bom-manager/sql/migrations`](/E:/Coding/BOM%20Software/V3/bom-manager/sql/migrations)
- [`bom-manager/supabase/migrations`](/E:/Coding/BOM%20Software/V3/bom-manager/supabase/migrations)

If you want, the next step can be a dedicated migration consolidation pass so the setup flow is one clean path instead of historical layers.
