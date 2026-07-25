const normalize = (value: any) =>
  String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const closeEnough = (left: any, right: any, tolerance = 0.05) =>
  Math.abs(Number(left || 0) - Number(right || 0)) <= tolerance

function itemCodeCandidates(item: any) {
  return [
    item?.part_number,
    String(item?.part_number || '').split('-').at(-1),
    item?.manufacturer_part_number,
    item?.beperp_part_no,
  ].map(normalize).filter(Boolean)
}

function findDatabaseLine(pdfLine: any, databaseItems: any[]) {
  const pdfCode = normalize(pdfLine?.item_code)
  if (pdfCode) {
    const codeMatch = databaseItems.find((item) =>
      itemCodeCandidates(item).some((candidate) =>
        candidate === pdfCode || candidate.endsWith(pdfCode) || pdfCode.endsWith(candidate),
      ),
    )
    if (codeMatch) return codeMatch
  }

  const pdfDescription = normalize(pdfLine?.description).slice(0, 24)
  if (!pdfDescription) return null
  return databaseItems.find((item) => {
    const description = normalize(item?.description).slice(0, 24)
    return description && (
      description.includes(pdfDescription) ||
      pdfDescription.includes(description)
    )
  }) || null
}

export function compareAttachedPOWithDatabasePO(parsed: any, po: any) {
  const issues: Array<{ field: string; expected: any; actual: any }> = []
  const databaseItems = po.purchase_order_items || []
  const matchedDatabaseItemIds = new Set<number>()
  const matchedPdfLineIndexes: number[] = []
  let matchingLineValues = 0

  parsed.lines.forEach((line: any, index: number) => {
    const item = findDatabaseLine(line, databaseItems)
    if (!item) {
      issues.push({
        field: `line:${line.item_code || index + 1}`,
        expected: 'Matching database PO line',
        actual: 'Missing',
      })
      return
    }

    matchedPdfLineIndexes.push(index)
    if (item.id != null) matchedDatabaseItemIds.add(Number(item.id))
    const lineIssuesBefore = issues.length
    if (line.quantity != null && !closeEnough(item.quantity, line.quantity)) {
      issues.push({ field: `quantity:${line.item_code || index + 1}`, expected: line.quantity, actual: item.quantity })
    }
    if (line.unit_price != null && !closeEnough(item.unit_price, line.unit_price)) {
      issues.push({ field: `unit_price:${line.item_code || index + 1}`, expected: line.unit_price, actual: item.unit_price })
    }
    if (
      line.discount_percent != null &&
      !closeEnough(item.discount_percent || 0, line.discount_percent || 0)
    ) {
      issues.push({
        field: `discount_percent:${line.item_code || index + 1}`,
        expected: line.discount_percent || 0,
        actual: item.discount_percent || 0,
      })
    }
    if (
      line.total_amount != null &&
      Number(item.total_amount || 0) > 0 &&
      !closeEnough(item.total_amount, line.total_amount, 1)
    ) {
      issues.push({
        field: `total_amount:${line.item_code || index + 1}`,
        expected: line.total_amount,
        actual: item.total_amount,
      })
    }
    if (issues.length === lineIssuesBefore) matchingLineValues += 1
  })

  for (const item of databaseItems) {
    if (item.id != null && !matchedDatabaseItemIds.has(Number(item.id))) {
      issues.push({
        field: `database_line:${item.part_number || item.id}`,
        expected: 'Line present in attached PO',
        actual: 'Extra database line',
      })
    }
  }

  const parsedPONumber = normalize(parsed.po_number)
  const databasePONumber = normalize(po.po_number)
  const exactPONumber = Boolean(parsedPONumber && parsedPONumber === databasePONumber)
  const parsedSupplier = normalize(parsed.supplier_name)
  const databaseSupplier = normalize(po.suppliers?.name)
  const supplierMatches = Boolean(
    parsedSupplier &&
    databaseSupplier &&
    (parsedSupplier.includes(databaseSupplier) || databaseSupplier.includes(parsedSupplier)),
  )
  const dateMatches = Boolean(parsed.po_date && po.po_date && String(parsed.po_date) === String(po.po_date))
  const lineCoverage = parsed.lines.length ? matchedPdfLineIndexes.length / parsed.lines.length : 0
  const lineValueCoverage = parsed.lines.length ? matchingLineValues / parsed.lines.length : 0

  if (exactPONumber && parsed.po_date && po.po_date && !dateMatches) {
    issues.push({ field: 'po_date', expected: parsed.po_date, actual: po.po_date })
  }
  if (exactPONumber && parsed.supplier_name && !supplierMatches) {
    issues.push({ field: 'supplier', expected: parsed.supplier_name, actual: po.suppliers?.name || null })
  }
  if (exactPONumber && parsed.currency && normalize(parsed.currency) !== normalize(po.currency || 'INR')) {
    issues.push({ field: 'currency', expected: parsed.currency, actual: po.currency || 'INR' })
  }
  if (exactPONumber && parsed.lines.length !== databaseItems.length) {
    issues.push({ field: 'line_count', expected: parsed.lines.length, actual: databaseItems.length })
  }

  const parsedBasicTotal = Number(
    parsed.basic_amount ??
    parsed.subtotal ??
    parsed.lines.reduce((sum: number, line: any) => sum + Number(line.total_amount || 0), 0),
  )
  if (
    exactPONumber &&
    parsedBasicTotal > 0 &&
    Number(po.grand_total || 0) > 0 &&
    !closeEnough(parsedBasicTotal, po.grand_total, 5)
  ) {
    issues.push({ field: 'grand_total_excluding_tax', expected: parsedBasicTotal, actual: po.grand_total })
  }

  const likelyDuplicate = exactPONumber || (
    supplierMatches &&
    lineCoverage >= 0.6 &&
    lineValueCoverage >= 0.6 &&
    (dateMatches || lineCoverage >= 0.9)
  )

  return {
    po_id: po.id,
    po_number: po.po_number,
    status: po.status,
    project_id: po.project_id,
    project: po.project || null,
    supplier: po.suppliers?.name || null,
    po_date: po.po_date,
    exact_po_number: exactPONumber,
    supplier_matches: supplierMatches,
    date_matches: dateMatches,
    matched_pdf_line_indexes: matchedPdfLineIndexes,
    matched_line_count: matchedPdfLineIndexes.length,
    pdf_line_count: parsed.lines.length,
    database_line_count: databaseItems.length,
    line_coverage: Number(lineCoverage.toFixed(4)),
    line_value_coverage: Number(lineValueCoverage.toFixed(4)),
    likely_duplicate: likelyDuplicate,
    data_matches: exactPONumber && issues.length === 0,
    issues,
  }
}
