import { describe, expect, it } from 'vitest'
import { canDeletePurchaseOrder } from '@/lib/po-delete-permissions'

describe('purchase order deletion permission', () => {
  it('allows only abey.thomas@bepindia.com', () => {
    expect(canDeletePurchaseOrder('abey.thomas@bepindia.com')).toBe(true)
    expect(canDeletePurchaseOrder('ABEY.THOMAS@BEPINDIA.COM')).toBe(true)
    expect(canDeletePurchaseOrder('other@bepindia.com')).toBe(false)
    expect(canDeletePurchaseOrder(null)).toBe(false)
  })
})
