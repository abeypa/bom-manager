import { getSignedUrl } from '@/api/storage'
import { urlToPDFAttachment } from '@/lib/ai-attachments'
import { parsePurchaseOrderText, type ParsedPOLine } from '@/lib/po-ingestion-parser'

export type POPdfAuditStatus = 'match' | 'warning' | 'missing_pdf' | 'error'

export interface POPdfAuditIssue {
  severity: 'warning' | 'error'
  label: string
  expected: string
  actual: string
}

export interface POPdfAuditResult {
  po_id: number
  po_number: string
  status: POPdfAuditStatus
  supplier_name: string
  pdf_po_number: string | null
  pdf_supplier_name: string | null
  pdf_line_count: number
  db_line_count: number
  issues: POPdfAuditIssue[]
  checked_at: string
}

const normalize = (value: any) =>
  String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const money = (value: any) =>
  Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

const closeEnough = (a: any, b: any, tolerance = 0.05) =>
  Math.abs(Number(a || 0) - Number(b || 0)) <= tolerance

function resolveDisplayUrl(stored: string) {
  if (!stored) return Promise.resolve('')
  if (!stored.startsWith('http')) return getSignedUrl(stored, 3600).then((fresh) => fresh || stored)
  if (stored.includes('/storage/v1/object/sign/drawings/')) {
    const match = stored.match(/\/drawings\/(.+?)(?:\?|$)/)
    if (match) return getSignedUrl(match[1], 3600).then((fresh) => fresh || stored)
  }
  return Promise.resolve(stored)
}

function codeCandidates(item: any) {
  const candidates = [
    item.part_number,
    item.part_number?.split('-').at(-1),
    item.manufacturer_part_number,
  ]
  return candidates.map(normalize).filter(Boolean)
}

function findLineForItem(item: any, lines: ParsedPOLine[]) {
  const candidates = codeCandidates(item)
  const codeMatch = lines.find((line) => {
    const lineCode = normalize(line.item_code)
    if (!lineCode) return false
    return candidates.some((candidate) => candidate === lineCode || candidate.endsWith(lineCode) || lineCode.endsWith(candidate))
  })
  if (codeMatch) return codeMatch

  const itemWords = normalize(item.description).slice(0, 18)
  if (!itemWords) return null
  return lines.find((line) => normalize(line.description).includes(itemWords) || itemWords.includes(normalize(line.description).slice(0, 18))) || null
}

function pdfBasicComparableAmount(parsed: ReturnType<typeof parsePurchaseOrderText>) {
  const lineTotal = parsed.lines.reduce((sum, line) => sum + Number(line.total_amount || 0), 0)
  if (parsed.basic_amount != null) return { label: 'PDF Basic Amount', value: parsed.basic_amount }
  if (parsed.subtotal != null) return { label: 'PDF subtotal/taxable value', value: parsed.subtotal }
  if (lineTotal > 0) return { label: 'PDF line basic total', value: lineTotal }
  if (parsed.total_amount != null) return { label: 'PDF total amount', value: parsed.total_amount }
  return null
}

