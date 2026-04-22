import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type PurchaseOrder = Database['public']['Tables']['purchase_orders']['Row']
export type PurchaseOrderInsert = Database['public']['Tables']['purchase_orders']['Insert']
export type PurchaseOrderUpdate = Database['public']['Tables']['purchase_orders']['Update']
export type PurchaseOrderItem = Database['public']['Tables']['purchase_order_items']['Row']

// Updated status with Draft as initial state
export type POStatus = 'Draft' | 'Released' | 'Pending' | 'Sent' | 'Confirmed' | 'Partial' | 'Received' | 'Cancelled';

export const purchaseOrdersApi = {
  // Get all POs
  getAll: async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers (name),
        project:projects (project_name)
      `)
      .order('created_date', { ascending: false });
    if (error) throw error;
    return data;
  },

  getPurchaseOrders: async () => {
    return purchaseOrdersApi.getAll();
  },

  getProjectPurchaseOrders: async (projectId: number) => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers (name)
      `)
      .eq('project_id', projectId)
      .order('po_date', { ascending: false })
      
    if (error) throw error
    return data
  },

  getById: async (poId: number) => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers (*),
        project:projects (id, project_name, project_number),
        purchase_order_items (*)
      `)
      .eq('id', poId)
      .single();
    if (error) throw error;
    
    let po = data as any;

    // Fetch project numbers for the items safely
    if (po && po.purchase_order_items && po.purchase_order_items.length > 0) {
      const projectPartIds = po.purchase_order_items
        .map((item: any) => item.project_part_id)
        .filter(Boolean);
        
      if (projectPartIds.length > 0) {
        const { data: partsData } = await supabase
          .from('project_parts')
          .select(`
            id,
            project_subsection:project_subsections (
              section:project_sections (
                project:projects (
                  id,
                  project_name,
                  project_number
                )
              )
            )
          `)
          .in('id', projectPartIds);
          
        if (partsData) {
          const partMap = new Map(partsData.map((p: any) => [p.id, p]));
          po.purchase_order_items = po.purchase_order_items.map((item: any) => {
            if (item.project_part_id && partMap.has(item.project_part_id)) {
              return {
                ...item,
                project_part: partMap.get(item.project_part_id)
              };
            }
            return item;
          });
        }
      }

      // ── Resolve Manufacturer Part Numbers from Master Registries ──
      const itemsByType: Record<string, { ids: number[], numbers: string[] }> = {};
      po.purchase_order_items.forEach((item: any) => {
        if (item.part_type) {
          if (!itemsByType[item.part_type]) itemsByType[item.part_type] = { ids: [], numbers: [] };
          if (item.part_id) {
            itemsByType[item.part_type].ids.push(item.part_id);
          } else if (item.part_number) {
            itemsByType[item.part_type].numbers.push(item.part_number);
          }
        }
      });

      const masterDetailsMap: Record<string, Record<string | number, any>> = {};
      for (const [partType, data] of Object.entries(itemsByType)) {
        masterDetailsMap[partType] = {};
        
        // Fetch by ID
        if (data.ids.length > 0) {
          const { data: byId } = await (supabase as any)
            .from(partType)
            .select('id, part_number, manufacturer_part_number')
            .in('id', data.ids);
          
          byId?.forEach((d: any) => {
            masterDetailsMap[partType][d.id] = d;
            masterDetailsMap[partType][d.part_number] = d; // Map by number too for extra safety
          });
        }

        // Catch-all by Part Number for older records without part_id
        if (data.numbers.length > 0) {
          const { data: byNum } = await (supabase as any)
            .from(partType)
            .select('id, part_number, manufacturer_part_number')
            .in('part_number', data.numbers);
          
          byNum?.forEach((d: any) => {
            masterDetailsMap[partType][d.part_number] = d;
          });
        }
      }

      po.purchase_order_items = po.purchase_order_items.map((item: any) => {
        let master = null;
        if (item.part_id) {
          master = masterDetailsMap[item.part_type]?.[item.part_id];
        }
        if (!master && item.part_number) {
          master = masterDetailsMap[item.part_type]?.[item.part_number];
        }

        return {
          ...item,
          manufacturer_part_number: master?.manufacturer_part_number || null
        };
      });
    }

    return po;
  },

  getPurchaseOrder: async (id: number) => {
    return purchaseOrdersApi.getById(id);
  },

  // Create new PO
  create: async (poData: PurchaseOrderInsert) => {
    const { data, error } = await (supabase as any)
      .from('purchase_orders')
      .insert([poData])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updatePurchaseOrder: async (poId: number, updateData: any) => {
    const { data, error } = await (supabase as any)
      .from('purchase_orders')
      .update(updateData)
      .eq('id', poId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  createPurchaseOrderWithItems: async (po: PurchaseOrderInsert, items: any[]) => {
    const { data: newPO, error: poError } = await (supabase as any).from('purchase_orders')
      .insert([po])
      .select()
      .single();

    if (poError) throw poError;

    const itemsWithPOId = items.map(item => ({
      ...item,
      purchase_order_id: newPO.id
    }));

    const { error: itemsError } = await ((supabase as any).from('purchase_order_items') as any)
      .insert(itemsWithPOId);

    if (itemsError) {
      await (supabase as any).from('purchase_orders').delete().eq('id', newPO.id);
      throw itemsError;
    }

    return newPO;
  },

  // Transition from Draft to Released (requires PDF)
  releasePO: async (poId: number) => {
    const { data: po, error: fetchError } = await supabase
      .from('purchase_orders')
      .select('status, bep_po_pdf_url')
      .eq('id', poId)
      .single();

    if (fetchError) throw fetchError;
    if (!po) throw new Error('PO not found');

    if ((po as any).status !== 'Draft') {
      throw new Error('Only Draft POs can be released');
    }

    if (!(po as any).bep_po_pdf_url) {
      throw new Error('Cannot release PO. Please attach BEP PO PDF document first.');
    }

    const { data, error } = await (supabase as any)
      .from('purchase_orders')
      .update({ 
        status: 'Released', 
        updated_date: new Date().toISOString() 
      })
      .eq('id', poId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Update PO status with validation
  updateStatus: async (poId: number, newStatus: POStatus) => {
    const { data: current } = await supabase
      .from('purchase_orders')
      .select('status, bep_po_pdf_url')
      .eq('id', poId)
      .single();

    if (!current) throw new Error('PO not found');
    const currentStatus = (current as any).status || 'Draft';

    // Transition rules
    const validTransitions: Record<string, POStatus[]> = {
      'Draft':     ['Released', 'Cancelled'],
      'Released':  ['Sent', 'Cancelled'],
      'Pending':   ['Sent', 'Cancelled'],
      'Sent':      ['Confirmed', 'Cancelled'],
      'Confirmed': ['Partial', 'Received', 'Cancelled'],
      'Partial':   ['Received', 'Cancelled'],
    };

    if (validTransitions[currentStatus] && !validTransitions[currentStatus].includes(newStatus)) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }

    // Special rule for release
    if (newStatus === 'Released' && !(current as any).bep_po_pdf_url) {
      throw new Error('Cannot release PO without attaching BEP PO PDF');
    }

    const { data, error } = await (supabase as any)
      .from('purchase_orders')
      .update({ 
        status: newStatus, 
        updated_date: new Date().toISOString() 
      })
      .eq('id', poId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Receive items (CRITICAL: updates stock + logs movement)
  receiveItems: async (poId: number, receivedItems: Array<{ id: number; received_qty: number }>) => {
    const userEmail = (await supabase.auth.getUser()).data.user?.email || 'system';
    
    for (const itemRequest of receivedItems) {
      if (itemRequest.received_qty <= 0) continue;

      // Get current PO item to find its master part
      const { data: poItem } = await supabase
        .from('purchase_order_items')
        .select(`*, po:purchase_orders(id, po_number)`)
        .eq('id', itemRequest.id)
        .single();

      if (!poItem) continue;

      const partTableName = (poItem as any).part_type;
      const partId = (poItem as any).part_id;
      const po_number = (poItem as any).po?.po_number;

      if (!partTableName || !partId) continue;

      // 1. Get current master stock
      const { data: part } = await (supabase as any)
        .from(partTableName)
        .select('stock_quantity, part_number')
        .eq('id', partId)
        .single();

      if (!part) continue;

      const stockBefore = part.stock_quantity || 0;
      const newStock = stockBefore + itemRequest.received_qty;

      // 2. Update master stock and log movement
      await Promise.all([
        (supabase as any).from(partTableName).update({ 
          stock_quantity: newStock,
          received_qty: ((part as any).received_qty || 0) + itemRequest.received_qty,
          updated_date: new Date().toISOString()
        }).eq('id', partId),
        
        (supabase as any).from('stock_movements').insert({
          movement_type: 'IN',
          part_table_name: partTableName,
          part_id: partId,
          part_number: part.part_number,
          quantity: itemRequest.received_qty,
          stock_before: stockBefore,
          stock_after: newStock,
          po_number: po_number,
          moved_by: userEmail
        })
      ]);

      // 3. Update received qty in PO item
      await (supabase as any)
        .from('purchase_order_items')
        .update({ 
          received_qty: ((poItem as any).received_qty || 0) + itemRequest.received_qty 
          // Note: we accumulate receipt qty
        })
        .eq('id', itemRequest.id);
    }

    return { success: true };
  },

  // Delete PO (only if Draft or Cancelled)
  deletePO: async (poId: number) => {
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('status')
      .eq('id', poId)
      .single();

    if (!['Draft', 'Cancelled'].includes((po as any)?.status)) {
      throw new Error('Only Draft or Cancelled POs can be deleted');
    }

    const { error } = await (supabase as any).from('purchase_orders').delete().eq('id', poId);
    if (error) throw error;
  },

  deletePurchaseOrder: async (id: number) => {
    return purchaseOrdersApi.deletePO(id);
  },

  getPendingParts: async () => {
    // 1. Fetch all project_parts joined with their hierarchy (subsection → section → project)
    const { data: projectParts, error } = await supabase
      .from('project_parts')
      .select(`
        *,
        subsection:project_subsections (
          id,
          project_id,
          section_name,
          section:project_sections (
            id,
            project_id,
            name,
            project:projects (id, project_name)
          )
        )
      `)

    if (error) {
      console.error('Error fetching project_parts for procurement:', error)
      throw error
    }

    // 2. Resolve part details per part_type just like projectsApi.getProject does
    const partsByType: Record<string, any[]> = {}
    for (const p of (projectParts as any[] || [])) {
      if (!p.part_type || !p.part_id) continue
      if (!partsByType[p.part_type]) partsByType[p.part_type] = []
      partsByType[p.part_type].push(p.part_id)
    }

    const partDetailsMap: Record<string, Record<number, any>> = {}
    for (const [partType, ids] of Object.entries(partsByType)) {
      const uniqueIds = Array.from(new Set(ids))
      const { data: details, error: detailsErr } = await (supabase as any)
        .from(partType)
        .select('*, suppliers:supplier_id(*)')
        .in('id', uniqueIds)

      if (detailsErr) {
        console.warn(`Error fetching details for type ${partType}:`, detailsErr)
        continue
      }

      partDetailsMap[partType] = {}
      for (const d of (details || [])) {
        partDetailsMap[partType][d.id] = d
      }
    }

    // 3. Map details back to the base parts
    const partsWithDetails = (projectParts || []).map((p: any) => ({
      ...p,
      part_ref: partDetailsMap[p.part_type]?.[p.part_id] || null,
    }))

    // 4. Filter out parts that already have a PO
    const { data: orderedItems } = await supabase
      .from('purchase_order_items')
      .select('project_part_id')
      .not('project_part_id', 'is', null)

    const orderedIds = new Set((orderedItems as any[])?.map(i => i.project_part_id))

    return partsWithDetails.filter((p: any) => !orderedIds.has(p.id))
  },

  // Delete single PO line item
  deletePOItem: async (itemId: number) => {
    const { error } = await supabase
      .from('purchase_order_items')
      .delete()
      .eq('id', itemId);
    if (error) throw error;
  },

  /**
   * Get all POs that are ready to receive (Confirmed or Partial status).
   * Returns PO header + supplier + all line items with outstanding balance.
   */
  getForReceiving: async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        id,
        po_number,
        status,
        payment_status,
        supplier_id,
        suppliers ( id, name ),
        project:projects ( id, project_name, project_number ),
        purchase_order_items (
          id,
          part_id,
          part_type,
          part_number,
          description,
          quantity,
          received_qty,
          unit_price,
          currency
        )
      `)
      .in('status', ['Confirmed', 'Partial'])
      .order('created_date', { ascending: false });

    if (error) throw error;

    // Filter to only POs that still have items outstanding
    return (data || []).filter((po: any) => {
      const items = po.purchase_order_items || [];
      return items.some(
        (item: any) => (item.quantity || 0) > (item.received_qty || 0)
      );
    });
  },

  /**
   * Receive items from a PO — called from the Part InOut / POReceiveModal.
   * For each item with qty > 0:
   *   1. Updates purchase_order_items.received_qty
   *   2. Updates the master part table stock_quantity
   *   3. Inserts a stock_movements row (type=IN, linked to PO)
   * Then updates PO status: Received if all done, Partial otherwise.
   */
  receiveFromPO: async (
    poId: number,
    items: Array<{
      itemId: number;
      partId: number;
      partType: string;
      partNumber: string;
      currentReceivedQty: number;
      receivingQty: number;
    }>
  ) => {
    const userEmail =
      (await supabase.auth.getUser()).data.user?.email || 'system';

    // Get PO number + supplier for movement log
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('po_number, suppliers(name)')
      .eq('id', poId)
      .single();

    const poNumber = (po as any)?.po_number ?? '';
    const supplierName = (po as any)?.suppliers?.name ?? '';

    const results = await Promise.allSettled(
      items
        .filter((item) => item.receivingQty > 0)
        .map(async (item) => {
          // 1. Get current master stock
          const { data: part } = await (supabase as any)
            .from(item.partType)
            .select('stock_quantity')
            .eq('id', item.partId)
            .single();

          const stockBefore = (part as any)?.stock_quantity ?? 0;
          const stockAfter = stockBefore + item.receivingQty;

          // 2. Update master part stock + PO item received_qty in parallel
          await Promise.all([
            (supabase as any)
              .from(item.partType)
              .update({
                stock_quantity: stockAfter,
                updated_date: new Date().toISOString(),
              })
              .eq('id', item.partId),

            (supabase as any)
              .from('purchase_order_items')
              .update({
                received_qty: item.currentReceivedQty + item.receivingQty,
              })
              .eq('id', item.itemId),

            (supabase as any).from('stock_movements').insert({
              movement_type: 'IN',
              part_table_name: item.partType,
              part_id: item.partId,
              part_number: item.partNumber,
              quantity: item.receivingQty,
              stock_before: stockBefore,
              stock_after: stockAfter,
              po_number: poNumber,
              supplier_name: supplierName,
              moved_by: userEmail,
              reference_notes: `Received against PO #${poNumber}`,
            }),
          ]);
        })
    );

    // Check for any failures
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.error('Some items failed to receive:', failed);
    }

    // Re-fetch all items for this PO to determine new overall status
    const { data: allItems } = await supabase
      .from('purchase_order_items')
      .select('quantity, received_qty')
      .eq('purchase_order_id', poId);

    const allReceived = (allItems || []).every(
      (i: any) => (i.received_qty || 0) >= (i.quantity || 0)
    );
    const anyReceived = (allItems || []).some(
      (i: any) => (i.received_qty || 0) > 0
    );

    const newStatus = allReceived
      ? 'Received'
      : anyReceived
      ? 'Partial'
      : 'Confirmed';

    await (supabase as any)
      .from('purchase_orders')
      .update({
        status: newStatus,
        actual_delivery_date: allReceived
          ? new Date().toISOString().split('T')[0]
          : null,
      })
      .eq('id', poId);

    return {
      newStatus,
      failed: failed.length,
      succeeded: results.length - failed.length,
    };
  },
};

export default purchaseOrdersApi;