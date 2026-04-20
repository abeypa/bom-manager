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
};
