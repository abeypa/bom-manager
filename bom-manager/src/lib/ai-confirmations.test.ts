import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/store/useAIStore'
import { getConfirmedPartTypes, getConfirmedProjectIds } from '@/lib/ai-confirmations'

let nextId = 0
const message = (role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `message-${++nextId}`,
  role,
  content,
  ts: Date.now(),
  ...extra,
})

describe('AI workflow confirmations', () => {
  it('accepts a part table only after the AI asks during PO ingestion', () => {
    const messages = [
      message('user', 'Ingest this PO', {
        attachments: [{
          kind: 'pdf',
          name: 'po.pdf',
          size: 100,
          pageCount: 1,
          text: 'PO',
          truncated: false,
        }],
      }),
      message('assistant', 'Which part master table should the new parts be added to?'),
      message('user', 'Part type: Electrical Bought Out (electrical_bought_out)'),
    ]

    expect(getConfirmedPartTypes(messages)).toEqual(new Set(['electrical_bought_out']))
  })

  it('does not treat the AI selecting a table as user confirmation', () => {
    const messages = [
      message('user', 'Ingest this PO', {
        attachments: [{
          kind: 'pdf',
          name: 'po.pdf',
          size: 100,
          pageCount: 1,
          text: 'PO',
          truncated: false,
        }],
      }),
      message('assistant', 'I selected electrical_bought_out based on the description.'),
    ]

    expect(getConfirmedPartTypes(messages).size).toBe(0)
  })

  it('accepts only project ids selected after a project question', () => {
    const messages = [
      message('assistant', 'Which project should I add these parts to?'),
      message('user', 'Use project: Line Upgrade (70020), id 42'),
    ]

    expect(getConfirmedProjectIds(messages)).toEqual(new Set([42]))
  })

  it('does not accept a project id suggested only by the assistant', () => {
    const messages = [
      message('assistant', 'I suggest project id 42.'),
      message('user', 'Continue.'),
    ]

    expect(getConfirmedProjectIds(messages).size).toBe(0)
  })
})
