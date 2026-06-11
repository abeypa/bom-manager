CREATE TABLE IF NOT EXISTS public.purchase_order_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id BIGINT NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  po_receipt_id UUID REFERENCES public.po_receipts(id) ON DELETE CASCADE,
  po_line_item_id BIGINT REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_attachments_po_id
  ON public.purchase_order_attachments(purchase_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_attachments_receipt_id
  ON public.purchase_order_attachments(po_receipt_id, created_at DESC);

ALTER TABLE public.purchase_order_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view purchase order attachments" ON public.purchase_order_attachments;
CREATE POLICY "Users can view purchase order attachments" ON public.purchase_order_attachments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert purchase order attachments" ON public.purchase_order_attachments;
CREATE POLICY "Users can insert purchase order attachments" ON public.purchase_order_attachments
  FOR INSERT WITH CHECK (true);
