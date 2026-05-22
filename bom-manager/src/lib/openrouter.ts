import { supabase } from './supabase'

export type ORContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }

export interface ORMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ORContentPart[] | null
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

export interface AISettings {
  apiKey: string
  model: string
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const STORAGE_KEY = 'bom-ai:openrouter'

export const DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet'

export const RECOMMENDED_MODELS = [
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (recommended) - vision', vision: true },
  { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku (fast/cheap) - vision', vision: true },
  { id: 'openai/gpt-4o', label: 'GPT-4o - vision', vision: true },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini - vision', vision: true },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash - vision', vision: true },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (text only)', vision: false },
]

export function modelSupportsVision(modelId: string): boolean {
  const model = RECOMMENDED_MODELS.find((entry) => entry.id === modelId)
  if (model) return model.vision
  return true
}

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { apiKey: '', model: DEFAULT_MODEL }
    const parsed = JSON.parse(raw)
    return {
      apiKey: parsed.apiKey || '',
      model: parsed.model || DEFAULT_MODEL,
    }
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL }
  }
}

export function saveSettings(settings: AISettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    apiKey: settings.apiKey || '',
    model: settings.model || DEFAULT_MODEL,
  }))
}

export function isConfigured(): boolean {
  const { apiKey, model } = loadSettings()
  return !!apiKey && !!model
}

export async function loadSettingsFromDB(): Promise<AISettings | null> {
  try {
    const { data, error } = await (supabase as any)
      .from('app_settings')
      .select('key, value')
      .in('key', ['ai_api_key', 'ai_model'])

    if (error) return null

    const rows = Array.isArray(data) ? data : []
    const apiKey = rows.find((row: any) => row.key === 'ai_api_key')?.value || ''
    const model = rows.find((row: any) => row.key === 'ai_model')?.value || DEFAULT_MODEL

    if (!apiKey && !model) return null
    return { apiKey, model }
  } catch {
    return null
  }
}

export async function saveSettingsToDB(settings: AISettings): Promise<void> {
  const payload = [
    { key: 'ai_model', value: settings.model || DEFAULT_MODEL, updated_at: new Date().toISOString() },
  ]

  if (settings.apiKey) {
    payload.push({ key: 'ai_api_key', value: settings.apiKey, updated_at: new Date().toISOString() })
  }

  await (supabase as any).from('app_settings').upsert(payload)
}

export async function chatCompletion(opts: {
  messages: ORMessage[]
  tools: ORTool[]
  toolChoice?: 'auto' | 'none' | 'required'
  signal?: AbortSignal
}): Promise<ORCompletionResponse> {
  let { apiKey, model } = loadSettings()

  if (!apiKey || !model) {
    const dbSettings = await loadSettingsFromDB()
    if (dbSettings?.apiKey) {
      saveSettings(dbSettings)
      apiKey = dbSettings.apiKey
      model = dbSettings.model
    }
  }

  if (!apiKey || !model) {
    throw new Error('AI not configured - set the OpenRouter API key and model in AI Settings.')
  }

  const res = await fetch(OPENROUTER_URL, {
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
    const body = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${body}`)
  }

  return (await res.json()) as ORCompletionResponse
}