export async function auditPurchaseOrderPdf(po: any): Promise<POPdfAuditResult> {
  const issues: POPdfAuditIssue[] = []
  const poNumber = po.po_number || `PO #${po.id}`
  const supplierName = po.suppliers?.name || po.supplier?.name || 'Unassigned'

  if (!po.bep_po_pdf_url) {
    return {
      po_id: po.id,
      po_number: poNumber,
      status: 'missing_pdf',
      supplier_name: supplierName,
      pdf_po_number: null,
      pdf_supplier_name: null,
      pdf_line_count: 0,
      db_line_count: po.purchase_order_items?.length || 0,
      issues: [{
        severity: 'error',
        label: 'PDF attachment',
        expected: 'Attached PO PDF',
        actual: 'No PDF attached',
      }],
      checked_at: new Date().toISOString(),
    }
  }

  try {
    const pdfUrl = await resolveDisplayUrl(po.bep_po_pdf_url)
    const pdf = await urlToPDFAttachment(pdfUrl, `${poNumber}.pdf`)
    const parsed = parsePurchaseOrderText({
      fileName: pdf.name,
      fileSize: pdf.size,
      mimeType: 'application/pdf',
      pageCount: pdf.pageCount,
      text: pdf.text,
    })

    if (parsed.po_number && normalize(parsed.po_number) !== normalize(po.po_number)) {
      issues.push({
        severity: 'error',
        label: 'PO number',
        expected: po.po_number,
        actual: parsed.po_number,
      })
    }

    if (parsed.supplier_name) {
      const dbSupplier = normalize(supplierName)
      const pdfSupplier = normalize(parsed.supplier_name)
      if (dbSupplier && pdfSupplier && !dbSupplier.includes(pdfSupplier) && !pdfSupplier.includes(dbSupplier)) {
        issues.push({
          severity: 'warning',
          label: 'Supplier',
          expected: supplierName,
          actual: parsed.supplier_name,
        })
      }
    }

    const dbItems = po.purchase_order_items || []
    if (parsed.lines.length !== dbItems.length) {
      issues.push({
        severity: 'warning',
        label: 'Line count',
        expected: `${dbItems.length} DB lines`,
        actual: `${parsed.lines.length} PDF lines`,
      })
    }

    for (const item of dbItems) {
      const line = findLineForItem(item, parsed.lines)
      if (!line) {
        issues.push({
          severity: 'error',
          label: `Missing PDF line: ${item.part_number}`,
          expected: item.description || item.part_number,
          actual: 'No matching PDF line',
        })
        continue
      }
      if (line.quantity != null && !closeEnough(item.quantity, line.quantity)) {
        issues.push({
          severity: 'error',
          label: `Qty mismatch: ${item.part_number}`,
          expected: String(item.quantity),
          actual: String(line.quantity),
        })
      }
      if (line.unit_price != null && !closeEnough(item.unit_price, line.unit_price)) {
        issues.push({
          severity: 'error',
          label: `Unit price mismatch: ${item.part_number}`,
          expected: money(item.unit_price),
          actual: money(line.unit_price),
        })
      }
      if (line.discount_percent != null && !closeEnough(item.discount_percent || 0, line.discount_percent || 0)) {
        issues.push({
          severity: 'warning',
          label: `Discount mismatch: ${item.part_number}`,
          expected: `${item.discount_percent || 0}%`,
          actual: `${line.discount_percent || 0}%`,
        })
      }
    }

    const pdfBasicAmount = pdfBasicComparableAmount(parsed)
    if (pdfBasicAmount && po.grand_total != null && !closeEnough(po.grand_total, pdfBasicAmount.value, 1)) {
      issues.push({
        severity: 'warning',
        label: 'Basic amount',
        expected: money(po.grand_total),
        actual: `${money(pdfBasicAmount.value)} (${pdfBasicAmount.label})`,
      })
    }

    return {
      po_id: po.id,
      po_number: poNumber,
      status: issues.some((i) => i.severity === 'error') ? 'warning' : issues.length ? 'warning' : 'match',
      supplier_name: supplierName,
      pdf_po_number: parsed.po_number,
      pdf_supplier_name: parsed.supplier_name,
      pdf_line_count: parsed.lines.length,
      db_line_count: dbItems.length,
      issues,
      checked_at: new Date().toISOString(),
    }
  } catch (err: any) {
    return {
      po_id: po.id,
      po_number: poNumber,
      status: 'error',
      supplier_name: supplierName,
      pdf_po_number: null,
      pdf_supplier_name: null,
      pdf_line_count: 0,
      db_line_count: po.purchase_order_items?.length || 0,
      issues: [{
        severity: 'error',
        label: 'PDF parse',
        expected: 'Readable PDF text',
        actual: err?.message || 'Failed to read PDF',
      }],
      checked_at: new Date().toISOString(),
    }
  }
}
