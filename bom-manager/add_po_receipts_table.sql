-- Drop any partially created table
DROP TABLE IF EXISTS po_receipts CASCADE;

-- Add po_receipts table for clean receipt history (IN transactions)
CREATE TABLE po_receipts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  po_line_item_id BIGINT NOT NULL REFERENCES purchase_order_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  receipt_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_po_receipts_po_line_item_id ON po_receipts(po_line_item_id);
CREATE INDEX IF NOT EXISTS idx_po_receipts_receipt_date ON po_receipts(receipt_date);

-- Enable RLS (match project pattern)
ALTER TABLE po_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view po receipts" ON po_receipts
  FOR SELECT USING (true);

CREATE POLICY "Users can insert po receipts" ON po_receipts
  FOR INSERT WITH CHECK (true);
