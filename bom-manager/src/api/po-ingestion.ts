import { supabase } from '@/lib/supabase'
import type { ParsedPODocument } from '@/lib/po-ingestion-parser'

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
}

export default poIngestionApi
