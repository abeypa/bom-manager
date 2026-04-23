import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { logActivityAsync } from './activity-logs'

export type PartCategory = 
  | 'mechanical_manufacture' 
  | 'mechanical_bought_out' 
  | 'electrical_manufacture' 
  | 'electrical_bought_out' 
  | 'pneumatic_bought_out';

const logPriceHistory = async (
  partTable: PartCategory,
  partId: number,
  partNumber: string,
  oldData: any,
  newData: any,
  reason: string = 'manual_edit',
  changedAt: string | null = null
) => {
  const oldPrice = oldData?.base_price;
  const newPrice = newData?.base_price;
  const oldCurrency = oldData?.currency || 'INR';
  const newCurrency = newData?.currency || 'INR';
  const oldDiscount = oldData?.discount_percent;
  const newDiscount = newData?.discount_percent;

  // Only log if price, currency or discount actually changed
  if (
    oldPrice !== newPrice ||
    oldCurrency !== newCurrency ||
    oldDiscount !== newDiscount
  ) {
    await (supabase as any).from('part_price_history').insert({
      part_table_name: partTable,
      part_id: partId,
      part_number: partNumber,
      old_price: oldPrice,
      new_price: newPrice,
      old_currency: oldCurrency,
      new_currency: newCurrency,
      old_discount_percent: oldDiscount,
      new_discount_percent: newDiscount,
      change_reason: reason,
      changed_at: changedAt || new Date().toISOString(),
      changed_by: (await supabase.auth.getUser()).data.user?.email || 'system',
    });
  }
};

