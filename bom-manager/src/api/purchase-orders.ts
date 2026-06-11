import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { extractPurchaseOrderPdfTaxAmount } from '@/lib/po-pdf-tax'
import { logActivityAsync } from './activity-logs'

export type PurchaseOrder = Database['public']['Tables']['purchase_orders']['Row']
export type PurchaseOrderInsert = Database['public']['Tables']['purchase_orders']['Insert']
export type PurchaseOrderUpdate = Database['public']['Tables']['purchase_orders']['Update']
export type PurchaseOrderItem = Database['public']['Tables']['purchase_order_items']['Row']

// Updated status with Draft as initial state
export type POStatus = 'Draft' | 'Released' | 'Pending' | 'Sent' | 'Confirmed' | 'Partial' | 'Received' | 'Cancelled';

const roundMoney = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
const normalizePaymentAmount = (payment: any) => {
  const amount = Number(payment?.amount || 0)
  return payment?.payment_type === 'Refund' ? -amount : amount
}

export const purchaseOrdersApi = {
  // Get all POs
  getAll: async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers (name),
        project:projects (project_name, project_number)
      `)
      .order('created_date', { ascending: false });
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) return rows;

    const poIds = rows.map((po: any) => po.id).filter(Boolean);
    const { data: poItems, error: poItemsError } = await supabase
      .from('purchase_order_items')
      .select('purchase_order_id, project_part_id')
      .in('purchase_order_id', poIds);
    if (poItemsError) throw poItemsError;

    const { data: paymentRows, error: paymentsError } = await supabase
      .from('po_payments')
      .select('purchase_order_id, amount, payment_type')
      .in('purchase_order_id', poIds)
    if (paymentsError) throw paymentsError;

    const projectPartIds = Array.from(
      new Set((poItems || []).map((item: any) => item.project_part_id).filter(Boolean))
    );

    let projectPartRows: any[] = [];
    if (projectPartIds.length) {
      const { data: partsData, error: partsError } = await supabase
        .from('project_parts')
        .select('id, project_section_id')
        .in('id', projectPartIds);
      if (partsError) throw partsError;
      projectPartRows = partsData || [];
    }

    const subsectionIds = Array.from(
      new Set(projectPartRows.map((part: any) => part.project_section_id).filter(Boolean))
    );

    let subsectionRows: any[] = [];
    if (subsectionIds.length) {
      const { data: subsectionsData, error: subsectionsError } = await supabase
        .from('project_subsections')
        .select('id, project_id')
        .in('id', subsectionIds);
      if (subsectionsError) throw subsectionsError;
      subsectionRows = subsectionsData || [];
    }

    const projectIds = Array.from(
      new Set(subsectionRows.map((subsection: any) => subsection.project_id).filter(Boolean))
    );

    let projectRows: any[] = [];
    if (projectIds.length) {
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('id, project_number')
        .in('id', projectIds);
      if (projectsError) throw projectsError;
      projectRows = projectsData || [];
    }

    const projectPartToSubsection = new Map(
      projectPartRows.map((part: any) => [part.id, part.project_section_id])
    );
    const subsectionToProject = new Map(
      subsectionRows.map((subsection: any) => [subsection.id, subsection.project_id])
    );
    const projectIdToNumber = new Map(
      projectRows.map((project: any) => [project.id, project.project_number])
    );
    const paymentTotalsByPo = new Map<number, number>();

    for (const payment of paymentRows || []) {
      const poId = (payment as any).purchase_order_id
      if (!poId) continue
      paymentTotalsByPo.set(poId, roundMoney((paymentTotalsByPo.get(poId) || 0) + normalizePaymentAmount(payment)))
    }

    const projectNumbersByPo = new Map<number, string[]>();
    for (const row of poItems || []) {
      const poId = (row as any).purchase_order_id;
      const subsectionId = projectPartToSubsection.get((row as any).project_part_id);
      const projectId = subsectionToProject.get(subsectionId);
      const projectNumber = projectIdToNumber.get(projectId);
      if (!poId || !projectNumber) continue;
      const current = projectNumbersByPo.get(poId) || [];
      if (!current.includes(projectNumber)) current.push(projectNumber);
      projectNumbersByPo.set(poId, current);
    }

    return rows.map((po: any) => {
      const mappedProjectNumbers = projectNumbersByPo.get(po.id) || [];
      const fallbackProjectNumber = po.project?.project_number ? [po.project.project_number] : [];
      const associatedProjectNumbers = mappedProjectNumbers.length ? mappedProjectNumbers : fallbackProjectNumber;
      const totalValue = Number(po.grand_total || po.total_amount || 0) + Number(po.tax_amount || 0)
      const paidAmount = roundMoney(paymentTotalsByPo.get(po.id) || 0)
      const paymentPercent = totalValue > 0 ? Math.min(100, Math.max(0, roundMoney((paidAmount / totalValue) * 100))) : 0

      return {
        ...po,
        associated_project_numbers: associatedProjectNumbers,
        associated_project_label: associatedProjectNumbers.join(', '),
        paid_amount: paidAmount,
        payment_percent: paymentPercent,
      };
    });
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
            project_subsection:project_subsections!project_parts_project_section_id_fkey (
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
    logActivityAsync({
      action: 'CREATE',
      entity_type: 'purchase_orders',
      entity_id: String(data.id),
      new_values: data,
    })
    return data;
  },

  updatePurchaseOrder: async (poId: number, updateData: any) => {
    const { data: current } = await (supabase as any)
      .from('purchase_orders')
      .select('*')
      .eq('id', poId)
      .maybeSingle()

    const payload = { ...updateData }

    if (Object.prototype.hasOwnProperty.call(payload, 'bep_po_pdf_url')) {
      const pdfRef = String(payload.bep_po_pdf_url || '').trim()
      if (!pdfRef) {
        payload.bep_po_pdf_url = null
        payload.tax_amount = null
      } else {
        payload.bep_po_pdf_url = pdfRef
        try {
          payload.tax_amount = await extractPurchaseOrderPdfTaxAmount(pdfRef, `PO-${poId}`)
        } catch (error) {
          console.warn(`Failed to extract PDF tax amount for PO ${poId}:`, error)
          payload.tax_amount = null
        }
      }
    }

    const { data, error } = await (supabase as any)
      .from('purchase_orders')
      .update({ ...payload, updated_date: new Date().toISOString() })
      .eq('id', poId)
      .select()
      .single();
    if (error) throw error;
    logActivityAsync({
      action: 'UPDATE',
      entity_type: 'purchase_orders',
      entity_id: String(poId),
      old_values: current || null,
      new_values: data,
    })
    return data;
  },

  createPurchaseOrderWithItems: async (po: PurchaseOrderInsert, items: any[]) => {
    const poPayload: any = { ...po }
    if (poPayload.bep_po_pdf_url && poPayload.tax_amount == null) {
      try {
        poPayload.tax_amount = await extractPurchaseOrderPdfTaxAmount(poPayload.bep_po_pdf_url, poPayload.po_number)
      } catch (error) {
        console.warn(`Failed to extract PDF tax amount while creating PO ${poPayload.po_number}:`, error)
        poPayload.tax_amount = null
      }
    }

    const { data: newPO, error: poError } = await (supabase as any).from('purchase_orders')
      .insert([poPayload])
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

    logActivityAsync({
      action: 'CREATE',
      entity_type: 'purchase_orders',
      entity_id: String(newPO.id),
      new_values: {
        ...newPO,
        purchase_order_items: itemsWithPOId,
      },
    })

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
    logActivityAsync({
      action: 'UPDATE',
      entity_type: 'purchase_orders',
      entity_id: String(poId),
      old_values: po,
      new_values: data,
    })
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
    logActivityAsync({
      action: 'UPDATE',
      entity_type: 'purchase_orders',
      entity_id: String(poId),
      old_values: current,
      new_values: data,
    })
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
    logActivityAsync({
      action: 'DELETE',
      entity_type: 'purchase_orders',
      entity_id: String(poId),
      old_values: po || null,
    })
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
        subsection:project_subsections!project_parts_project_section_id_fkey (
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

    // 4. Compute outstanding procurement quantity per project BOM line.
    const { data: orderedItems, error: orderedItemsError } = await supabase
      .from('purchase_order_items')
      .select('project_part_id, quantity, purchase_orders(status)')
      .not('project_part_id', 'is', null)

    if (orderedItemsError) throw orderedItemsError

    const orderedQtyMap = new Map<number, number>()
    for (const item of (orderedItems as any[]) || []) {
      const projectPartId = item.project_part_id
      const poStatus = item.purchase_orders?.status
      if (!projectPartId || poStatus === 'Cancelled') continue
      orderedQtyMap.set(projectPartId, (orderedQtyMap.get(projectPartId) || 0) + Number(item.quantity || 0))
    }

    return partsWithDetails
      .map((part: any) => {
        const requiredQty = Number(part.quantity || 0)
        const orderedQty = Number(orderedQtyMap.get(part.id) || 0)
        const remainingQty = Math.max(0, requiredQty - orderedQty)

        return {
          ...part,
          original_quantity: requiredQty,
          ordered_quantity: orderedQty,
          quantity: remainingQty,
          pending_procurement_qty: remainingQty,
        }
      })
      .filter((part: any) => part.pending_procurement_qty > 0)
  },

  // Delete single PO line item, then recalc parent PO totals
  deletePOItem: async (itemId: number) => {
    const { data: item } = await supabase
      .from('purchase_order_items')
      .select('purchase_order_id')
      .eq('id', itemId)
      .single();

    const { error } = await supabase
      .from('purchase_order_items')
      .delete()
      .eq('id', itemId);
    if (error) throw error;

    const poId = (item as any)?.purchase_order_id;
    if (poId) await purchaseOrdersApi.recalcPOTotals(poId);
  },

  /**
   * Recompute purchase_orders.grand_total / total_items / total_quantity
   * from the live purchase_order_items rows. Call after any item insert,
   * update, or delete so downstream reports stay accurate.
   */
  recalcPOTotals: async (poId: number) => {
    const { data: poHeader } = await supabase
      .from('purchase_orders')
      .select('currency, original_currency, commercial_adjustment_amount, original_commercial_adjustment_amount')
      .eq('id', poId)
      .single();

    const { data: items } = await supabase
      .from('purchase_order_items')
      .select('quantity, unit_price, discount_percent, total_amount, original_total_amount')
      .eq('purchase_order_id', poId);

    const rows = (items as any[]) || [];
    const lines_total = rows.reduce((s, r) => {
      const stored = Number(r.total_amount)
      if (Number.isFinite(stored)) return s + stored
      const qty = Number(r.quantity || 0)
      const price = Number(r.unit_price || 0)
      const disc = Number(r.discount_percent || 0)
      return s + qty * price * (1 - disc / 100)
    }, 0);
    const commercialAdjustment = Number((poHeader as any)?.commercial_adjustment_amount || 0);
    const grand_total = roundMoney(lines_total + commercialAdjustment);

    const originalLinesTotal = rows.reduce((s, r) => {
      const stored = Number(r.original_total_amount)
      if (Number.isFinite(stored)) return s + stored
      return s + Number(r.total_amount || 0)
    }, 0)
    const originalCommercialAdjustment = Number(
      (poHeader as any)?.original_commercial_adjustment_amount ??
      (poHeader as any)?.commercial_adjustment_amount ??
      0,
    )
    const original_grand_total = roundMoney(originalLinesTotal + originalCommercialAdjustment)
    const total_items = rows.length;
    const total_quantity = rows.reduce((s, r) => s + (r.quantity || 0), 0);

    const { error } = await (supabase as any)
      .from('purchase_orders')
      .update({
        grand_total,
        original_grand_total,
        total_items,
        total_quantity,
        updated_date: new Date().toISOString(),
      })
      .eq('id', poId);
    if (error) throw error;
    return { grand_total, original_grand_total, total_items, total_quantity };
  },

  convertDraftPOCurrency: async (
    poId: number,
    {
      targetCurrency,
      exchangeRate,
      exchangeRateDate,
      exchangeRateSource,
      allowPreviousBusinessDay = false,
    }: {
      targetCurrency: string
      exchangeRate: number
      exchangeRateDate: string
      exchangeRateSource?: string | null
      allowPreviousBusinessDay?: boolean
    },
  ) => {
    const normalizedTarget = String(targetCurrency || '').trim().toUpperCase()
    if (!normalizedTarget) throw new Error('Target currency is required.')
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw new Error('Exchange rate must be a positive number.')
    if (!exchangeRateDate) throw new Error('Exchange rate date is required.')

    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .select('id, po_number, po_date, status, currency, original_currency, grand_total, original_grand_total, commercial_adjustment_amount, original_commercial_adjustment_amount')
      .eq('id', poId)
      .single()
    if (poError) throw poError
    if (!po) throw new Error('PO not found.')
    if ((po as any).status !== 'Draft') {
      throw new Error(`Only Draft POs can be currency-converted. Current status is ${(po as any).status}.`)
    }

    const currentCurrency = String((po as any).currency || 'INR').trim().toUpperCase()
    const sourceCurrency = String((po as any).original_currency || currentCurrency).trim().toUpperCase()
    if (currentCurrency === normalizedTarget) {
      throw new Error(`PO is already in ${normalizedTarget}. No conversion needed.`)
    }
    if (sourceCurrency !== currentCurrency) {
      throw new Error(
        `PO ${(po as any).po_number} has already been converted from ${sourceCurrency} to ${currentCurrency}. ` +
        'Do not convert the same PO twice.',
      )
    }

    const poDate = String((po as any).po_date || '').slice(0, 10)
    const rateDate = String(exchangeRateDate).slice(0, 10)
    if (poDate && rateDate !== poDate) {
      if (!allowPreviousBusinessDay) {
        throw new Error(
          `Exchange rate date ${rateDate} does not match PO date ${poDate}. ` +
          'Re-run with allow_previous_business_day=true only if you intentionally used the nearest previous business-day rate.',
        )
      }
      if (rateDate > poDate) {
        throw new Error(`Exchange rate date ${rateDate} cannot be after PO date ${poDate}.`)
      }
      const diffDays = Math.floor((Date.parse(poDate) - Date.parse(rateDate)) / (24 * 60 * 60 * 1000))
      if (diffDays > 7) {
        throw new Error(`Exchange rate date ${rateDate} is too far from PO date ${poDate} (${diffDays} days).`)
      }
    }

    const { data: items, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select('id, quantity, unit_price, discount_percent, total_amount, original_currency, original_unit_price, original_total_amount')
      .eq('purchase_order_id', poId)
    if (itemsError) throw itemsError

    const sourceCommercialAdjustment = Number(
      (po as any).original_commercial_adjustment_amount ??
      (po as any).commercial_adjustment_amount ??
      0,
    )
    const convertedCommercialAdjustment = roundMoney(sourceCommercialAdjustment * exchangeRate)

    for (const item of items || []) {
      const sourceUnitPrice = Number((item as any).original_unit_price ?? (item as any).unit_price ?? 0)
      const sourceLineTotal = Number((item as any).original_total_amount ?? (item as any).total_amount ?? 0)
      const convertedUnitPrice = roundMoney(sourceUnitPrice * exchangeRate)
      const convertedLineTotal = roundMoney(sourceLineTotal * exchangeRate)

      const { error } = await (supabase as any)
        .from('purchase_order_items')
        .update({
          original_currency: (item as any).original_currency || currentCurrency,
          original_unit_price: (item as any).original_unit_price ?? (item as any).unit_price,
          original_total_amount: (item as any).original_total_amount ?? (item as any).total_amount,
          unit_price: convertedUnitPrice,
          total_amount: convertedLineTotal,
        })
        .eq('id', (item as any).id)
      if (error) throw error
    }

    const note = `Converted from ${currentCurrency} to ${normalizedTarget} using exchange rate ${exchangeRate} on ${rateDate}${exchangeRateSource ? ` (${exchangeRateSource})` : ''}.`
    const { error: headerError } = await (supabase as any)
      .from('purchase_orders')
      .update({
        original_currency: (po as any).original_currency || currentCurrency,
        original_grand_total: (po as any).original_grand_total ?? (po as any).grand_total,
        original_commercial_adjustment_amount:
          (po as any).original_commercial_adjustment_amount ?? (po as any).commercial_adjustment_amount ?? 0,
        currency: normalizedTarget,
        exchange_rate: exchangeRate,
        exchange_rate_date: rateDate,
        exchange_rate_source: exchangeRateSource || null,
        commercial_adjustment_amount: convertedCommercialAdjustment,
        notes: (po as any).notes
          ? `${(po as any).notes} | ${note}`
          : note,
        updated_date: new Date().toISOString(),
      })
      .eq('id', poId)
    if (headerError) throw headerError

    const totals = await purchaseOrdersApi.recalcPOTotals(poId)
    return {
      po_id: poId,
      po_number: (po as any).po_number,
      source_currency: currentCurrency,
      target_currency: normalizedTarget,
      exchange_rate: exchangeRate,
      exchange_rate_date: rateDate,
      exchange_rate_source: exchangeRateSource || null,
      totals,
    }
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
          const { data: poItem, error: poItemError } = await (supabase as any)
            .from('purchase_order_items')
            .select('id, quantity, received_qty, part_id, part_type, part_number')
            .eq('id', item.itemId)
            .eq('purchase_order_id', poId)
            .single()

          if (poItemError) throw poItemError
          if (!poItem) throw new Error(`PO line ${item.itemId} was not found.`)

          const orderedQty = Number((poItem as any).quantity || 0)
          const currentReceivedQty = Number((poItem as any).received_qty || 0)
          const nextReceivedQty = currentReceivedQty + item.receivingQty

          if (nextReceivedQty > orderedQty) {
            const remainingQty = Math.max(0, orderedQty - currentReceivedQty)
            throw new Error(
              `Cannot receive ${item.receivingQty} for "${(poItem as any).part_number || item.partNumber}": only ${remainingQty} remaining on PO ${poNumber}.`,
            )
          }

          // 1. Get current master stock
          const { data: part, error: partError } = await (supabase as any)
            .from(item.partType)
            .select('stock_quantity')
            .eq('id', item.partId)
            .single();

          if (partError) throw partError
          if (!part) throw new Error(`Part ${item.partNumber} was not found in ${item.partType}.`)

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
              .eq('id', item.partId)
              .throwOnError(),

            (supabase as any)
              .from('purchase_order_items')
              .update({
                received_qty: nextReceivedQty,
              })
              .eq('id', item.itemId)
              .eq('received_qty', currentReceivedQty)
              .select('id')
              .single()
              .throwOnError(),

            (supabase as any)
              .from('stock_movements')
              .insert({
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
              })
              .throwOnError(),
          ]);
        })
    );

    // Check for any failures
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.error('Some items failed to receive:', failed);
      const firstFailure = failed[0] as PromiseRejectedResult;
      throw firstFailure.reason instanceof Error
        ? firstFailure.reason
        : new Error('One or more PO receipt updates failed.');
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
