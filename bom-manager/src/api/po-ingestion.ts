import { supabase } from '@/lib/supabase'
import type { ParsedPODocument } from '@/lib/po-ingestion-parser'

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

export const poIngestionApi = {
  createBatch: async ({ projectId, notes, documents }: CreatePOIngestionBatchInput) => {
    if (!projectId) throw new Error('Select a project before saving an ingestion batch.')
    if (!documents.length) throw new Error('Add at least one PO document.')

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

    let suppliersCreated = 0
    let partsCreated = 0
    let partsReused = 0
    let projectRowsCreated = 0
    let projectRowsUpdated = 0

    for (const doc of documents as any[]) {
      let supplierId = doc.supplier_id || null
      if (!supplierId) {
        const newName = String(doc.new_supplier_name || doc.supplier_name || '').trim()
        if (!newName) throw new Error(`Supplier is missing for ${doc.file_name}.`)

        const { data: existingSupplier } = await (supabase as any)
          .from('suppliers')
          .select('id, name')
          .ilike('name', newName)
          .maybeSingle()

        if (existingSupplier?.id) {
          supplierId = existingSupplier.id
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
          suppliersCreated += 1
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

        const { data: existingParts, error: lookupError } = await (supabase as any)
          .from(category)
          .select('id, part_number')
          .or(`beperp_part_no.eq.${line.item_code},part_number.eq.${partNumber}`)
          .limit(1)
        if (lookupError) throw lookupError

        let part = existingParts?.[0]
        if (part?.id) {
          partsReused += 1
          await (supabase as any)
            .from(category)
            .update({
              supplier_id: supplierId,
              base_price: line.unit_price || 0,
              currency: doc.currency || line.currency || 'INR',
              discount_percent: line.discount_percent || 0,
              updated_date: new Date().toISOString(),
            })
            .eq('id', part.id)
        } else {
          const { data: createdPart, error: partError } = await (supabase as any)
            .from(category)
            .insert([{
              part_number: partNumber,
              beperp_part_no: line.item_code,
              description: line.description,
              supplier_id: supplierId,
              base_price: line.unit_price || 0,
              currency: doc.currency || line.currency || 'INR',
              discount_percent: line.discount_percent || 0,
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
          partsCreated += 1
        }

        const { data: existingProjectPart } = await (supabase as any)
          .from('project_parts')
          .select('id, quantity')
          .eq('project_section_id', subsectionId)
          .eq('part_type', category)
          .eq('part_id', part.id)
          .maybeSingle()

        if (existingProjectPart?.id) {
          const nextQty = Number(existingProjectPart.quantity || 0) + Number(line.quantity || 0)
          const { error: updateError } = await (supabase as any)
            .from('project_parts')
            .update({
              quantity: nextQty,
              unit_price: line.unit_price || 0,
              currency: doc.currency || line.currency || 'INR',
              discount_percent: line.discount_percent || 0,
              updated_date: new Date().toISOString(),
            })
            .eq('id', existingProjectPart.id)
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
              currency: doc.currency || line.currency || 'INR',
              discount_percent: line.discount_percent || 0,
              notes: doc.po_number ? `Added from PO ingestion ${doc.po_number}` : 'Added from PO ingestion',
            }])
          if (projectPartError) throw projectPartError
          projectRowsCreated += 1
        }
      }
    }

    return {
      suppliersCreated,
      partsCreated,
      partsReused,
      projectRowsCreated,
      projectRowsUpdated,
    }
  },
}

export default poIngestionApi