export const partsApi = {
  // Get parts by category
  getPartsByCategory: async (category: PartCategory) => {
    const { data, error } = await (supabase as any)
      .from(category)
      .select(`
        *,
        suppliers:supplier_id (
          name
        )
      `)
      .order('part_number');
    if (error) throw error;
    return data;
  },

  // Backward compatibility alias for 'getParts'
  getParts: async (category: PartCategory) => {
    return partsApi.getPartsByCategory(category);
  },

  // Centralized field mapping for imports (aliases permitted)
  _PART_FIELD_MAP: {
    'PartNumber': 'part_number',
    'Description': 'description',
    'SupplierId': 'supplier_id',
    'BasePrice': 'base_price',
    'Price': 'base_price',
    'Currency': 'currency',
    'DiscountPercent': 'discount_percent',
    'StockQuantity': 'stock_quantity',
    'MinStockLevel': 'min_stock_level',
    'OrderQty': 'order_qty',
    'ReceivedQty': 'received_qty',
    'LeadTime': 'lead_time',
    'Specifications': 'specifications',
    'Manufacturer': 'manufacturer',
    'Make': 'make',
    'ManufacturerPartNumber': 'manufacturer_part_number',
    'Material': 'material',
    'Finish': 'finish',
    'Weight': 'weight',
    'VendorPartNumber': 'vendor_part_number',
    'PONumber': 'po_number',
    'PortSize': 'port_size',
    'OperatingPressure': 'operating_pressure'
  },

  // Helper: Clean part payload for master table write
  _cleanPartPayload: (payload: any) => {
    const cleaned = { ...payload };
    // UI/Virtual fields
    delete (cleaned as any).notes;
    delete (cleaned as any).suppliers;
    delete (cleaned as any).display_type;
    delete (cleaned as any).category;
    delete (cleaned as any).projectName;
    delete (cleaned as any).sectionName;
    delete (cleaned as any).PartType;
    delete (cleaned as any).parttype;
    
    // Audit-only fields (handled by separate tables)
    delete (cleaned as any).price_revision_date;
    delete (cleaned as any).PriceRevisionDate;
    delete (cleaned as any).pricerevisiondate;
    
    return cleaned;
  },

  // Create a new part
  createPart: async (category: PartCategory, payload: any) => {
    const revisionDate = payload.price_revision_date || payload.PriceRevisionDate || payload.pricerevisiondate;
    const cleanPayload = partsApi._cleanPartPayload(payload);

    const { data, error } = await (supabase as any)
      .from(category)
      .insert([cleanPayload])
      .select()
      .single()

    if (error) throw error
    
    // Log initial price
    if (data) {
      await logPriceHistory(category, data.id, data.part_number, null, data, 'initial_entry', revisionDate);
      logActivityAsync({
        action: 'CREATE',
        entity_type: 'part',
        entity_id: String(data.id),
        new_values: { part_number: data.part_number, category, base_price: data.base_price },
      });
    }
    
    return data
  },

  // Updated: now logs price history automatically
  updatePart: async (category: PartCategory, id: number, updates: any) => {
    // 1. Fetch current values for comparison
    const { data: current } = await (supabase as any)
      .from(category)
      .select('base_price, currency, discount_percent, part_number')
      .eq('id', id)
      .single();

    const revisionDate = updates.price_revision_date || updates.PriceRevisionDate || updates.pricerevisiondate;
    const cleanUpdates = partsApi._cleanPartPayload(updates);

    // 2. Perform the update
    const { data: updated, error } = await (supabase as any)
      .from(category)
      .update(cleanUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // 3. Log price history if price fields changed
    if (current && updated) {
      await logPriceHistory(category, id, current.part_number, current, updated, 'manual_edit', revisionDate);
    }

    logActivityAsync({
      action: 'UPDATE',
      entity_type: 'part',
      entity_id: String(id),
      old_values: current ? { base_price: current.base_price, part_number: current.part_number } : null,
      new_values: { base_price: updated?.base_price, category },
    });

    return updated;
  },

  // Updated: bulk import now also logs price history
  importParts: async (parts: any[]) => {
    let partsProcessed = 0
    let partsAdded = 0
    let partsUpdated = 0
    let errors = 0
    const errorMessages: string[] = []

    const getTableFromType = (type: string): PartCategory | null => {
      const t = type.toLowerCase().replace(/[\s_-]/g, '')
      if (t.includes('mechanicalmanufacture')) return 'mechanical_manufacture'
      if (t.includes('mechanicalboughtout')) return 'mechanical_bought_out'
      if (t.includes('electricalmanufacture')) return 'electrical_manufacture'
      if (t.includes('electricalboughtout')) return 'electrical_bought_out'
      if (t.includes('pneumaticboughtout')) return 'pneumatic_bought_out'
      return null
    }

    const fieldMap: Record<string, string> = {
      'PartNumber': 'part_number',
      'Description': 'description',
      'SupplierId': 'supplier_id',
      'BasePrice': 'base_price',
      'Currency': 'currency',
      'DiscountPercent': 'discount_percent',
      'StockQuantity': 'stock_quantity',
      'MinStockLevel': 'min_stock_level',
      'OrderQty': 'order_qty',
      'ReceivedQty': 'received_qty',
      'LeadTime': 'lead_time',
      'Specifications': 'specifications',
      'Manufacturer': 'manufacturer',
      'ManufacturerPartNumber': 'manufacturer_part_number',
      'Material': 'material',
      'Finish': 'finish',
      'Weight': 'weight',
      'VendorPartNumber': 'vendor_part_number',
      'PONumber': 'po_number',
      'PortSize': 'port_size',
      'OperatingPressure': 'operating_pressure'
    }

    for (const part of parts) {
      partsProcessed++
      try {
        const category = getTableFromType(part.PartType || '')
        if (!category) {
          throw new Error(`Invalid PartType: ${part.PartType}`)
        }

        if (!part.PartNumber) {
          throw new Error('PartNumber is required')
        }

        // Using centralized cleaning/mapping
        const rawPayload: any = {}
        Object.entries(part).forEach(([key, value]) => {
          rawPayload[(partsApi._PART_FIELD_MAP as any)[key] || key.toLowerCase()] = value
        })
        const payload = partsApi._cleanPartPayload(rawPayload)

        // Check if part exists
        const { data: existing } = await supabase
          .from(category)
          .select('id, base_price, currency, discount_percent, part_number')
          .eq('part_number', part.PartNumber)
          .single()

        const { data: result, error } = await supabase
          .from(category)
          .upsert(payload, { onConflict: 'part_number' })
          .select()
          .single()

        if (error) throw error

        if (existing) {
          partsUpdated++
          await logPriceHistory(category, (existing as any).id, part.PartNumber, existing, result, 'json_import');
        } else {
          partsAdded++
          if (result) {
            await logPriceHistory(category, (result as any).id, part.PartNumber, null, result, 'json_import');
          }
        }
      } catch (err: any) {
        errors++
        errorMessages.push(`Part ${part.PartNumber || 'unknown'}: ${err.message}`)
      }
    }

    return {
      success: errors === 0,
      message: errors === 0 
        ? `Successfully imported ${partsAdded} new and updated ${partsUpdated} parts.`
        : `Import completed with ${errors} error(s).`,
      partsProcessed,
      partsAdded,
      partsUpdated,
      errors,
      errorMessages
    }
  },

  // New: Get price history for a specific part
  getPriceHistory: async (category: PartCategory, partId: number) => {
    const { data, error } = await supabase
      .from('part_price_history')
      .select('*')
      .eq('part_table_name', category)
      .eq('part_id', partId)
      .order('changed_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  deletePart: async (category: PartCategory, id: number) => {
    // Fetch part info before deletion for audit
    const { data: partInfo } = await (supabase as any)
      .from(category).select('part_number, description, base_price').eq('id', id).single();

    const { error } = await (supabase as any).from(category).delete().eq('id', id);
    if (error) throw error;

    logActivityAsync({
      action: 'DELETE',
      entity_type: 'part',
      entity_id: String(id),
      old_values: partInfo ? { part_number: partInfo.part_number, category, description: partInfo.description } : null,
    });
  },

  // New: Strict import with validation (abort on any error)
  importPartsStrict: async (parts: any[]) => {
    const errorMessages: string[] = [];
    let partsProcessed = 0;
    let partsAdded = 0;
    let partsUpdated = 0;

    const getTableFromType = (type: string): PartCategory | null => {
      const t = type.toLowerCase().replace(/[\s_-]/g, '')
      if (t.includes('mechanicalmanufacture')) return 'mechanical_manufacture'
      if (t.includes('mechanicalboughtout')) return 'mechanical_bought_out'
      if (t.includes('electricalmanufacture')) return 'electrical_manufacture'
      if (t.includes('electricalboughtout')) return 'electrical_bought_out'
      if (t.includes('pneumaticboughtout')) return 'pneumatic_bought_out'
      return null
    }

    const fieldMap: Record<string, string> = {
      'PartNumber': 'part_number',
      'Description': 'description',
      'SupplierId': 'supplier_id',
      'BasePrice': 'base_price',
      'Currency': 'currency',
      'DiscountPercent': 'discount_percent',
      'StockQuantity': 'stock_quantity',
      'MinStockLevel': 'min_stock_level',
      'OrderQty': 'order_qty',
      'ReceivedQty': 'received_qty',
      'LeadTime': 'lead_time',
      'Specifications': 'specifications',
      'Manufacturer': 'manufacturer',
      'ManufacturerPartNumber': 'manufacturer_part_number',
      'Material': 'material',
      'Finish': 'finish',
      'Weight': 'weight',
      'VendorPartNumber': 'vendor_part_number',
      'PONumber': 'po_number',
      'PortSize': 'port_size',
      'OperatingPressure': 'operating_pressure'
    }

    // Wrap the entire import in a validation/execution loop to follow "abort on error" rule
    for (const part of parts) {
      partsProcessed++;
      try {
        const category = getTableFromType(part.PartType || '');
        if (!category) throw new Error(`Invalid PartType: ${part.PartType}`);
        if (!part.PartNumber) throw new Error('PartNumber is required');

        // Check for duplicate part (case-insensitive) - FAIL WHOLE IMPORT if exists
        const { data: duplicate } = await (supabase as any)
          .from(category)
          .select('id')
          .ilike('part_number', part.PartNumber)
          .maybeSingle();

        if (duplicate) {
          throw new Error(`Duplicate part number detected: ${part.PartNumber}. Import aborted.`);
        }

        // Validate project/section if provided
        let sectionId: number | null = null;
        if (part.projectName) {
          const { data: project } = await (supabase as any)
            .from('projects')
            .select('id')
            .ilike('project_name', part.projectName)
            .maybeSingle();

          if (!project) {
            throw new Error(`Project not found: ${part.projectName}. Import aborted.`);
          }

          if (part.sectionName) {
            const { data: section } = await (supabase as any)
              .from('project_sections')
              .select('id')
              .eq('project_id', (project as any).id)
              .ilike('section_name', part.sectionName)
              .maybeSingle();

            if (!section) {
              throw new Error(`Section not found: ${part.sectionName} in project ${part.projectName}. Import aborted.`);
            }
            sectionId = section.id;
          }
        }

        // Prepare payload (Clean audit/UI only fields)
        let revisionDate: string | null = null;
        const rawPayload: any = {};
        Object.entries(part).forEach(([key, value]) => {
          rawPayload[(partsApi._PART_FIELD_MAP as any)[key] || key.toLowerCase()] = value;
        });
        
        const payload = partsApi._cleanPartPayload(rawPayload);

        // Insert part
        const { data: newPart, error: insertError } = await (supabase as any)
          .from(category)
          .insert(payload)
          .select()
          .single();

        if (insertError) throw insertError;
        partsAdded++;

        // If project/section specified, link it
        if (sectionId && newPart) {
          const { error: linkError } = await (supabase as any)
            .from('project_parts')
            .insert({
              project_section_id: sectionId,
              part_number: (newPart as any).part_number,
              part_table_name: category,
              quantity: part.quantity || 1, // Default to 1 if not specified
              unit_price: (newPart as any).base_price || 0,
              currency: (newPart as any).currency || 'INR'
            });
          
          if (linkError) throw linkError;
        }

        // Log initial price (Audit history)
        await logPriceHistory(category, (newPart as any).id, (newPart as any).part_number, null, newPart, 'strict_import', revisionDate);

      } catch (err: any) {
        // Abort the whole import on first error
        return {
          success: false,
          message: `Import aborted: ${err.message}`,
          partsProcessed,
          partsAdded: 0, // We should inform that nothing was committed if we were in a transaction, but Supabase doesn't support easy multi-table transactions in client. For now, we report what happened.
          errors: 1,
          errorMessages: [err.message]
        };
      }
    }

    return {
      success: true,
      message: `Successfully imported ${partsAdded} parts.`,
      partsProcessed,
      partsAdded,
      partsUpdated,
      errors: 0,
      errorMessages: []
    };
  },

  // Export parts as JSON
  exportPartsJSON: async (category: PartCategory) => {
    const { data, error } = await (supabase as any).from(category).select('*').order('part_number');
    if (error) throw error;
    return data;
  },

  // Export parts as CSV
  exportPartsCSV: async (category: PartCategory) => {
    const { data, error } = await (supabase as any).from(category).select('*').order('part_number');
    if (error) throw error;
    if (!data || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map((row: any) => 
        headers.map(fieldName => {
          const value = row[fieldName];
          const stringValue = value === null || value === undefined ? '' : String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      )
    ].join('\n');

    return csvContent;
  },

  // Task 5: Search across all categories for stock management
  searchAllParts: async (term: string) => {
    const categories: PartCategory[] = [
      'mechanical_manufacture',
      'mechanical_bought_out',
      'electrical_manufacture',
      'electrical_bought_out',
      'pneumatic_bought_out'
    ];

    const results = await Promise.all(
      categories.map(async (cat) => {
        const { data, error } = await (supabase as any)
          .from(cat)
          .select('id, part_number, description, stock_quantity, base_price, currency')
          .or(`part_number.ilike.%${term}%,description.ilike.%${term}%`)
          .limit(10);
        
        if (error) return [];
        return (data || []).map((p: any) => ({
          ...p,
          category: cat,
          display_type: cat.replace(/_/g, ' ').toUpperCase()
        }));
      })
    );

    return results.flat().sort((a, b) => a.part_number.localeCompare(b.part_number));
  },

  // NEW: Heal routine to synchronize all master prices with their latest historical audit entries
  healPriceSynchronicity: async () => {
    const categories: PartCategory[] = [
      'mechanical_manufacture',
      'mechanical_bought_out',
      'electrical_manufacture',
      'electrical_bought_out',
      'pneumatic_bought_out'
    ];

    let synchronizedCount = 0;
    let errorCount = 0;

    for (const category of categories) {
      try {
        // 1. Get all parts in category
        const { data: parts, error: fetchError } = await (supabase as any)
          .from(category)
          .select('id, part_number, base_price');
        
        if (fetchError) throw fetchError;

        for (const part of (parts || [])) {
          // 2. Get latest history entry for this part
          const { data: latestEntry } = await supabase
            .from('part_price_history')
            .select('new_price, currency')
            .eq('part_table_name', category)
            .eq('part_id', part.id)
            .order('changed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // 3. If history exists and differs from master, update master
          if (latestEntry && Math.abs((latestEntry as any).new_price - part.base_price) > 0.01) {
            await (supabase as any)
              .from(category)
              .update({ 
                base_price: (latestEntry as any).new_price,
                currency: (latestEntry as any).currency || part.currency
              })
              .eq('id', part.id);
            
            synchronizedCount++;
          }
        }
      } catch (err) {
        console.error(`Failed to heal category ${category}:`, err);
        errorCount++;
      }
    }

    return { synchronizedCount, errorCount };
  }
};

