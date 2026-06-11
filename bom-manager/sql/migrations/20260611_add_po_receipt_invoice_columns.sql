ALTER TABLE public.po_receipts
  ADD COLUMN IF NOT EXISTS invoice_file_path TEXT,
  ADD COLUMN IF NOT EXISTS invoice_file_name TEXT,
  ADD COLUMN IF NOT EXISTS invoice_file_mime_type TEXT;
