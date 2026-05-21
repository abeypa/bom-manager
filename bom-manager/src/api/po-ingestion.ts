import { supabase } from '@/lib/supabase'
import type { ParsedPODocument } from '@/lib/po-ingestion-parser'
import {
  findExistingProjectPartInProject,
  isProjectPartDuplicateExemptMaster,
  MASTER_PART_INTERLOCK_FIELDS,
} from '@/utils/projectPartInterlock'

const PREFIX_BY_PART_TYPE: Record<string, string> = {
  electrical_bought_out: 'EBO',
  electrical_manufacture: 'EMF',
  mechanical_bought_out: 'MBO',
  mechanical_manufacture: 'MMF',
  pneumatic_bought_out: 'PBO',
}

export interface CreatePOIngestionBatchInput {
  projectId: number
  notes?: string
  documents: ParsedPODocument[]
}

const valuesDiffer = (a: any, b: any, epsilon = 0.0001) => {
  const aNum = Number(a)
  const bNum = Number(b)
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return Math.abs(aNum - bNum) > epsilon
  return String(a ?? '') !== String(b ?? '')
}

async function logPartPriceHistoryFromPO(partTable: string, partId: number, partNumber: string, oldRow: any, newValues: any, doc: any) {
  const oldPrice = oldRow?.base_price ?? null
  const newPrice = newValues?.base_price ?? null
  const oldCurrency = oldRow?.currency || 'INR'
  const newCurrency = newValues?.currency || 'INR'
  const oldDiscount = oldRow?.discount_percent ?? null
  const newDiscount = newValues?.discount_percent ?? null

  if (
    !valuesDiffer(oldPrice, newPrice) &&
    !valuesDiffer(oldCurrency, newCurrency) &&
    !valuesDiffer(oldDiscount, newDiscount)
  ) return

  const { data: userData } = await supabase.auth.getUser()
  await (supabase as any).from('part_price_history').insert({
    part_table_name: partTable,
    part_id: partId,
    part_number: partNumber,
    old_price: oldPrice,
    new_price: Number(newPrice || 0),
    old_currency: oldCurrency,
    new_currency: newCurrency,
    old_discount_percent: oldDiscount,
    new_discount_percent: newDiscount,
    change_reason: doc?.po_number ? `po_ingestion:${doc.po_number}` : 'po_ingestion',
    changed_at: doc?.po_date || new Date().toISOString(),
    changed_by: userData.user?.email || 'system',
  })
}

async function ensurePONotAlreadyInDB(documents: ParsedPODocument[]) {
  const poNumbers = Array.from(new Set(documents.map((doc) => doc.po_number).filter(Boolean))) as string[]
  if (!poNumbers.length) return

  const { data: existing, error } = await (supabase as any)
    .from('purchase_orders')
    .select('id, po_number, status')
    .in('po_number', poNumbers)
  if (error) throw error

  if (existing?.length) {
    const hit = existing[0]
    throw new Error(
      `PO ingestion blocked: PO ${hit.po_number} already exists in DB (id=${hit.id}, status=${hit.status}). ` +
      `Do not ingest the same PO twice.`,
    )
  }
}

