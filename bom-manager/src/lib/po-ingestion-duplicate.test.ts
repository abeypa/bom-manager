import { describe, expect, it } from 'vitest'
import { compareAttachedPOWithDatabasePO } from '@/lib/po-ingestion-duplicate'

const parsedPO = {
  po_number: 'PO/P/25-26/100255',
  supplier_name: 'Example Controls Pvt Ltd',
  po_date: '2026-07-20',
  currency: 'INR',
  basic_amount: 1800,
  lines: [
    {
      item_code: '9101001',
      description: 'Control relay',
      quantity: 2,
      unit_price: 500,
      discount_percent: 10,
      total_amount: 900,
    },
    {
      item_code: '9101002',
      description: 'Terminal block',
      quantity: 3,
      unit_price: 300,
      discount_percent: 0,
      total_amount: 900,
    },
  ],
}

const databasePO = {
  id: 42,
  po_number: 'PO/P/25-26/100255',
  status: 'Draft',
  project_id: 7,
  po_date: '2026-07-20',
  currency: 'INR',
  grand_total: 1800,
  suppliers: { name: 'Example Controls Pvt Ltd' },
  purchase_order_items: [
    {
      id: 1,
      part_number: 'EBO-9101001',
      description: 'Control relay',
      quantity: 2,
      unit_price: 500,
      discount_percent: 10,
      total_amount: 900,
    },
    {
      id: 2,
      part_number: 'EBO-9101002',
      description: 'Terminal block',
      quantity: 3,
      unit_price: 300,
      discount_percent: 0,
      total_amount: 900,
    },
  ],
}

describe('PO ingestion duplicate comparison', () => {
  it('recognizes a fully matching existing PO', () => {
    const result = compareAttachedPOWithDatabasePO(parsedPO, databasePO)

    expect(result.exact_po_number).toBe(true)
    expect(result.likely_duplicate).toBe(true)
    expect(result.data_matches).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('detects matching content saved under a different PO number', () => {
    const result = compareAttachedPOWithDatabasePO(parsedPO, {
      ...databasePO,
      po_number: 'CPO-12345678',
    })

    expect(result.exact_po_number).toBe(false)
    expect(result.likely_duplicate).toBe(true)
    expect(result.line_coverage).toBe(1)
    expect(result.line_value_coverage).toBe(1)
  })

  it('reports line-data mismatches on an existing PO', () => {
    const result = compareAttachedPOWithDatabasePO(parsedPO, {
      ...databasePO,
      purchase_order_items: databasePO.purchase_order_items.map((item, index) =>
        index === 0 ? { ...item, quantity: 99 } : item,
      ),
    })

    expect(result.data_matches).toBe(false)
    expect(result.issues).toContainEqual({
      field: 'quantity:9101001',
      expected: 2,
      actual: 99,
    })
  })
})
