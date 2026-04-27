-- 20260427_pending_parts_ux_enhancements.sql
-- Migration: Add UX Enhancements to Pending Parts

-- 1. Add approval tracking columns
ALTER TABLE public.pending_parts
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Add rich media support to comments
ALTER TABLE public.pending_part_comments
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
