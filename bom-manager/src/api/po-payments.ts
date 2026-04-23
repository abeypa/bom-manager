import { supabase } from '@/lib/supabase';

export type PaymentType = 'Advance' | 'Partial' | 'Final' | 'Refund';
export type PaymentMode = 'Bank Transfer' | 'Cheque' | 'Cash' | 'UPI' | 'Credit Card' | 'Other';

export interface POPayment {
  id: number;
  purchase_order_id: number;
  payment_date: string;
  amount: number;
  payment_type: PaymentType;
  payment_mode: PaymentMode;
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface POPaymentInsert {
  purchase_order_id: number;
  payment_date?: string;
  amount: number;
  payment_type: PaymentType;
  payment_mode?: PaymentMode;
  reference_number?: string | null;
  notes?: string | null;
}

export const poPaymentsApi = {
  getByPO: async (poId: number): Promise<POPayment[]> => {
    const { data, error } = await supabase
      .from('po_payments')
      .select('*')
      .eq('purchase_order_id', poId)
      .order('payment_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  add: async (payment: POPaymentInsert): Promise<POPayment> => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('po_payments')
      .insert([{ ...payment, created_by: user?.email || 'system' }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  delete: async (id: number): Promise<void> => {
    const { error } = await supabase.from('po_payments').delete().eq('id', id);
    if (error) throw error;
  },

  updateDelivery: async (
    poId: number,
    payload: { actual_delivery_date?: string; expected_delivery_date?: string; delivery_notes?: string }
  ) => {
    const { data, error } = await (supabase as any)
      .from('purchase_orders')
      .update({ ...payload, updated_date: new Date().toISOString() })
      .eq('id', poId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  receiveItems: async (
    poId: number,
    items: Array<{ id: number; received_qty: number }>
  ) => {
    const userEmail = (await supabase.auth.getUser()).data.user?.email || 'system';
    for (const item of items) {
      if (item.received_qty <= 0) continue;

      const { data: poItem } = await supabase
        .from('purchase_order_items')
        .select('*, po:purchase_orders(po_number)')
        .eq('id', item.id)
        .single();

      if (!poItem) continue;

      const partTable = (poItem as any).part_type;
      const partId = (poItem as any).part_id;
      const poNumber = (poItem as any).po?.po_number;

      if (!partTable || !partId) continue;

      const { data: part } = await (supabase as any)
        .from(partTable)
        .select('stock_quantity, part_number')
        .eq('id', partId)
        .single();

      if (!part) continue;

      const newStock = (part.stock_quantity || 0) + item.received_qty;

      await Promise.all([
        (supabase as any)
          .from(partTable)
          .update({ stock_quantity: newStock, updated_date: new Date().toISOString() })
          .eq('id', partId),
        (supabase as any).from('stock_movements').insert({
          movement_type: 'IN',
          part_table_name: partTable,
          part_id: partId,
          part_number: part.part_number,
          quantity: item.received_qty,
          stock_before: part.stock_quantity || 0,
          stock_after: newStock,
          po_number: poNumber,
          moved_by: userEmail,
        }),
        (supabase as any)
          .from('purchase_order_items')
          .update({ received_qty: ((poItem as any).received_qty || 0) + item.received_qty })
          .eq('id', item.id),
        (supabase as any).from('po_receipts').insert({
          po_line_item_id: item.id,
          quantity: item.received_qty,
          receipt_date: new Date().toISOString(),
          notes: 'Batch receipt from Delivery tab',
          created_by: (await supabase.auth.getUser()).data.user?.id || null
        })
      ]);
    }

    // Check if all items fully received → update PO status to Received
    const { data: allItems } = await supabase
      .from('purchase_order_items')
      .select('quantity, received_qty')
      .eq('purchase_order_id', poId);

    const allReceived =
      allItems &&
      allItems.length > 0 &&
      allItems.every((i: any) => (i.received_qty || 0) >= i.quantity);

    if (allReceived) {
      await (supabase as any)
        .from('purchase_orders')
        .update({
          status: 'Received',
          actual_delivery_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        })
        .eq('id', poId);
    }

    return { success: true };
  },

  getReceiptsByPO: async (poId: number): Promise<any[]> => {
    try {
      const { data, error } = await supabase
        .from('po_receipts')
        .select(`
          *,
          purchase_order_items!inner(
            part_number,
            description,
            purchase_order_id
          )
        `)
        .eq('purchase_order_items.purchase_order_id', poId)
        .order('receipt_date', { ascending: false });

      if (error) {
        console.error('Error fetching receipts:', error);
        return [];
      }
      return data || [];
    } catch (e) {
      console.error('Receipts fetch crash:', e);
      return [];
    }
  },
};

export const receivePoItem = async (
  poLineItemId: number | string,
  quantity: number,
  receiptDate?: string,
  notes?: string
): Promise<void> => {
  if (quantity <= 0) throw new Error('Quantity must be greater than 0');

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  const userEmail = userData.user?.email || 'system';

  // 1. Fetch PO Line Item context
  const { data: poItem, error: poItemErr } = await supabase
    .from('purchase_order_items')
    .select('*, po:purchase_orders(po_number, id)')
    .eq('id', poLineItemId)
    .single();

  if (poItemErr || !poItem) throw new Error('PO Line item not found');

  const partTable = (poItem as any).part_type;
  const partId = (poItem as any).part_id;
  const poNumber = (poItem as any).po?.po_number;
  const purchaseOrderId = (poItem as any).po?.id;

  if (!partTable || !partId) throw new Error('Part metadata missing on line item');

  // 2. Fetch master Part
  const { data: part, error: partErr } = await (supabase as any)
    .from(partTable)
    .select('stock_quantity, part_number')
    .eq('id', partId)
    .single();

  if (partErr || !part) throw new Error('Master part not found');

  const newStock = (part.stock_quantity || 0) + quantity;

  // 3. Execute queries atomically
  await Promise.all([
    // Update master stock
    (supabase as any)
      .from(partTable)
      .update({ stock_quantity: newStock, updated_date: new Date().toISOString() })
      .eq('id', partId),
      
    // Log typical stock movement ledger
    (supabase as any).from('stock_movements').insert({
      movement_type: 'IN',
      part_table_name: partTable,
      part_id: partId,
      part_number: part.part_number,
      quantity: quantity,
      stock_before: part.stock_quantity || 0,
      stock_after: newStock,
      po_number: poNumber,
      moved_by: userEmail,
    }),
    
    // Save to the dedicated receipts table
    (supabase as any).from('po_receipts').insert({
      po_line_item_id: poLineItemId,
      quantity,
      receipt_date: receiptDate ? new Date(receiptDate).toISOString() : new Date().toISOString(),
      notes: notes || null,
      created_by: userId || null
    }),
    
    // Maintain legacy received_qty increment
    (supabase as any)
      .from('purchase_order_items')
      .update({ received_qty: ((poItem as any).received_qty || 0) + quantity })
      .eq('id', poLineItemId),
  ]);

  // Check if entire PO is now fully received
  const { data: allItems } = await supabase
    .from('purchase_order_items')
    .select('id, quantity, received_qty')
    .eq('purchase_order_id', purchaseOrderId);
    
  if (allItems && allItems.length > 0) {
    const allReceived = allItems.every((i: any) => {
      // For the item we just updated, use the new qty
      if (i.id == poLineItemId) {
        return ((i.received_qty || 0) + quantity) >= i.quantity;
      }
      return (i.received_qty || 0) >= i.quantity;
    });

    if (allReceived) {
      await (supabase as any)
        .from('purchase_orders')
        .update({
          status: 'Received',
          actual_delivery_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        })
        .eq('id', purchaseOrderId);
    }
  }
};

export const issueOutPoItem = async (
  poLineItemId: number | string,
  quantity: number,
  issueDate?: string,
  notes?: string
): Promise<void> => {
  if (quantity <= 0) throw new Error('Quantity must be greater than 0');

  const { data: userData } = await supabase.auth.getUser();
  const userEmail = userData.user?.email || 'system';

  // 1. Fetch PO Line Item context
  const { data: poItem, error: poItemErr } = await supabase
    .from('purchase_order_items')
    .select('*, po:purchase_orders(po_number, id)')
    .eq('id', poLineItemId)
    .single();

  if (poItemErr || !poItem) throw new Error('PO Line item not found');

  const partTable = (poItem as any).part_type;
  const partId = (poItem as any).part_id;
  const poNumber = (poItem as any).po?.po_number;

  if (!partTable || !partId) throw new Error('Part metadata missing on line item');

  // 2. Fetch master Part
  const { data: part, error: partErr } = await (supabase as any)
    .from(partTable)
    .select('stock_quantity, part_number')
    .eq('id', partId)
    .single();

  if (partErr || !part) throw new Error('Master part not found');

  const stockBefore = part.stock_quantity || 0;
  if (quantity > stockBefore) {
    throw new Error(`Cannot issue ${quantity} parts. Only ${stockBefore} in stock.`);
  }

  const newStock = stockBefore - quantity;

  // 3. Execute queries atomically
  await Promise.all([
    // Update master stock
    (supabase as any)
      .from(partTable)
      .update({ stock_quantity: newStock, updated_date: new Date().toISOString() })
      .eq('id', partId),
      
    // Log stock movement OUT
    (supabase as any).from('stock_movements').insert({
      movement_type: 'OUT',
      part_table_name: partTable,
      part_id: partId,
      part_number: part.part_number,
      quantity: quantity, // quantity is positive, type is OUT
      stock_before: stockBefore,
      stock_after: newStock,
      po_number: poNumber,
      moved_by: userEmail,
      notes: notes || null
    }),
    
    // Also log in part_usage_logs for backward compatibility
    (supabase as any).from('part_usage_logs').insert({
      project_name: poItem.project_part_id ? 'Project Allocation' : 'General Issue',
      site_name: `PO: ${poNumber}`,
      part_number: part.part_number,
      part_table_name: partTable,
      quantity: quantity, // or -quantity based on backend norms, usually positive since they group by
      use_date_time: issueDate ? new Date(issueDate).toISOString() : new Date().toISOString(),
      created_date: new Date().toISOString()
    })
  ]);
};
