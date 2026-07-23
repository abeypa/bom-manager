import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingAction } from '@/store/useAIStore'

const handler = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({
  messages: [] as any[],
  pending: [] as any[],
  busy: false,
  pushMessage(message: any) {
    this.messages.push(message)
  },
  updatePending(id: string, patch: any) {
    this.pending = this.pending.map(action => action.id === id ? { ...action, ...patch } : action)
  },
  setBusy(value: boolean) {
    this.busy = value
  },
}))

vi.mock('@/lib/openrouter', () => ({
  chatCompletion: vi.fn(),
}))
vi.mock('@/lib/ai-tools', () => ({
  TOOL_REGISTRY: [{ name: 'write_test', kind: 'write', description: '', parameters: {}, handler }],
  findTool: (name: string) => name === 'write_test'
    ? { name: 'write_test', kind: 'write', handler }
    : undefined,
  toOpenAITools: () => [],
  sanitizeHTML: (html: string) => html,
}))
vi.mock('@/store/useAIStore', () => ({
  useAIStore: { getState: () => state },
}))

import {
  approvePending,
  parseToolArguments,
  serializeToolPayload,
} from '@/lib/ai-runner'

beforeEach(() => {
  handler.mockReset()
  state.messages = []
  state.pending = []
  state.busy = false
})

describe('AI runner safety helpers', () => {
  it('rejects malformed or non-object tool arguments', () => {
    expect(() => parseToolArguments('{bad json')).toThrow('Invalid tool arguments')
    expect(() => parseToolArguments('[]')).toThrow('JSON object')
  })

  it('keeps truncated tool results valid JSON', () => {
    const serialized = serializeToolPayload({ ok: true, result: 'x'.repeat(1_000) }, 300)
    const parsed = JSON.parse(serialized)

    expect(serialized.length).toBeLessThanOrEqual(300)
    expect(parsed.truncated).toBe(true)
    expect(parsed.result_prefix).toContain('"result"')
  })

  it('executes a pending write at most once', async () => {
    let release!: () => void
    handler.mockImplementation(() => new Promise<void>(resolve => { release = resolve }))
    const pending: PendingAction = {
      id: 'pending-1',
      tool_call_id: 'call-1',
      tool_name: 'write_test',
      args: { quantity: 1 },
      summary: 'test write',
      status: 'pending',
      ts: 1,
    }
    state.pending = [pending]
    state.messages = [{
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'call-1', type: 'function', function: { name: 'write_test', arguments: '{}' } },
        { id: 'call-2', type: 'function', function: { name: 'write_test', arguments: '{}' } },
      ],
    }]

    const first = approvePending(pending)
    const duplicate = approvePending(pending)
    release()
    await Promise.all([first, duplicate])

    expect(handler).toHaveBeenCalledTimes(1)
    expect(state.pending[0].status).toBe('executed')
  })
})
