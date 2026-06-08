import { supabase } from '@/lib/supabase'
import { extractPurchaseOrderPdfTaxAmount } from '@/lib/po-pdf-tax'

export interface PurchaseOrderTaxBackfillOptions {
  poIds?: number[]
  limit?: number
  onlyMissing?: boolean
  dryRun?: boolean
}

export interface PurchaseOrderTaxBackfillResultRow {
  po_id: number
  po_number: string
  status: 'updated' | 'skipped' | 'failed'
  previous_tax_amount: number | null
  new_tax_amount: number | null
  reason?: string
}

export interface PurchaseOrderTaxBackfillResult {
  scanned: number
  updated: number
  skipped: number
  failed: number
  rows: PurchaseOrderTaxBackfillResultRow[]
}

export async function backfillPurchaseOrderPdfTaxAmounts(options: PurchaseOrderTaxBackfillOptions = {}): Promise<PurchaseOrderTaxBackfillResult> {
  const limit = Math.max(1, Math.min(500, Number(options.limit || 200)))
  const scopedIds = Array.isArray(options.poIds)
    ? options.poIds.filter((id) => Number.isInteger(id) && id > 0).slice(0, 500)
    : []

  let query = (supabase as any)
    .from('purchase_orders')
    .select('id, po_number, tax_amount, bep_po_pdf_url')
    .not('bep_po_pdf_url', 'is', null)
    .order('po_date', { ascending: false })
    .limit(limit)

  if (scopedIds.length) query = query.in('id', scopedIds)
  if (options.onlyMissing !== false) query = query.is('tax_amount', null)

  const { data, error } = await query
  if (error) throw error

  const rows: PurchaseOrderTaxBackfillResultRow[] = []

  for (const po of data || []) {
    const previousTaxAmount = po.tax_amount != null ? Number(po.tax_amount) : null
    const pdfRef = String(po.bep_po_pdf_url || '').trim()

    if (!pdfRef) {
      rows.push({
        po_id: po.id,
        po_number: po.po_number,
        status: 'skipped',
        previous_tax_amount: previousTaxAmount,
        new_tax_amount: previousTaxAmount,
        reason: 'No attached PDF reference.',
      })
      continue
    }

    try {
      const newTaxAmount = await extractPurchaseOrderPdfTaxAmount(pdfRef, po.po_number)

      if (newTaxAmount == null) {
        rows.push({
          po_id: po.id,
          po_number: po.po_number,
          status: 'skipped',
          previous_tax_amount: previousTaxAmount,
          new_tax_amount: null,
          reason: 'Tax amount could not be parsed from the attached PDF.',
        })
        continue
      }

      if (previousTaxAmount != null && Math.abs(previousTaxAmount - newTaxAmount) <= 0.01) {
        rows.push({
          po_id: po.id,
          po_number: po.po_number,
          status: 'skipped',
          previous_tax_amount: previousTaxAmount,
          new_tax_amount: newTaxAmount,
          reason: 'Existing tax amount already matches parsed PDF value.',
        })
        continue
      }

      if (!options.dryRun) {
        const { error: updateError } = await (supabase as any)
          .from('purchase_orders')
          .update({
            tax_amount: newTaxAmount,
            updated_date: new Date().toISOString(),
          })
          .eq('id', po.id)

        if (updateError) throw updateError
      }

      rows.push({
        po_id: po.id,
        po_number: po.po_number,
        status: 'updated',
        previous_tax_amount: previousTaxAmount,
        new_tax_amount: newTaxAmount,
        reason: options.dryRun ? 'Dry run only; DB not updated.' : undefined,
      })
    } catch (err: any) {
      rows.push({
        po_id: po.id,
        po_number: po.po_number,
        status: 'failed',
        previous_tax_amount: previousTaxAmount,
        new_tax_amount: null,
        reason: err?.message || 'Unknown error while parsing attached PDF.',
      })
    }
  }

  return {
    scanned: rows.length,
    updated: rows.filter((row) => row.status === 'updated').length,
    skipped: rows.filter((row) => row.status === 'skipped').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    rows,
  }
}
