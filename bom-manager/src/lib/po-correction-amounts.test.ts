import { describe, expect, it } from 'vitest'

import {
  comparablePoHeaderTotal,
  isPoCorrectionAmountOk,
  parsedMatchesOriginalPOCurrency,
  poCorrectionAmountMismatchMessage,
} from '@/lib/po-correction-amounts'

describe('PO correction amount safeguards', () => {
  it('does not accept current DB totals as a fallback for normal non-converted POs', () => {
    const po = {
      currency: 'INR',
      grand_total: 41051.25,
    }
    const parsed = {
      currency: 'INR',
      basic_amount: 46951.5,
    }

    expect(parsedMatchesOriginalPOCurrency(po, parsed)).toBe(false)
    expect(comparablePoHeaderTotal(po, parsed)).toBe(41051.25)
    expect(isPoCorrectionAmountOk(po, parsed, 41051.25)).toBe(false)
    expect(poCorrectionAmountMismatchMessage(po, parsed, 41051.25)).toContain('does not match PDF Basic Amount 46951.50')
    expect(poCorrectionAmountMismatchMessage(po, parsed, 41051.25)).not.toContain('comparable DB total')
  })

  it('allows original-currency fallback for converted POs', () => {
    const po = {
      currency: 'INR',
      original_currency: 'USD',
      grand_total: 8500,
      original_grand_total: 100,
    }
    const parsed = {
      currency: 'USD',
      basic_amount: 95,
    }

    expect(parsedMatchesOriginalPOCurrency(po, parsed)).toBe(true)
    expect(comparablePoHeaderTotal(po, parsed)).toBe(100)
    expect(isPoCorrectionAmountOk(po, parsed, 100)).toBe(true)
    expect(poCorrectionAmountMismatchMessage(po, parsed, 90)).toContain('comparable DB total 100.00')
  })

  it('accepts a direct PDF basic-amount match for ordinary POs', () => {
    const po = {
      currency: 'INR',
      grand_total: 41051.25,
    }
    const parsed = {
      currency: 'INR',
      basic_amount: 46951.5,
    }

    expect(isPoCorrectionAmountOk(po, parsed, 46951.5)).toBe(true)
  })
})
