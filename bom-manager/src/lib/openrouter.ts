/**
 * Minimal OpenRouter chat-completions client with tool calling.
 * Docs: https://openrouter.ai/docs
 *
 * The user supplies their own API key via Settings; the key is stored in
 * localStorage and sent only to https://openrouter.ai/api/v1.
 */

export interface ORMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_calls?: ORToolCall[]
  tool_call_id?: string
}

export interface ORToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ORTool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, any> }
}

export interface ORCompletionResponse {
  id: string
  model: string
  choices: Array<{
    finish_reason: string
    message: {
      role: 'assistant'
      content: string | null
      tool_calls?: ORToolCall[]
    }
  }>
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

const API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const STORAGE_KEY = 'bom-ai:openrouter'

export interface AISettings {
  apiKey: string
  model: string
}

export const DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet'

export const RECOMMENDED_MODELS = [
  { id: 'anthropic/claude-3.5-sonnet',         label: 'Claude 3.5 Sonnet (recommended)' },
  { id: 'anthropic/claude-3.5-haiku',          label: 'Claude 3.5 Haiku (fast/cheap)' },
  { id: 'openai/gpt-4o',                       label: 'GPT-4o' },
  { id: 'openai/gpt-4o-mini',                  label: 'GPT-4o mini' },
  { id: 'google/gemini-2.5-flash',             label: 'Gemini 2.5 Flash' },
  { id: 'meta-llama/llama-3.3-70b-instruct',   label: 'Llama 3.3 70B' },
]

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { apiKey: '', model: DEFAULT_MODEL }
    const parsed = JSON.parse(raw)
    return { apiKey: parsed.apiKey || '', model: parsed.model || DEFAULT_MODEL }
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL }
  }
}

export function saveSettings(s: AISettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

export function isConfigured(): boolean {
  return !!loadSettings().apiKey
}

export async function chatCompletion(opts: {
  messages: ORMessage[]
  tools: ORTool[]
  toolChoice?: 'auto' | 'none' | 'required'
  signal?: AbortSignal
}): Promise<ORCompletionResponse> {
  const { apiKey, model } = loadSettings()
  if (!apiKey) throw new Error('OpenRouter API key not configured')

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'BOM Manager',
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: opts.toolChoice || 'auto',
      temperature: 0.2,
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${text}`)
  }
  return (await res.json()) as ORCompletionResponse
}
