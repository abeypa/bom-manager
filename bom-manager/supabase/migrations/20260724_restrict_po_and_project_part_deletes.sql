-- Restrict purchase-order deletion to the designated owner account.
-- Replace the original broad FOR ALL policy with operation-specific policies.
DROP POLICY IF EXISTS "auth_all" ON public.purchase_orders;
DROP POLICY IF EXISTS "authenticated_purchase_orders_select" ON public.purchase_orders;
DROP POLICY IF EXISTS "authenticated_purchase_orders_insert" ON public.purchase_orders;
DROP POLICY IF EXISTS "authenticated_purchase_orders_update" ON public.purchase_orders;
DROP POLICY IF EXISTS "owner_purchase_orders_delete" ON public.purchase_orders;

CREATE POLICY "authenticated_purchase_orders_select"
  ON public.purchase_orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_purchase_orders_insert"
  ON public.purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_purchase_orders_update"
  ON public.purchase_orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "owner_purchase_orders_delete"
  ON public.purchase_orders FOR DELETE
  TO authenticated
  USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'abey.thomas@bepindia.com');

-- Prevent every client path from deleting a project-tree part while a PO
-- item still references it.
CREATE OR REPLACE FUNCTION public.prevent_linked_project_part_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_items
    WHERE project_part_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Cannot delete project part % because a purchase-order line references it', OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_linked_project_part_delete ON public.project_parts;
CREATE TRIGGER prevent_linked_project_part_delete
  BEFORE DELETE ON public.project_parts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_linked_project_part_delete();
