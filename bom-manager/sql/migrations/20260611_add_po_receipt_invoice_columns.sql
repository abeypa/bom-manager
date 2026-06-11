ALTER TABLE public.po_receipts
  ADD COLUMN IF NOT EXISTS invoice_file_path TEXT,
  ADD COLUMN IF NOT EXISTS invoice_file_name TEXT,
  ADD COLUMN IF NOT EXISTS invoice_file_mime_type TEXT;

DROP POLICY IF EXISTS "Users can update po receipts" ON public.po_receipts;

CREATE POLICY "Users can update po receipts" ON public.po_receipts
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
