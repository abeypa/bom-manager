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
  po_status: string
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

const isSystemGeneratedPONumber = (value: any) =>
  /^(?:PO|CPO)-?\d+$/i.test(String(value || '').trim())

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

function lineKey(line: Pick<ParsedPOLine, 'item_code' | 'description'>) {
  const code = normalize(line.item_code)
  if (code) return code
  return normalize(line.description).slice(0, 24)
}

function itemKey(item: any) {
  const candidates = codeCandidates(item)
  if (candidates.length) {
    const exactPdfLike = candidates.find((candidate) => /^\d{6,}$/.test(candidate))
    if (exactPdfLike) return exactPdfLike
    const suffix = candidates
      .map((candidate) => candidate.match(/(\d{6,})$/)?.[1] || null)
      .find(Boolean)
    if (suffix) return suffix
    return candidates[0]
  }
  return normalize(item.description).slice(0, 24)
}

function aggregatePdfLines(lines: ParsedPOLine[]) {
  const groups = new Map<string, {
    quantity: number
    unit_price: number | null
    discount_percent: number | null
    total_amount: number
    line_count: number
  }>()

  for (const line of lines) {
    const key = lineKey(line)
    if (!key) continue
    const current = groups.get(key) || {
      quantity: 0,
      unit_price: null,
      discount_percent: null,
      total_amount: 0,
      line_count: 0,
    }
    current.quantity += Number(line.quantity || 0)
    current.total_amount += Number(line.total_amount || 0)
    current.line_count += 1
    if (current.unit_price == null && line.unit_price != null) current.unit_price = Number(line.unit_price)
    if (current.discount_percent == null && line.discount_percent != null) current.discount_percent = Number(line.discount_percent)
    groups.set(key, current)
  }

  return groups
}

function aggregateDbItems(items: any[]) {
  const groups = new Map<string, {
    quantity: number
    unit_price: number | null
    discount_percent: number | null
    total_amount: number
    part_number: string
    description: string
    row_count: number
  }>()

  for (const item of items) {
    const key = itemKey(item)
    if (!key) continue
    const current = groups.get(key) || {
      quantity: 0,
      unit_price: null,
      discount_percent: null,
      total_amount: 0,
      part_number: item.part_number || item.description || 'Unknown item',
      description: item.description || item.part_number || 'Unknown item',
      row_count: 0,
    }
    current.quantity += Number(item.quantity || 0)
    current.total_amount += Number(item.total_amount || 0)
    current.row_count += 1
    if (current.unit_price == null && item.unit_price != null) current.unit_price = Number(item.unit_price)
    if (current.discount_percent == null && item.discount_percent != null) current.discount_percent = Number(item.discount_percent)
    groups.set(key, current)
  }

  return groups
}

function auditUsesOriginalCurrency(po: any, parsed: ReturnType<typeof parsePurchaseOrderText>) {
  const pdfCurrency = normalize(parsed.currency || 'INR')
  const currentCurrency = normalize(po.currency || 'INR')
  const originalCurrency = normalize(po.original_currency || '')
  return Boolean(originalCurrency && originalCurrency === pdfCurrency && currentCurrency !== pdfCurrency)
}

function auditItemView(item: any, useOriginal: boolean, currencyFallback: string) {
  return {
    ...item,
    unit_price: useOriginal ? (item.original_unit_price ?? item.unit_price) : item.unit_price,
    total_amount: useOriginal ? (item.original_total_amount ?? item.total_amount) : item.total_amount,
    currency: useOriginal ? (item.original_currency || currencyFallback) : currencyFallback,
  }
}

