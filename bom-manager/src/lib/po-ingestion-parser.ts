export interface ParsedPOLine {
  line_no: number
  item_code: string | null
  description: string
  quantity: number | null
  unit_price: number | null
  discount_percent: number | null
  total_amount: number | null
  raw_line: string
}

export interface ParsedPODocument {
  file_name: string
  file_size: number
  mime_type?: string
  page_count?: number
  po_number: string | null
  supplier_name: string | null
  po_date: string | null
  currency: string
  basic_amount: number | null
  subtotal: number | null
  total_amount: number | null
  parse_status: 'parsed' | 'needs_review' | 'needs_ocr' | 'failed'
  parse_warnings: string[]
  raw_text: string
  lines: ParsedPOLine[]
  supplier_id?: number | null
  new_supplier_name?: string | null
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: 'INR',
  RS: 'INR',
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
}

function cleanText(text: string) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseNumber(value: string | undefined | null): number | null {
  if (!value) return null
  const cleaned = value.replace(/[, ]/g, '').replace(/[^\d.-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseDiscountPercent(value: string | undefined | null): number | null {
  const parsed = parseNumber(value)
  if (parsed == null || parsed < 0 || parsed > 100) return null
  return parsed
}

function parseBepDiscountPercent(lines: string[], start: number, end: number) {
  const text = lines.slice(start, end).join(' ')
  const atRate = text.match(/@\s*([\d,]+(?:\.\d+)?)\s*%?/i)?.[1]
  if (atRate) return parseDiscountPercent(atRate)
  const percent = text.match(/([\d,]+(?:\.\d+)?)\s*%/i)?.[1]
  if (percent) return parseDiscountPercent(percent)
  return parseDiscountPercent(lines[start])
}

function resolveBepDiscountAndAmount(lines: string[], priceIndex: number, end: number) {
  const first = nextNonEmptyIndex(lines, priceIndex + 1, end)
  if (first < 0) return null

  // BEP PDFs often split the DISC cell as "361546.21 @ 30.00%" across
  // multiple extracted text lines. The first number is discount value, not
  // discount percent, so scan until the actual percent marker and then take
  // the following numeric line as AMOUNT.
  const maxDiscountEnd = Math.min(end, first + 8)
  for (let i = first; i < maxDiscountEnd; i++) {
    const windowText = lines.slice(first, i + 1).join(' ')
    if (!/@|%/.test(windowText)) continue
    const discountPercent = parseBepDiscountPercent(lines, first, i + 1)
    const maybeAmount = nextNonEmptyIndex(lines, i + 1, end)
    if (discountPercent != null && maybeAmount > 0 && parseNumber(lines[maybeAmount]) != null) {
      return { discountIndex: first, amountIndex: maybeAmount, discountPercent }
    }
  }

  const maybeAmount = nextNonEmptyIndex(lines, first + 1, end)
  if (maybeAmount > 0 && parseNumber(lines[maybeAmount]) != null) {
    const discountPercent = parseDiscountPercent(lines[first])
    if (discountPercent != null) return { discountIndex: first, amountIndex: maybeAmount, discountPercent }
  }

  return null
}

function reconcileLineAgainstAmount(line: ParsedPOLine): ParsedPOLine {
  const qty = Number(line.quantity || 0)
  const unit = Number(line.unit_price || 0)
  const inferredDiscount = line.discount_percent ?? parseDiscountPercent(line.raw_line.match(/@\s*([\d,]+(?:\.\d+)?)\s*%?/i)?.[1])
  const discount = Number(inferredDiscount || 0)
  const amount = Number(line.total_amount || 0)
  if (!qty || !unit || !amount || discount < 0 || discount >= 100) return line

  const computed = qty * unit * (1 - discount / 100)
  if (Math.abs(computed - amount) <= Math.max(1, amount * 0.01)) return line

  const expectedQty = amount / (unit * (1 - discount / 100))
  if (!Number.isFinite(expectedQty) || expectedQty <= 0) return line

  // PDF text extraction sometimes shifts the DISC amount into QTY. If the
  // line amount implies a clean quantity, prefer the PDF arithmetic.
  const rounded = Math.round(expectedQty)
  if (Math.abs(expectedQty - rounded) >= 0.01) return line
  const correctedQty = rounded
  if (Math.abs(correctedQty - qty) < 0.01) return line

  return {
    ...line,
    discount_percent: inferredDiscount,
    quantity: correctedQty,
    raw_line: `${line.raw_line} | reconciled_qty_from_amount=${correctedQty}`,
  }
}

function lineAmountSum(lines: ParsedPOLine[]) {
  return lines.reduce((sum, line) => sum + Number(line.total_amount || 0), 0)
}

function pickLinesMatchingBasicAmount(lines: ParsedPOLine[], basicAmount: number | null) {
  if (!basicAmount || lines.length <= 1 || lines.length > 18) return lines

  const tolerance = Math.max(5, basicAmount * 0.01)
  const fullDiff = Math.abs(lineAmountSum(lines) - basicAmount)
  let bestMask = 0
  let bestDiff = fullDiff
  let bestCount = lines.length

  for (let mask = 1; mask < (1 << lines.length); mask++) {
    let sum = 0
    let count = 0
    for (let i = 0; i < lines.length; i++) {
      if (!(mask & (1 << i))) continue
      sum += Number(lines[i].total_amount || 0)
      count += 1
    }
    const diff = Math.abs(sum - basicAmount)
    if (diff < bestDiff - 0.01 || (Math.abs(diff - bestDiff) <= 0.01 && count < bestCount)) {
      bestMask = mask
      bestDiff = diff
      bestCount = count
    }
  }

  if (!bestMask || bestDiff > tolerance || bestDiff >= fullDiff) return lines
  return lines.filter((_, index) => Boolean(bestMask & (1 << index)))
}

function chooseBestParsedLines(candidates: ParsedPOLine[][], basicAmount: number | null) {
  const nonEmpty = candidates.filter((candidate) => candidate.length > 0)
  if (!nonEmpty.length) return []
  if (!basicAmount) return nonEmpty[0]

  return nonEmpty
    .map((candidate) => ({
      lines: candidate,
      diff: Math.abs(lineAmountSum(candidate) - basicAmount),
    }))
    .sort((a, b) => a.diff - b.diff || b.lines.length - a.lines.length)[0].lines
}

function parseDate(value: string | undefined | null): string | null {
  if (!value) return null
  const raw = value.trim()
  const dmy = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (dmy) {
    const dd = dmy[1].padStart(2, '0')
    const mm = dmy[2].padStart(2, '0')
    const yyyy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${yyyy}-${mm}-${dd}`
  }
  const ymd = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
  return null
}

function parseCompactDate(value: string | undefined | null): string | null {
  const raw = value?.trim()
  if (!raw || !/^\d{8}$/.test(raw)) return null
  return parseDate(`${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`)
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const p of patterns) {
    const m = text.match(p)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

function detectCurrency(text: string) {
  if (/[₹]|(?:\bINR\b)|(?:\bRs\.?\b)/i.test(text)) return 'INR'
  const found = text.match(/\b(INR|USD|EUR|GBP)\b/i)?.[1]?.toUpperCase()
  return CURRENCY_SYMBOLS[found || ''] || 'INR'
}

function metadataFromFilename(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '')
  const match = baseName.match(/^(.*?)_POP(\d{2})-(\d{2})(\d+)_([0-9]{8})$/i)
  if (!match) return { supplier: null, poNumber: null, poDate: null }
  return {
    supplier: match[1].replace(/\s+/g, ' ').trim(),
    poNumber: `PO/P/${match[2]}-${match[3]}/${match[4]}`,
    poDate: parseCompactDate(match[5]),
  }
}

function cleanSupplierName(value: string | null) {
  if (!value) return null
  return value
    .replace(/\bBEP INDIA AUTOMOTIVE SYSTEMS\b.*$/i, '')
    .replace(/\bDOCUMENT DETAILS\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim() || null
}

function valueAfterLabel(lines: string[], label: RegExp) {
  const idx = lines.findIndex(line => label.test(line))
  if (idx < 0) return null
  const sameLineValue = lines[idx].split(':').slice(1).join(':').trim()
  if (sameLineValue) return sameLineValue
  return lines.slice(idx + 1, idx + 5).find(line => line && !/^[:\s]+$/.test(line)) || null
}

function detectPONumber(text: string, lines: string[], fileName: string) {
  const filenameMeta = metadataFromFilename(fileName)
  const fullBepNumber = firstMatch(text, [
    /\b(PO\/[A-Z0-9]+\/\d{2}[-/]\d{2}\/\d{3,})\b/i,
  ])
  if (fullBepNumber) return fullBepNumber

  const documentNo = valueAfterLabel(lines, /^document\s+no\b/i)
  const fromDocumentNo =
    documentNo?.match(/\b(PO\/[A-Z0-9]+\/\d{2}[-/]\d{2}\/\d{3,})\b/i)?.[1] ||
    documentNo?.match(/\b(PO\/[A-Z0-9/_.-]+)/i)?.[1]
  if (fromDocumentNo) return fromDocumentNo

  const explicit = firstMatch(text, [
    /\b(PO\/[A-Z0-9/_.-]+)/i,
    /\bp\.?\s*o\.?\s*(?:no|number|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9/_.-]{3,})/i,
  ])
  return explicit || filenameMeta.poNumber
}

function detectPODate(text: string, lines: string[], fileName: string) {
  const filenameMeta = metadataFromFilename(fileName)
  const detailsIdx = lines.findIndex(line => /^document details\b/i.test(line))
  const searchLines = detailsIdx >= 0 ? lines.slice(detailsIdx, detailsIdx + 20) : lines
  const dateLabelIdx = searchLines.findIndex(line => /^date\s*:?\s*$/i.test(line) || /^date\s*:/i.test(line))
  if (dateLabelIdx >= 0) {
    const sameLine = searchLines[dateLabelIdx].split(':').slice(1).join(':').trim()
    const value = sameLine || searchLines.slice(dateLabelIdx + 1, dateLabelIdx + 5).find(line => /\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(line))
    const parsed = parseDate(value)
    if (parsed) return parsed
  }

  const explicit = firstMatch(text, [
    /\b(?:po\s*)?date\s*[:\-]\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
    /\b(?:dated?)\s*[:\-]\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
  ])
  return parseDate(explicit) || filenameMeta.poDate
}

function detectSupplier(lines: string[]) {
  const joined = lines.slice(0, 40).join('\n')
  const labelled = firstMatch(joined, [
    /supplier\s*(?:name)?\s*[:\-]\s*([^\n]+)/i,
    /vendor\s*(?:name)?\s*[:\-]\s*([^\n]+)/i,
    /bill\s+from\s*[:\-]\s*([^\n]+)/i,
  ])
  if (labelled) return labelled

  const vendorIdx = lines.findIndex(l => /supplier|vendor|seller/i.test(l))
  if (vendorIdx >= 0) {
    const next = lines.slice(vendorIdx + 1, vendorIdx + 4).find(l =>
      l.length > 3 && !/address|gst|phone|email|date|po\b/i.test(l),
    )
    if (next) return cleanSupplierName(next)
  }
  return null
}

function nextNonEmptyIndex(lines: string[], start: number, end: number) {
  for (let i = start; i < end; i++) {
    if (lines[i]?.trim()) return i
  }
  return -1
}

function isIntegerLine(value: string | undefined) {
  return /^\d+$/.test(value?.trim() || '')
}

function isUnitLine(value: string | undefined) {
  return /^(nos?|no\.?|set|sets|pcs?|piece|pieces|mtr|meter|metre|kg|ltr|lot)$/i.test(value?.trim() || '')
}

function cleanDescription(lines: string[]) {
  const cleaned: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (/^hsn\s+code\s*:?$/i.test(line)) {
      i += 1
      continue
    }
    cleaned.push(line)
  }
  return cleaned.join(' ').replace(/\s+/g, ' ').trim()
}

function parseBepColumnTable(lines: string[]): ParsedPOLine[] {
  const headerStart = lines.findIndex((line, index) =>
    /^sl$/i.test(line) &&
    /^item code$/i.test(lines[index + 1] || '') &&
    /^item description$/i.test(lines[index + 2] || ''),
  )
  if (headerStart < 0) return []

  const tableStart = headerStart + 8
  const tableEnd = lines.findIndex((line, index) =>
    index > tableStart && /^tax description$/i.test(line),
  )
  const end = tableEnd > tableStart ? tableEnd : lines.length
  const parsed: ParsedPOLine[] = []
  let cursor = tableStart

  while (cursor < end) {
    if (!isIntegerLine(lines[cursor])) {
      cursor += 1
      continue
    }

    const lineNo = Number(lines[cursor])
    const codeIndex = nextNonEmptyIndex(lines, cursor + 1, end)
    if (codeIndex < 0) break
    const itemCode = lines[codeIndex]
    let qtyIndex = -1
    let unitIndex = -1
    let priceIndex = -1
    let discountIndex = -1
    let amountIndex = -1
    let discountPercent: number | null = null

    for (let i = codeIndex + 1; i < end; i++) {
      const qty = parseNumber(lines[i])
      if (qty == null) continue
      const maybeUnit = nextNonEmptyIndex(lines, i + 1, end)
      if (maybeUnit < 0 || !isUnitLine(lines[maybeUnit])) continue
      const maybePrice = nextNonEmptyIndex(lines, maybeUnit + 1, end)
      const discountAndAmount = maybePrice > 0
        ? resolveBepDiscountAndAmount(lines, maybePrice, end)
        : null
      if (
        maybePrice > 0 &&
        discountAndAmount &&
        parseNumber(lines[maybePrice]) != null &&
        parseNumber(lines[discountAndAmount.amountIndex]) != null
      ) {
        qtyIndex = i
        unitIndex = maybeUnit
        priceIndex = maybePrice
        discountIndex = discountAndAmount.discountIndex
        amountIndex = discountAndAmount.amountIndex
        discountPercent = discountAndAmount.discountPercent
        break
      }
    }

    if (qtyIndex < 0) {
      cursor = codeIndex + 1
      continue
    }

    const description = cleanDescription(lines.slice(codeIndex + 1, qtyIndex))
    parsed.push(reconcileLineAgainstAmount({
      line_no: lineNo,
      item_code: itemCode,
      description: description || itemCode,
      quantity: parseNumber(lines[qtyIndex]),
      unit_price: parseNumber(lines[priceIndex]),
      discount_percent: discountPercent,
      total_amount: parseNumber(lines[amountIndex]),
      raw_line: lines.slice(cursor, amountIndex + 1).join(' | '),
    }))

    cursor = amountIndex + 1
    if (unitIndex < 0) cursor += 1
  }

  return parsed
}

function parseBepVisualTable(lines: string[]): ParsedPOLine[] {
  const headerStart = lines.findIndex((line, index) => {
    const windowText = lines.slice(index, index + 4).join(' ')
    return /\bSL\b/i.test(windowText) &&
      /\bITEM CODE\b/i.test(windowText) &&
      /\bITEM DESCRIPTION\b/i.test(windowText) &&
      /\bUNIT PRICE\b/i.test(windowText) &&
      /\bAMOUNT\b/i.test(windowText)
  })
  if (headerStart < 0) return []

  const tableEnd = lines.findIndex((line, index) =>
    index > headerStart && /^tax description\b/i.test(line),
  )
  const rows = lines.slice(headerStart + 1, tableEnd > headerStart ? tableEnd : lines.length)
  const parsed: ParsedPOLine[] = []
  const rowChunks: string[] = []
  let current = ''

  for (const raw of rows) {
    const line = raw.trim()
    if (!line || /\b(SL|ITEM CODE|ITEM DESCRIPTION|UNIT PRICE|AMOUNT)\b/i.test(line)) continue
    if (/^\d+\s+\d{6,}\b/.test(line)) {
      if (current) rowChunks.push(current)
      current = line
    } else if (current) {
      current += ' ' + line
    }
  }
  if (current) rowChunks.push(current)

  for (const raw of rowChunks) {
    const line = raw.replace(/\s+/g, ' ').trim()
    const match = line.match(
      /^(\d+)\s+(\d{6,})\s+(.+?)\s+([\d,]+(?:\.\d+)?)\s+(NOS?|NO\.?|SET|SETS|PCS?|PIECES?|MTR|METER|METRE|KG|LTR|LOT)\s+([\d,]+(?:\.\d+)?)\s+(.+?)\s+([\d,]+(?:\.\d+)?)$/i,
    )
    if (!match) continue

    const discountText = match[7]
    const discountAtRate = discountText.match(/@\s*([\d,]+(?:\.\d+)?)\s*%?/i)?.[1]
    const discountPercent = discountAtRate
      ? parseDiscountPercent(discountAtRate)
      : /%/.test(discountText)
        ? parseDiscountPercent(discountText)
        : null

    parsed.push(reconcileLineAgainstAmount({
      line_no: Number(match[1]),
      item_code: match[2],
      description: cleanDescription([match[3]]),
      quantity: parseNumber(match[4]),
      unit_price: parseNumber(match[6]),
      discount_percent: discountPercent,
      total_amount: parseNumber(match[8]),
      raw_line: line,
    }))
  }

  return parsed
}

function parseLine(raw: string, index: number): ParsedPOLine | null {
  const line = raw.trim()
  if (line.length < 8) return null
  if (!/^\d+\s+\d{6,}\s+/.test(line)) return null
  if (/^(subtotal|total|grand total|cgst|sgst|igst|tax|terms|amount in words)\b/i.test(line)) return null
  if (/\b(description|quantity|unit price|rate|amount|item code)\b/i.test(line)) return null

  const nums = [...line.matchAll(/(?<![A-Za-z])[-+]?\d[\d,]*(?:\.\d+)?%?/g)]
  const numeric = nums
    .map(m => ({ text: m[0], index: m.index ?? 0, value: parseNumber(m[0]), isPercent: /%$/.test(m[0]) }))
    .filter(n => n.value !== null)

  if (numeric.length < 2) return null

  const total = numeric[numeric.length - 1]
  const unit = numeric[numeric.length - 2]
  const qty = numeric.length >= 3 ? numeric[numeric.length - 3] : null
  const discount = numeric.find(n => n.isPercent || /disc/i.test(line.slice(Math.max(0, n.index - 8), n.index + 12)))

  const beforeNumbers = line.slice(0, Math.min(qty?.index ?? unit.index, unit.index)).trim()
  const codeMatch = beforeNumbers.match(/\b([A-Z]{0,4}\d{4,}[A-Z0-9/-]*|[A-Z]{2,}[-/][A-Z0-9-]{3,})\b/i)
  const itemCode = codeMatch?.[1] || null
  const description = (itemCode ? beforeNumbers.replace(itemCode, '') : beforeNumbers)
    .replace(/^\d+\s*[).:-]?\s*/, '')
    .trim()

  if (!description && !itemCode) return null

  return reconcileLineAgainstAmount({
    line_no: index + 1,
    item_code: itemCode,
    description: description || itemCode || '',
    quantity: qty?.value ?? null,
    unit_price: unit.value,
    discount_percent: discount?.value != null && discount.value >= 0 && discount.value <= 100 ? discount.value : null,
    total_amount: total.value,
    raw_line: line,
  })
}

export function parsePurchaseOrderText(args: {
  fileName: string
  fileSize: number
  mimeType?: string
  pageCount?: number
  text: string
}): ParsedPODocument {
  const rawText = cleanText(args.text || '')
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const warnings: string[] = []
  const filenameMeta = metadataFromFilename(args.fileName)

  if (!rawText) {
    return {
      file_name: args.fileName,
      file_size: args.fileSize,
      mime_type: args.mimeType,
      page_count: args.pageCount,
      po_number: null,
      supplier_name: null,
      po_date: null,
      currency: 'INR',
      basic_amount: null,
      subtotal: null,
      total_amount: null,
      parse_status: 'needs_ocr',
      parse_warnings: ['No text could be extracted. This file may need OCR.'],
      raw_text: '',
      lines: [],
    }
  }

  const poNumber = detectPONumber(rawText, lines, args.fileName)
  const poDate = detectPODate(rawText, lines, args.fileName)
  const totalRaw = firstMatch(rawText, [
    /\bgrand\s+total\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    /\btotal\s+amount\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    /\bnet\s+amount\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
  ])
  const basicRaw = firstMatch(rawText, [
    /\bbasic\s+amount\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    /\bbasic\s+value\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    /\bbasic\s+total\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
  ])
  const subtotalRaw = firstMatch(rawText, [
    /\bsubtotal\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    /\btaxable\s+value\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
  ])

  const parsedBasicAmount = parseNumber(basicRaw)
  const visualLines = parseBepVisualTable(lines)
  const columnLines = parseBepColumnTable(lines)
  const genericLines = lines
    .map((line, i) => parseLine(line, i))
    .filter((line): line is ParsedPOLine => Boolean(line))
  const rawParsedLines = chooseBestParsedLines([visualLines, columnLines, genericLines], parsedBasicAmount)
  const parsedLines = pickLinesMatchingBasicAmount(rawParsedLines, parsedBasicAmount)

  if (!poNumber) warnings.push('PO number was not detected.')
  if (!poDate) warnings.push('PO date was not detected.')
  const supplierName = cleanSupplierName(detectSupplier(lines)) || cleanSupplierName(filenameMeta.supplier)
  if (!supplierName) warnings.push('Supplier name was not detected.')
  if (parsedLines.length === 0) warnings.push('No line items were detected from the extracted text.')
  if (parsedLines.length < rawParsedLines.length) {
    warnings.push(`Removed ${rawParsedLines.length - parsedLines.length} stray line item(s) that did not reconcile to PDF Basic Amount.`)
  }

  return {
    file_name: args.fileName,
    file_size: args.fileSize,
    mime_type: args.mimeType,
    page_count: args.pageCount,
    po_number: poNumber,
    supplier_name: supplierName,
    po_date: poDate,
    currency: detectCurrency(rawText),
    basic_amount: parsedBasicAmount,
    subtotal: parseNumber(subtotalRaw),
    total_amount: parseNumber(totalRaw),
    parse_status: warnings.length ? 'needs_review' : 'parsed',
    parse_warnings: warnings,
    raw_text: rawText,
    lines: parsedLines,
  }
}
