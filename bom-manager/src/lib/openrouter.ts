/**
 * Browser-side OpenRouter client settings.
 *
 * Security model:
 * - The real OpenRouter API key never reaches the browser.
 * - The browser calls the local Worker proxy at /api/openrouter/chat.
 * - Only the selected model is stored in app_settings/localStorage.
 */
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

const API_URL = '/api/openrouter/chat'
const STORAGE_KEY = 'bom-ai:openrouter'

export interface AISettings {
  model: string
}

export const DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet'

export const RECOMMENDED_MODELS = [
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (recommended) · vision', vision: true },
  { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku (fast/cheap) · vision', vision: true },
  { id: 'openai/gpt-4o', label: 'GPT-4o · vision', vision: true },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini · vision', vision: true },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash · vision', vision: true },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (text only)', vision: false },
]

export function modelSupportsVision(modelId: string): boolean {
  const m = RECOMMENDED_MODELS.find((x) => x.id === modelId)
  if (m) return m.vision
  return true
}

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { model: DEFAULT_MODEL }
    const parsed = JSON.parse(raw)
    return { model: parsed.model || DEFAULT_MODEL }
  } catch {
    return { model: DEFAULT_MODEL }
  }
}

export function saveSettings(s: AISettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ model: s.model || DEFAULT_MODEL }))
}

export function isConfigured(): boolean {
  return !!loadSettings().model
}

/** Load AI settings from Supabase app_settings (async, used on app mount). */
export async function loadSettingsFromDB(): Promise<AISettings | null> {
  try {
    const { data, error } = await (supabase as any)
      .from('app_settings')
      .select('key, value')
      .eq('key', 'ai_model')
      .maybeSingle()
    if (error) return null
    return { model: data?.value || DEFAULT_MODEL }
  } catch {
    return null
  }
}

/** Persist AI settings to Supabase app_settings (admin only, RLS enforced). */
export async function saveSettingsToDB(s: AISettings): Promise<void> {
  await (supabase as any).from('app_settings').upsert([
    { key: 'ai_model', value: s.model, updated_at: new Date().toISOString() },
  ])
}

export async function chatCompletion(opts: {
  messages: ORMessage[]
  tools: ORTool[]
  toolChoice?: 'auto' | 'none' | 'required'
  signal?: AbortSignal
}): Promise<ORCompletionResponse> {
  let { model } = loadSettings()

  if (!model) {
    const dbSettings = await loadSettingsFromDB()
    if (dbSettings?.model) {
      saveSettings(dbSettings)
      model = dbSettings.model
    }
  }

  if (!model) throw new Error('AI not configured — ask your admin to set the model in AI Settings.')

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
    throw new Error(`AI proxy ${res.status}: ${text}`)
  }
  return (await res.json()) as ORCompletionResponse
}