function comparableDbHeaderTotal(po: any, useOriginal: boolean) {
  return Number(useOriginal ? (po.original_grand_total ?? po.grand_total ?? 0) : (po.grand_total ?? 0))
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
      po_status: po.status || 'Unknown',
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

    if (
      parsed.po_number &&
      po.po_number &&
      !isSystemGeneratedPONumber(po.po_number) &&
      normalize(parsed.po_number) !== normalize(po.po_number)
    ) {
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
    const useOriginalCurrency = auditUsesOriginalCurrency(po, parsed)
    const comparableDbItems = dbItems.map((item: any) =>
      auditItemView(
        item,
        useOriginalCurrency,
        useOriginalCurrency ? (po.original_currency || po.currency || 'INR') : (po.currency || 'INR'),
      ),
    )

    if (
      normalize(parsed.currency || 'INR') !== normalize(po.currency || 'INR') &&
      !useOriginalCurrency
    ) {
      issues.push({
        severity: 'warning',
        label: 'Currency mismatch',
        expected: po.currency || 'INR',
        actual: parsed.currency || 'INR',
      })
    }

    if (useOriginalCurrency && (!po.exchange_rate || !po.exchange_rate_date)) {
      issues.push({
        severity: 'warning',
        label: 'Conversion metadata',
        expected: 'Exchange rate and exchange rate date recorded on PO',
        actual: 'PO appears converted, but exchange metadata is missing',
      })
    }

    if (parsed.lines.length !== dbItems.length) {
      issues.push({
        severity: 'warning',
        label: 'Line count',
        expected: `${dbItems.length} DB lines`,
        actual: `${parsed.lines.length} PDF lines`,
      })
    }

    const pdfLineGroups = aggregatePdfLines(parsed.lines)
    const dbItemGroups = aggregateDbItems(comparableDbItems)

    for (const item of comparableDbItems) {
      const key = itemKey(item)
      const dbGroup = dbItemGroups.get(key)
      const pdfGroup = pdfLineGroups.get(key)
      const usesGroupedComparison = Boolean(
        dbGroup &&
        pdfGroup &&
        ((dbGroup.row_count || 0) > 1 || (pdfGroup.line_count || 0) > 1),
      )
      if (usesGroupedComparison) continue

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

      const dbLineAmount = Number(item.total_amount || 0)
      if (line.total_amount != null && dbLineAmount > 0 && closeEnough(dbLineAmount, line.total_amount, 1)) {
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

    for (const [key, dbGroup] of dbItemGroups.entries()) {
      const pdfGroup = pdfLineGroups.get(key)
      if (!pdfGroup) continue
      const usesGroupedComparison =
        (dbGroup.row_count || 0) > 1 ||
        (pdfGroup.line_count || 0) > 1
      if (!usesGroupedComparison) continue

      if (!closeEnough(dbGroup.quantity, pdfGroup.quantity)) {
        issues.push({
          severity: 'error',
          label: `Qty mismatch: ${dbGroup.part_number}`,
          expected: String(dbGroup.quantity),
          actual: String(pdfGroup.quantity),
        })
      }

      if (
        dbGroup.total_amount > 0 &&
        pdfGroup.total_amount > 0 &&
        !closeEnough(dbGroup.total_amount, pdfGroup.total_amount, 1)
      ) {
        issues.push({
          severity: 'error',
          label: `Line amount mismatch: ${dbGroup.part_number}`,
          expected: money(dbGroup.total_amount),
          actual: money(pdfGroup.total_amount),
        })
      }
    }

    const pdfBasicAmount = pdfBasicComparableAmount(parsed)
    const comparableDbTotal = comparableDbHeaderTotal(po, useOriginalCurrency)
    if (pdfBasicAmount && comparableDbTotal > 0 && !closeEnough(comparableDbTotal, pdfBasicAmount.value, 5)) {
      issues.push({
        severity: 'warning',
        label: 'Basic amount',
        expected: money(comparableDbTotal),
        actual: `${money(pdfBasicAmount.value)} (${pdfBasicAmount.label})`,
      })
    }

    return {
      po_id: po.id,
      po_number: poNumber,
      po_status: po.status || 'Unknown',
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
      po_status: po.status || 'Unknown',
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
