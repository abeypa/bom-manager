import { create } from 'zustand'
import type { ORMessage, ORToolCall } from '@/lib/openrouter'

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  /** For assistant messages: any tool calls it requested */
  tool_calls?: ORToolCall[]
  /** For tool messages: which tool_call_id this responds to */
  tool_call_id?: string
  /** Inline HTML report from render_html_report */
  html?: { title: string; html: string }
  ts: number
}

export type PendingStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'

export interface PendingAction {
  id: string
  tool_call_id: string
  tool_name: string
  args: any
  summary: string
  status: PendingStatus
  result?: any
  error?: string
  ts: number
}

interface AIStore {
  open: boolean
  messages: ChatMessage[]
  pending: PendingAction[]
  busy: boolean

  setOpen: (open: boolean) => void
  pushMessage: (m: ChatMessage) => void
  setMessages: (m: ChatMessage[]) => void
  addPending: (p: PendingAction) => void
  updatePending: (id: string, patch: Partial<PendingAction>) => void
  setBusy: (b: boolean) => void
  reset: () => void
  /** Convert chat history into OpenRouter wire format */
  asWireMessages: () => ORMessage[]
}

export const useAIStore = create<AIStore>((set, get) => ({
  open: false,
  messages: [],
  pending: [],
  busy: false,

  setOpen: (open) => set({ open }),
  pushMessage: (m) => set(s => ({ messages: [...s.messages, m] })),
  setMessages: (m) => set({ messages: m }),
  addPending: (p) => set(s => ({ pending: [...s.pending, p] })),
  updatePending: (id, patch) =>
    set(s => ({ pending: s.pending.map(p => (p.id === id ? { ...p, ...patch } : p)) })),
  setBusy: (b) => set({ busy: b }),
  reset: () => set({ messages: [], pending: [] }),

  asWireMessages: () => {
    const out: ORMessage[] = []
    for (const m of get().messages) {
      if (m.role === 'system' || m.role === 'user') {
        out.push({ role: m.role, content: m.content })
      } else if (m.role === 'assistant') {
        out.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.tool_calls,
        })
      } else if (m.role === 'tool') {
        out.push({
          role: 'tool',
          tool_call_id: m.tool_call_id || '',
          content: m.content,
        })
      }
    }
    return out
  },
}))
