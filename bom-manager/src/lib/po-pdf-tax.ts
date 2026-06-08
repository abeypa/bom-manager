import { getSignedUrl } from '@/api/storage'
import { urlToPDFAttachment } from '@/lib/ai-attachments'
import { parsePurchaseOrderText } from '@/lib/po-ingestion-parser'

export async function resolvePurchaseOrderPdfUrl(stored: string) {
  if (!stored) return ''
  if (!stored.startsWith('http')) return await getSignedUrl(stored, 3600) || stored
  if (stored.includes('/storage/v1/object/sign/drawings/')) {
    const match = stored.match(/\/drawings\/(.+?)(?:\?|$)/)
    if (match) return await getSignedUrl(match[1], 3600) || stored
  }
  return stored
}

export async function extractPurchaseOrderPdfTaxAmount(stored: string, poNumber?: string) {
  const pdfUrl = await resolvePurchaseOrderPdfUrl(stored)
  if (!pdfUrl) return null

  const pdf = await urlToPDFAttachment(pdfUrl, `${poNumber || 'purchase-order'}.pdf`)
  const parsed = parsePurchaseOrderText({
    fileName: pdf.name,
    fileSize: pdf.size,
    mimeType: 'application/pdf',
    pageCount: pdf.pageCount,
    text: pdf.text,
  })

  return parsed.tax_amount ?? null
}
