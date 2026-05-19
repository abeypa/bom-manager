-- Multi-PO ingestion staging tables.
-- These tables store extracted PO documents and line items before they are
-- matched to master parts or converted into draft purchase orders.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS po_ingestion_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'matched', 'converted', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'manual_upload',
  notes TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS po_ingestion_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES po_ingestion_batches(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  page_count INTEGER,
  po_number TEXT,
  supplier_name TEXT,
  po_date DATE,
  currency TEXT NOT NULL DEFAULT 'INR',
  subtotal NUMERIC(14, 2),
  total_amount NUMERIC(14, 2),
  parse_status TEXT NOT NULL DEFAULT 'parsed'
    CHECK (parse_status IN ('parsed', 'needs_review', 'needs_ocr', 'failed')),
  parse_warnings TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS po_ingestion_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES po_ingestion_batches(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES po_ingestion_documents(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  item_code TEXT,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(14, 3),
  unit_price NUMERIC(14, 2),
  discount_percent NUMERIC(6, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14, 2),
  currency TEXT NOT NULL DEFAULT 'INR',
  raw_line TEXT,
  match_status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'matched_master', 'matched_project_part', 'missing_master', 'ignored')),
  matched_part_type TEXT,
  matched_part_id BIGINT,
  matched_project_part_id BIGINT REFERENCES project_parts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_ingestion_batches_project_id
  ON po_ingestion_batches(project_id);

CREATE INDEX IF NOT EXISTS idx_po_ingestion_documents_batch_id
  ON po_ingestion_documents(batch_id);

CREATE INDEX IF NOT EXISTS idx_po_ingestion_documents_po_number
  ON po_ingestion_documents(po_number);

CREATE INDEX IF NOT EXISTS idx_po_ingestion_lines_batch_id
  ON po_ingestion_lines(batch_id);

CREATE INDEX IF NOT EXISTS idx_po_ingestion_lines_document_id
  ON po_ingestion_lines(document_id);

CREATE INDEX IF NOT EXISTS idx_po_ingestion_lines_item_code
  ON po_ingestion_lines(item_code);

ALTER TABLE po_ingestion_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_ingestion_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_ingestion_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_po_ingestion_batches"
  ON po_ingestion_batches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_write_po_ingestion_batches"
  ON po_ingestion_batches FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_read_po_ingestion_documents"
  ON po_ingestion_documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_write_po_ingestion_documents"
  ON po_ingestion_documents FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_read_po_ingestion_lines"
  ON po_ingestion_lines FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_write_po_ingestion_lines"
  ON po_ingestion_lines FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
