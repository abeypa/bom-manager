/**
 * Browser-side OpenRouter client settings.
 *
 * Security model:
 * - The real OpenRouter API key never reaches the browser after save.
 * - Admins can submit or rotate the key from AI Settings through the Worker.
 * - The Worker stores the key encrypted and only returns configured/not-configured status.
 * - The browser calls the Worker proxy for chat completions.
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

export interface AISettings {
  model: string
}

export interface AIProxyConfigStatus {
  configured: boolean
  source: 'app_settings' | 'worker_secret' | 'none'
}

const API_URL = '/api/openrouter/chat'
const CONFIG_URL = '/api/openrouter/config'
const DIRECT_WORKER_URL = 'http://127.0.0.1:8787'
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

function isLocalDev() {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function workerEndpoints(path: string) {
  const endpoints = [path]
  if (isLocalDev()) endpoints.push(`${DIRECT_WORKER_URL}${path}`)
  return endpoints
}

async function workerFetch(
  path: string,
  init: RequestInit,
  fallback405Message?: string,
): Promise<Response> {
  const endpoints = workerEndpoints(path)
  let lastStatus: number | null = null
  let lastBody = ''

  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, init)
    if (res.ok) return res

    lastStatus = res.status
    lastBody = await res.text()

    if (isLocalDev() && endpoint === path && res.status === 405) continue

    if (res.status === 405 && fallback405Message) {
      throw new Error(fallback405Message)
    }
    throw new Error(`AI proxy ${res.status}: ${lastBody}`)
  }

  if (lastStatus === 405 && fallback405Message) {
    throw new Error(fallback405Message)
  }
  throw new Error(`AI proxy ${lastStatus ?? 'error'}: ${lastBody}`)
}

async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('You must be logged in to manage AI settings.')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

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

export async function saveSettingsToDB(s: AISettings): Promise<void> {
  await (supabase as any).from('app_settings').upsert([
    { key: 'ai_model', value: s.model, updated_at: new Date().toISOString() },
  ])
}

export async function getAIProxyConfigStatus(): Promise<AIProxyConfigStatus> {
  const headers = await getAuthHeaders()
  const res = await workerFetch(
    CONFIG_URL,
    { method: 'GET', headers },
    'AI proxy 405: the secure OpenRouter config endpoint is not available on this host. In local development, run both `npm run dev` and `npm run dev:worker`.',
  )
  return (await res.json()) as AIProxyConfigStatus
}

export async function saveAIProxyApiKey(apiKey: string): Promise<AIProxyConfigStatus> {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('API key is required.')
  const headers = await getAuthHeaders()
  const res = await workerFetch(
    CONFIG_URL,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ apiKey: trimmed }),
    },
    'AI proxy 405: the secure OpenRouter config endpoint is not available on this host. In local development, run both `npm run dev` and `npm run dev:worker`.',
  )
  return (await res.json()) as AIProxyConfigStatus
}

export async function clearAIProxyApiKey(): Promise<AIProxyConfigStatus> {
  const headers = await getAuthHeaders()
  const res = await workerFetch(
    CONFIG_URL,
    {
      method: 'DELETE',
      headers,
    },
    'AI proxy 405: the secure OpenRouter config endpoint is not available on this host. In local development, run both `npm run dev` and `npm run dev:worker`.',
  )
  return (await res.json()) as AIProxyConfigStatus
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

  if (!model) throw new Error('AI not configured - ask your admin to set the model in AI Settings.')

  const payload = JSON.stringify({
    model,
    messages: opts.messages,
    tools: opts.tools,
    tool_choice: opts.toolChoice || 'auto',
    temperature: 0.2,
  })

  const res = await workerFetch(
    API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
      signal: opts.signal,
    },
    'AI proxy 405: the secure OpenRouter proxy is not available on this host. In local development, run both `npm run dev` and `npm run dev:worker` so /api/openrouter/chat is served by the Worker.',
  )

  return (await res.json()) as ORCompletionResponse
}
