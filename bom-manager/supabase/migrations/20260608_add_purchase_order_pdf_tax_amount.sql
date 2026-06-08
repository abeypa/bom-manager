ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18, 2);
