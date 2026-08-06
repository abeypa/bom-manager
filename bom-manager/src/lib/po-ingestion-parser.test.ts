import { describe, expect, it } from 'vitest'
import { parsePurchaseOrderAttachment } from '@/lib/po-ingestion-parser'

describe('PO ingestion attachment parsing', () => {
  it('passes PDF attachment metadata and text to the PO parser', () => {
    const parsed = parsePurchaseOrderAttachment({
      name: 'DHUPAR BROTHERS TRADING PVT LTD_POP26-27100139_27072026.pdf',
      size: 42_000,
      type: 'application/pdf',
      pageCount: 2,
      text: [
        'Purchase Order No: PO/P/26-27/100139',
        'Date: 27/07/2026',
        'DHUPAR BROTHERS TRADING PVT LTD',
        '1 9101654 SZ FOLD AWAY KEYBOARD 1 30,551.00 15% 25,968.35',
      ].join('\n'),
    })

    expect(parsed.file_name).toBe('DHUPAR BROTHERS TRADING PVT LTD_POP26-27100139_27072026.pdf')
    expect(parsed.file_size).toBe(42_000)
    expect(parsed.page_count).toBe(2)
    expect(parsed.po_number).toBe('PO/P/26-27/100139')
    expect(parsed.raw_text).toContain('PO/P/26-27/100139')
  })

  it('returns a reviewable result instead of throwing for missing optional attachment fields', () => {
    expect(() => parsePurchaseOrderAttachment({ text: undefined })).not.toThrow()
    expect(parsePurchaseOrderAttachment({ text: undefined }).parse_status).toBe('needs_ocr')
  })

  it('reconstructs a split document number instead of returning a truncated fragment', () => {
    const parsed = parsePurchaseOrderAttachment({
      name: 'Dimension_Engineering_POP26-27100094_20062026.pdf',
      type: 'application/pdf',
      pageCount: 1,
      text: [
        'BEP INDIA AUTOMOTIVE SYSTEMS',
        'DOCUMENT DETAILS (Page No : 1/1)',
        'Document No : PO/P/26',
        '-27/100094 (Released)',
        'Date : 20/06/2026',
        'SUPPLIER',
        'Dimension Engineering',
        '1 9102044 Gantry page 8 to page 21 1.00 NOS 187746.65 8.00% 172726.84',
      ].join('\n'),
    })

    expect(parsed.po_number).toBe('PO/P/26-27/100094')
  })
})
