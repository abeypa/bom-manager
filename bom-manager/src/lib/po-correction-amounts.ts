function closeEnough(left: number, right: number, tolerance: number) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= tolerance
}

export function parsedMatchesOriginalPOCurrency(po: any, parsed: any) {
  const parsedCurrency = String(parsed?.currency || 'INR').trim().toUpperCase()
  const currentCurrency = String(po?.currency || 'INR').trim().toUpperCase()
  const originalCurrency = String(po?.original_currency || '').trim().toUpperCase()
  return Boolean(originalCurrency && parsedCurrency === originalCurrency && currentCurrency !== parsedCurrency)
}

export function comparablePoHeaderTotal(po: any, parsed: any) {
  if (parsedMatchesOriginalPOCurrency(po, parsed)) {
    return Number(po.original_grand_total ?? po.grand_total ?? 0)
  }
  return Number(po.grand_total || 0)
}

export function isPoCorrectionAmountOk(po: any, parsed: any, newGrand: number) {
  const pdfBasic = Number(parsed?.basic_amount || 0)
  const dbComparableTotal = comparablePoHeaderTotal(po, parsed)
  const pdfMatches =
    pdfBasic > 0 &&
    closeEnough(newGrand, pdfBasic, Math.max(5, pdfBasic * 0.02))
  const allowComparableFallback = parsedMatchesOriginalPOCurrency(po, parsed)
  const dbMatches =
    dbComparableTotal > 0 &&
    closeEnough(newGrand, dbComparableTotal, Math.max(5, dbComparableTotal * 0.02))

  if (pdfBasic > 0) return pdfMatches || (allowComparableFallback && dbMatches)
  return dbMatches
}

export function poCorrectionAmountMismatchMessage(po: any, parsed: any, newGrand: number) {
  const pdfBasic = Number(parsed?.basic_amount || 0)
  const dbComparableTotal = comparablePoHeaderTotal(po, parsed)
  if (parsedMatchesOriginalPOCurrency(po, parsed)) {
    return `Correction blocked: parsed line total ${newGrand.toFixed(2)} does not match PDF Basic Amount ${pdfBasic.toFixed(2)} or comparable DB total ${dbComparableTotal.toFixed(2)}.`
  }
  return `Correction blocked: parsed line total ${newGrand.toFixed(2)} does not match PDF Basic Amount ${pdfBasic.toFixed(2)}.`
}