export const poIngestionApi = {
  createBatch: async ({ projectId, notes, documents }: CreatePOIngestionBatchInput) => {
    if (!projectId) throw new Error('Select a project before saving an ingestion batch.')
    if (!documents.length) throw new Error('Add at least one PO document.')
    await ensurePONotAlreadyInDB(documents)

    const { data: userData } = await supabase.auth.getUser()
    const summary = {
      documents: documents.length,
      lines: documents.reduce((sum, doc) => sum + doc.lines.length, 0),
      needs_review: documents.filter(doc => doc.parse_status !== 'parsed').length,
    }

    const { data: batch, error: batchError } = await (supabase as any)
      .from('po_ingestion_batches')
      .insert([{
        project_id: projectId,
        notes: notes || null,
        summary,
        created_by: userData.user?.id || null,
      }])
      .select()
      .single()

    if (batchError) throw batchError

    try {
      for (const doc of documents) {
        const { data: savedDoc, error: docError } = await (supabase as any)
          .from('po_ingestion_documents')
          .insert([{
            batch_id: batch.id,
            file_name: doc.file_name,
            file_size: doc.file_size,
            mime_type: doc.mime_type || null,
            page_count: doc.page_count || null,
            po_number: doc.po_number,
            supplier_name: doc.supplier_name,
            supplier_id: (doc as any).supplier_id || null,
            new_supplier_name: (doc as any).new_supplier_name || null,
            po_date: doc.po_date,
            currency: doc.currency || 'INR',
            subtotal: doc.subtotal,
            total_amount: doc.total_amount,
            parse_status: doc.parse_status,
            parse_warnings: doc.parse_warnings,
            raw_text: doc.raw_text,
          }])
          .select()
          .single()

        if (docError) throw docError

        if (doc.lines.length > 0) {
          const rows = doc.lines.map(line => ({
            batch_id: batch.id,
            document_id: savedDoc.id,
            line_no: line.line_no,
            item_code: line.item_code,
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unit_price,
            discount_percent: line.discount_percent,
            total_amount: line.total_amount,
            currency: doc.currency || 'INR',
            raw_line: line.raw_line,
            selected_part_type: (line as any).selected_part_type || (line as any).category || null,
            target_project_subsection_id: (line as any).target_project_subsection_id || null,
          }))

          const { error: lineError } = await (supabase as any)
            .from('po_ingestion_lines')
            .insert(rows)

          if (lineError) throw lineError
        }
      }

      return batch
    } catch (error) {
      await (supabase as any).from('po_ingestion_batches').delete().eq('id', batch.id)
      throw error
    }
  },

  listRecentBatches: async (limit = 10) => {
    const { data, error } = await (supabase as any)
      .from('po_ingestion_batches')
      .select('*, project:projects(project_name, project_number)')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  },

  createPartsAndProjectRows: async ({ projectId, documents }: CreatePOIngestionBatchInput) => {
    if (!projectId) throw new Error('Select a project before adding parts.')
    if (!documents.length) throw new Error('Add at least one PO document.')
    await ensurePONotAlreadyInDB(documents)

    let suppliersCreated = 0
    let partsCreated = 0
    let partsReused = 0
    let projectRowsCreated = 0
    let projectRowsUpdated = 0
    let partsSkippedUnchanged = 0
    let projectRowsSkippedUnchanged = 0

    const supplierCache = new Map<string, any>()
    const partCache = new Map<string, any>()
    const projectPartCache = new Map<string, any>()

    for (const doc of documents as any[]) {
      const blockingWarnings = (doc.parse_warnings || []).filter((warning: string) =>
        /Suspicious item code|Suspicious quantity\/price parse/i.test(warning),
      )
      if (doc.parse_status !== 'parsed' || blockingWarnings.length) {
        throw new Error(
          `PO ingestion blocked for ${doc.file_name}: parsed PDF needs review before creating parts. ` +
          `${blockingWarnings[0] || (doc.parse_warnings || [])[0] || 'Resolve parse warnings and try again.'}`,
        )
      }

      let supplierId = doc.supplier_id || null
      if (!supplierId) {
        const newName = String(doc.new_supplier_name || doc.supplier_name || '').trim()
        if (!newName) throw new Error(`Supplier is missing for ${doc.file_name}.`)
        const supplierKey = newName.toLowerCase()
        if (supplierCache.has(supplierKey)) {
          supplierId = supplierCache.get(supplierKey).id
        } else {
          const { data: existingSupplier } = await (supabase as any)
            .from('suppliers')
            .select('id, name')
            .ilike('name', newName)
            .maybeSingle()

          if (existingSupplier?.id) {
            supplierId = existingSupplier.id
            supplierCache.set(supplierKey, existingSupplier)
          } else {
            const { data: createdSupplier, error: supplierError } = await (supabase as any)
              .from('suppliers')
              .insert([{
                name: newName,
                notes: `Created from PO ingestion${doc.po_number ? ` (${doc.po_number})` : ''}.`,
              }])
              .select()
              .single()
            if (supplierError) throw supplierError
            supplierId = createdSupplier.id
            supplierCache.set(supplierKey, createdSupplier)
            suppliersCreated += 1
          }
        }
      }

      for (const line of doc.lines || []) {
        const category = line.selected_part_type
        const subsectionId = line.target_project_subsection_id
        if (!category) throw new Error(`Part category is missing for ${doc.file_name} line ${line.line_no}.`)
        if (!subsectionId) throw new Error(`Project table is missing for ${doc.file_name} line ${line.line_no}.`)
        if (!line.item_code) throw new Error(`Item code is missing for ${doc.file_name} line ${line.line_no}.`)

        const prefix = PREFIX_BY_PART_TYPE[category]
        if (!prefix) throw new Error(`Unsupported part category ${category}.`)
        const partNumber = `${prefix}-${line.item_code}`
        const lineCurrency = doc.currency || line.currency || 'INR'
        const nextPartValues = {
          supplier_id: supplierId,
          base_price: line.unit_price || 0,
          currency: lineCurrency,
          discount_percent: line.discount_percent || 0,
        }

        const partKey = `${category}:${String(line.item_code).toUpperCase()}`
        let part = partCache.get(partKey)
        if (!part) {
          const { data: existingParts, error: lookupError } = await (supabase as any)
            .from(category)
            .select(`id, part_number, supplier_id, base_price, currency, discount_percent, description, beperp_part_no, po_number`)
            .or(`beperp_part_no.eq.${line.item_code},part_number.eq.${partNumber}`)
            .limit(1)
          if (lookupError) throw lookupError
          part = existingParts?.[0] || null
          if (part) {
            partCache.set(partKey, part)
            partCache.set(`${category}:${partNumber.toUpperCase()}`, part)
          }
        }
        if (part?.id) {
          partsReused += 1
          const hasPartChanges =
            valuesDiffer(part.supplier_id, nextPartValues.supplier_id) ||
            valuesDiffer(part.base_price, nextPartValues.base_price) ||
            valuesDiffer(part.currency, nextPartValues.currency) ||
            valuesDiffer(part.discount_percent, nextPartValues.discount_percent)

          if (hasPartChanges) {
            await (supabase as any)
              .from(category)
              .update({
                ...nextPartValues,
                updated_date: new Date().toISOString(),
              })
              .eq('id', part.id)
            await logPartPriceHistoryFromPO(category, part.id, part.part_number, part, nextPartValues, doc)
            part = {
              ...part,
              ...nextPartValues,
              updated_date: new Date().toISOString(),
            }
            partCache.set(partKey, part)
            partCache.set(`${category}:${part.part_number.toUpperCase()}`, part)
          } else {
            partsSkippedUnchanged += 1
          }
        } else {
          const { data: createdPart, error: partError } = await (supabase as any)
            .from(category)
            .insert([{
              part_number: partNumber,
              beperp_part_no: line.item_code,
              description: line.description,
              ...nextPartValues,
              stock_quantity: 0,
              min_stock_level: 0,
              order_qty: line.quantity || 0,
              received_qty: 0,
              po_number: doc.po_number,
            }])
            .select()
            .single()
          if (partError) throw partError
          part = createdPart
          partCache.set(partKey, part)
          partCache.set(`${category}:${part.part_number.toUpperCase()}`, part)
          partsCreated += 1
        }

        const exactProjectPartKey = `${subsectionId}:${category}:${part.id}`
        let existingProjectPart = projectPartCache.get(exactProjectPartKey)
        if (existingProjectPart === undefined) {
          const { data } = await (supabase as any)
            .from('project_parts')
            .select('id, quantity, unit_price, currency, discount_percent, notes')
            .eq('project_section_id', subsectionId)
            .eq('part_type', category)
            .eq('part_id', part.id)
            .maybeSingle()
          existingProjectPart = data || null
          projectPartCache.set(exactProjectPartKey, existingProjectPart)
        }

        if (existingProjectPart?.id) {
          const nextQty = Number(existingProjectPart.quantity || 0) + Number(line.quantity || 0)
          const nextProjectValues = {
            quantity: nextQty,
            unit_price: line.unit_price || 0,
            currency: lineCurrency,
            discount_percent: line.discount_percent || 0,
          }
          const hasProjectChanges =
            valuesDiffer(existingProjectPart.quantity, nextProjectValues.quantity) ||
            valuesDiffer(existingProjectPart.unit_price, nextProjectValues.unit_price) ||
            valuesDiffer(existingProjectPart.currency, nextProjectValues.currency) ||
            valuesDiffer(existingProjectPart.discount_percent, nextProjectValues.discount_percent)
          if (hasProjectChanges) {
            const { error: updateError } = await (supabase as any)
              .from('project_parts')
              .update({
                ...nextProjectValues,
                updated_date: new Date().toISOString(),
              })
              .eq('id', existingProjectPart.id)
            if (updateError) throw updateError
            projectRowsUpdated += 1
            projectPartCache.set(exactProjectPartKey, {
              ...existingProjectPart,
              ...nextProjectValues,
              updated_date: new Date().toISOString(),
            })
          } else {
            projectRowsSkippedUnchanged += 1
          }
        } else {
          let projectWideExisting: any = null

          if (!isProjectPartDuplicateExemptMaster(part)) {
            projectWideExisting = await findExistingProjectPartInProject(
              supabase as any,
              projectId,
              category,
              part.id,
            )
          }

          if (projectWideExisting?.id) {
            const nextQty = Number(projectWideExisting.quantity || 0) + Number(line.quantity || 0)
            const nextProjectValues = {
              quantity: nextQty,
              unit_price: line.unit_price || 0,
              currency: lineCurrency,
              discount_percent: line.discount_percent || 0,
              notes: doc.po_number
                ? `Updated from PO ingestion ${doc.po_number}`
                : 'Updated from PO ingestion',
            }
            const { error: updateError } = await (supabase as any)
              .from('project_parts')
              .update({
                ...nextProjectValues,
                updated_date: new Date().toISOString(),
              })
              .eq('id', projectWideExisting.id)
            if (updateError) throw updateError
            projectRowsUpdated += 1
          } else {
          const { error: projectPartError } = await (supabase as any)
            .from('project_parts')
            .insert([{
              project_section_id: subsectionId,
              part_type: category,
              part_id: part.id,
              quantity: line.quantity || 0,
              unit_price: line.unit_price || 0,
              currency: lineCurrency,
              discount_percent: line.discount_percent || 0,
              notes: doc.po_number ? `Added from PO ingestion ${doc.po_number}` : 'Added from PO ingestion',
            }])
          if (projectPartError) throw projectPartError
          projectRowsCreated += 1
          }
        }
      }
    }

    return {
      suppliersCreated,
      partsCreated,
      partsReused,
      partsSkippedUnchanged,
      projectRowsCreated,
      projectRowsUpdated,
      projectRowsSkippedUnchanged,
    }
  },
}

export default poIngestionApi
