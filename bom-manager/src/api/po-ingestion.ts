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
  projectId?: number | null
  notes?: string
  documents: ParsedPODocument[]
}

const valuesDiffer = (a: any, b: any, epsilon = 0.0001) => {
  const aNum = Number(a)
  const bNum = Number(b)
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return Math.abs(aNum - bNum) > epsilon
  return String(a ?? '') !== String(b ?? '')
}

const normalizeDateKey = (value: string | null | undefined) => {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

const shouldPromoteIncomingPrice = (incomingDate: string | null | undefined, currentDate: string | null | undefined) => {
  const incomingKey = normalizeDateKey(incomingDate)
  const currentKey = normalizeDateKey(currentDate)
  if (!incomingKey) return true
  if (!currentKey) return true
  return incomingKey >= currentKey
}

async function logPartPriceSnapshotFromPO(
  partTable: string,
  partId: number,
  partNumber: string,
  oldRow: any,
  newValues: any,
  doc: any,
  loggedKeys: Set<string>,
) {
  const hasChange =
    valuesDiffer(oldRow?.base_price ?? null, newValues?.base_price ?? null) ||
    valuesDiffer(oldRow?.currency || 'INR', newValues?.currency || 'INR') ||
    valuesDiffer(oldRow?.discount_percent ?? null, newValues?.discount_percent ?? null)
  const poNumber = String(doc?.po_number || '').trim()
  const poDate = String(doc?.po_date || '').trim()
  const newPrice = Number(newValues?.base_price || 0)
  const newCurrency = String(newValues?.currency || 'INR')
  const newDiscount = Number(newValues?.discount_percent || 0)
  const dedupeKey = [
    partTable,
    partId,
    poNumber || 'no-po',
    poDate || 'no-date',
    newPrice.toFixed(4),
    newCurrency,
    newDiscount.toFixed(4),
  ].join('|')

  if (loggedKeys.has(dedupeKey)) return
  loggedKeys.add(dedupeKey)

  const { data: userData } = await supabase.auth.getUser()
  await (supabase as any).from('part_price_history').insert({
    part_table_name: partTable,
    part_id: partId,
    part_number: partNumber,
    old_price: oldRow?.base_price ?? null,
    new_price: newPrice,
    old_currency: oldRow?.currency || 'INR',
    new_currency: newCurrency,
    old_discount_percent: oldRow?.discount_percent ?? null,
    new_discount_percent: newDiscount,
    change_reason: poNumber
      ? `${hasChange ? 'po_ingestion' : 'po_ingestion_snapshot'}:${poNumber}`
      : (hasChange ? 'po_ingestion' : 'po_ingestion_snapshot'),
    changed_at: poDate || new Date().toISOString(),
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
        project_id: projectId || null,
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
    const subsectionProjectCache = new Map<number, number>()
    const loggedPriceSnapshotKeys = new Set<string>()

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

        let targetProjectId = subsectionProjectCache.get(subsectionId)
        if (!targetProjectId) {
          const { data: subsection, error: subsectionError } = await (supabase as any)
            .from('project_subsections')
            .select('id, project_id')
            .eq('id', subsectionId)
            .single()
          if (subsectionError || !subsection?.project_id) {
            throw subsectionError || new Error(`Target project could not be resolved for subsection ${subsectionId}.`)
          }
          targetProjectId = subsection.project_id
          subsectionProjectCache.set(subsectionId, targetProjectId)
        }

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
            .select(`id, part_number, supplier_id, base_price, currency, discount_percent, description, beperp_part_no, po_number, updated_date`)
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
          const shouldPromote = shouldPromoteIncomingPrice(doc.po_date, part.updated_date)
          partsReused += 1
          const hasPartChanges =
            valuesDiffer(part.supplier_id, nextPartValues.supplier_id) ||
            valuesDiffer(part.base_price, nextPartValues.base_price) ||
            valuesDiffer(part.currency, nextPartValues.currency) ||
            valuesDiffer(part.discount_percent, nextPartValues.discount_percent)

          if (hasPartChanges) {
            if (shouldPromote) {
              await (supabase as any)
                .from(category)
                .update({
                  ...nextPartValues,
                  updated_date: doc.po_date || new Date().toISOString(),
                })
                .eq('id', part.id)
              part = {
                ...part,
                ...nextPartValues,
                updated_date: doc.po_date || new Date().toISOString(),
              }
              partCache.set(partKey, part)
              partCache.set(`${category}:${part.part_number.toUpperCase()}`, part)
            }
          } else {
            partsSkippedUnchanged += 1
          }

          await logPartPriceSnapshotFromPO(
            category,
            part.id,
            part.part_number,
            part,
            nextPartValues,
            doc,
            loggedPriceSnapshotKeys,
          )
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

          await logPartPriceSnapshotFromPO(
            category,
            part.id,
            part.part_number,
            null,
            nextPartValues,
            doc,
            loggedPriceSnapshotKeys,
          )
        }

        const exactProjectPartKey = `${subsectionId}:${category}:${part.id}`
        let existingProjectPart = projectPartCache.get(exactProjectPartKey)
        if (existingProjectPart === undefined) {
          const { data } = await (supabase as any)
            .from('project_parts')
            .select('id, quantity, unit_price, currency, discount_percent, notes, updated_date')
            .eq('project_section_id', subsectionId)
            .eq('part_type', category)
            .eq('part_id', part.id)
            .maybeSingle()
          existingProjectPart = data || null
          projectPartCache.set(exactProjectPartKey, existingProjectPart)
        }

        if (existingProjectPart?.id) {
          const nextQty = Number(existingProjectPart.quantity || 0) + Number(line.quantity || 0)
          const promoteProjectSnapshot = shouldPromoteIncomingPrice(doc.po_date, existingProjectPart.updated_date)
          const nextProjectValues = {
            quantity: nextQty,
            unit_price: promoteProjectSnapshot ? (line.unit_price || 0) : Number(existingProjectPart.unit_price || 0),
            currency: promoteProjectSnapshot ? lineCurrency : (existingProjectPart.currency || lineCurrency),
            discount_percent: promoteProjectSnapshot
              ? (line.discount_percent || 0)
              : Number(existingProjectPart.discount_percent || 0),
            notes: doc.po_number
              ? `Updated from PO ingestion ${doc.po_number}${promoteProjectSnapshot ? '' : ' (historical price preserved on PO only)'}`
              : `Updated from PO ingestion${promoteProjectSnapshot ? '' : ' (historical price preserved on PO only)'}`,
          }
          const hasProjectChanges =
            valuesDiffer(existingProjectPart.quantity, nextProjectValues.quantity) ||
            valuesDiffer(existingProjectPart.unit_price, nextProjectValues.unit_price) ||
            valuesDiffer(existingProjectPart.currency, nextProjectValues.currency) ||
            valuesDiffer(existingProjectPart.discount_percent, nextProjectValues.discount_percent) ||
            valuesDiffer(existingProjectPart.notes, nextProjectValues.notes)
          if (hasProjectChanges) {
            const { error: updateError } = await (supabase as any)
              .from('project_parts')
              .update({
                ...nextProjectValues,
                updated_date: doc.po_date || new Date().toISOString(),
              })
              .eq('id', existingProjectPart.id)
            if (updateError) throw updateError
            projectRowsUpdated += 1
            projectPartCache.set(exactProjectPartKey, {
              ...existingProjectPart,
              ...nextProjectValues,
              updated_date: doc.po_date || new Date().toISOString(),
            })
          } else {
            projectRowsSkippedUnchanged += 1
          }
        } else {
          let projectWideExisting: any = null

          if (!isProjectPartDuplicateExemptMaster(part)) {
            projectWideExisting = await findExistingProjectPartInProject(
              supabase as any,
              targetProjectId,
              category,
              part.id,
            )
          }

          if (projectWideExisting?.id) {
            const nextQty = Number(projectWideExisting.quantity || 0) + Number(line.quantity || 0)
            const promoteProjectSnapshot = shouldPromoteIncomingPrice(doc.po_date, projectWideExisting.updated_date)
            const nextProjectValues = {
              quantity: nextQty,
              unit_price: promoteProjectSnapshot ? (line.unit_price || 0) : Number(projectWideExisting.unit_price || 0),
              currency: promoteProjectSnapshot ? lineCurrency : (projectWideExisting.currency || lineCurrency),
              discount_percent: promoteProjectSnapshot
                ? (line.discount_percent || 0)
                : Number(projectWideExisting.discount_percent || 0),
              notes: doc.po_number
                ? `Updated from PO ingestion ${doc.po_number}${promoteProjectSnapshot ? '' : ' (historical price preserved on PO only)'}`
                : `Updated from PO ingestion${promoteProjectSnapshot ? '' : ' (historical price preserved on PO only)'}`,
            }
            const { error: updateError } = await (supabase as any)
              .from('project_parts')
              .update({
                ...nextProjectValues,
                updated_date: doc.po_date || new Date().toISOString(),
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
