import { describe, expect, it } from 'vitest'
import { hasDefensiblePOProjectEvidence } from '@/lib/po-ingestion-project-routing'

describe('PO ingestion project routing', () => {
  it('does not infer the whole PO project from one matching line', () => {
    expect(hasDefensiblePOProjectEvidence(
      [{ evidence: ['Existing BOM mapping for PO item 9102853'] }],
      [
        { candidates: [{ project_id: 9 }] },
        { candidates: [] },
        { candidates: [] },
        { candidates: [] },
        { candidates: [] },
      ],
    )).toBe(false)
  })

  it('accepts explicit document evidence', () => {
    expect(hasDefensiblePOProjectEvidence(
      [{ evidence: ['PO text contains project number 70022'] }],
      [{ candidates: [] }],
    )).toBe(true)
  })

  it('accepts BOM evidence only when every line resolves to one project', () => {
    expect(hasDefensiblePOProjectEvidence(
      [{ evidence: ['Existing BOM mapping for PO item 1'] }],
      [
        { candidates: [{ project_id: 13 }] },
        { candidates: [{ project_id: 13 }, { project_id: 13 }] },
      ],
    )).toBe(true)
  })
})
