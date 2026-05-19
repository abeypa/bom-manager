-- Review choices captured during multi-PO ingestion.
-- These fields let each PO resolve to a supplier and each line resolve to
-- a part category plus the target project subsection before conversion.

ALTER TABLE po_ingestion_documents
  ADD COLUMN IF NOT EXISTS supplier_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS new_supplier_name TEXT;

ALTER TABLE po_ingestion_lines
  ADD COLUMN IF NOT EXISTS selected_part_type TEXT,
  ADD COLUMN IF NOT EXISTS target_project_subsection_id BIGINT REFERENCES project_subsections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_project_part_id BIGINT REFERENCES project_parts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_ingestion_documents_supplier_id
  ON po_ingestion_documents(supplier_id);

CREATE INDEX IF NOT EXISTS idx_po_ingestion_lines_selected_part_type
  ON po_ingestion_lines(selected_part_type);

CREATE INDEX IF NOT EXISTS idx_po_ingestion_lines_target_project_subsection_id
  ON po_ingestion_lines(target_project_subsection_id);
