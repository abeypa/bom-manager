/**
 * Browser-side OpenRouter client.
 *
 * The OpenRouter key is held by the Cloudflare Worker and never read back
 * into the browser. The browser sends its Supabase session token to the
 * Worker, which adds the OpenRouter authentication header upstream.
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
  error?: {
    code?: number | string
    message?: string
    metadata?: Record<string, unknown>
  }
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

const CHAT_URL = '/api/openrouter/chat'
const CONFIG_URL = '/api/openrouter/config'
const MODEL_ENDPOINTS_URL = '/api/openrouter/model-endpoints'
const DIRECT_WORKER_URL = 'http://127.0.0.1:8787'
const STORAGE_KEY = 'bom-ai:openrouter'

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5'

export const RECOMMENDED_MODELS = [
  { id: 'inclusionai/ling-3.0-flash:free', label: 'Ling 3.0 Flash (free, text only)', vision: false },
  { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (recommended) - vision', vision: true },
  { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4 - vision', vision: true },
  { id: 'openai/gpt-4o', label: 'GPT-4o - vision', vision: true },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini - vision', vision: true },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash - vision', vision: true },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (text only)', vision: false },
]

function getConfiguredModelId(model: unknown): string {
  const modelId = typeof model === 'string' ? model.trim() : ''
  return modelId || DEFAULT_MODEL
}

function isLocalDev() {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function workerEndpoints(path: string) {
  const endpoints = [path]
  if (isLocalDev()) endpoints.push(`${DIRECT_WORKER_URL}${path}`)
  return endpoints
}

async function getAuthHeaders(includeJson = true) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your session has expired. Sign in again to use AI.')
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  }
}

async function workerFetch(path: string, init: RequestInit): Promise<Response> {
  const endpoints = workerEndpoints(path)
  let lastResponse: Response | null = null

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, init)
    lastResponse = response
    if (!(isLocalDev() && endpoint === path && response.status === 405)) return response
  }

  return lastResponse as Response
}

function unavailableModelMessage(modelId: string) {
  const lingSuggestion = modelId === 'inclusionai/ling-3.0-flash'
    ? ' To use Ling 3.0 Flash, explicitly select "inclusionai/ling-3.0-flash:free" in AI Settings.'
    : ''
  return (
    `The configured model "${modelId}" has no active OpenRouter endpoints.` +
    lingSuggestion +
    ' The app did not change your selected model automatically.'
  )
}

export function modelSupportsVision(modelId: string): boolean {
  const model = RECOMMENDED_MODELS.find((entry) => entry.id === modelId)
  if (model) return model.vision
  return true
}

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { model: DEFAULT_MODEL }
    const parsed = JSON.parse(raw)
    const settings = { model: getConfiguredModelId(parsed.model) }
    // Remove legacy browser-stored API keys left by the old direct-client flow.
    if (parsed.apiKey) saveSettings(settings)
    return settings
  } catch {
    return { model: DEFAULT_MODEL }
  }
}

export function saveSettings(settings: AISettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    model: getConfiguredModelId(settings.model),
  }))
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
    return { model: getConfiguredModelId(data?.value) }
  } catch {
    return null
  }
}

export async function saveSettingsToDB(settings: AISettings): Promise<void> {
  const { error } = await (supabase as any).from('app_settings').upsert([
    { key: 'ai_model', value: getConfiguredModelId(settings.model), updated_at: new Date().toISOString() },
  ])
  if (error) throw error
}

export async function getAIProxyConfigStatus(): Promise<AIProxyConfigStatus> {
  const response = await workerFetch(CONFIG_URL, {
    method: 'GET',
    headers: await getAuthHeaders(false),
  })
  const payload = await readResponsePayload(response)
  if (!response.ok) {
    throw new Error(`AI proxy ${response.status}: ${getOpenRouterError(payload) || 'Failed to read configuration.'}`)
  }
  return payload as AIProxyConfigStatus
}

export async function saveAIProxyApiKey(apiKey: string): Promise<AIProxyConfigStatus> {
  const trimmedKey = apiKey.trim()
  if (!trimmedKey) throw new Error('OpenRouter API key is required.')
  const response = await workerFetch(CONFIG_URL, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ apiKey: trimmedKey }),
  })
  const payload = await readResponsePayload(response)
  if (!response.ok) {
    throw new Error(`AI proxy ${response.status}: ${getOpenRouterError(payload) || 'Failed to save the API key.'}`)
  }
  return payload as AIProxyConfigStatus
}

export async function clearAIProxyApiKey(): Promise<AIProxyConfigStatus> {
  const response = await workerFetch(CONFIG_URL, {
    method: 'DELETE',
    headers: await getAuthHeaders(false),
  })
  const payload = await readResponsePayload(response)
  if (!response.ok) {
    throw new Error(`AI proxy ${response.status}: ${getOpenRouterError(payload) || 'Failed to clear the API key.'}`)
  }
  return payload as AIProxyConfigStatus
}

function getOpenRouterError(payload: any): string | null {
  const error = payload?.error
  if (typeof error === 'string') return error
  if (error?.message) {
    const message = String(error.message)
    const metadata = error.metadata || {}
    const provider = metadata.provider_name || metadata.provider
    const errorType = metadata.error_type
    const raw = metadata.raw
    let detail = ''

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        detail = String(parsed?.error?.message || parsed?.message || '')
      } catch {
        detail = raw
      }
    }

    const context = [
      provider ? `provider: ${provider}` : '',
      errorType ? `type: ${errorType}` : '',
      detail && detail !== message ? detail.slice(0, 500) : '',
    ].filter(Boolean)
    return context.length ? `${message} (${context.join('; ')})` : message
  }

  const choice = payload?.choices?.[0]
  if (choice?.finish_reason === 'error') {
    return 'The model provider stopped before producing a response.'
  }
  return null
}

async function readResponsePayload(res: Response): Promise<any> {
  const body = await res.text()
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch {
    if (!res.ok) return { error: { message: body.slice(0, 1_000) } }
    throw new Error('OpenRouter returned an invalid JSON response.')
  }
}

export async function validateOpenRouterModel(model: string): Promise<void> {
  const modelId = getConfiguredModelId(model)
  const separatorIndex = modelId.indexOf('/')
  if (separatorIndex <= 0 || separatorIndex === modelId.length - 1) {
    throw new Error('Model id must use the provider/model format.')
  }

  const response = await workerFetch(`${MODEL_ENDPOINTS_URL}?model=${encodeURIComponent(modelId)}`, {
    method: 'GET',
    headers: await getAuthHeaders(false),
  })
  const payload = await readResponsePayload(response)
  const endpoints = payload?.data?.endpoints

  if (response.status === 404 || (response.ok && Array.isArray(endpoints) && endpoints.length === 0)) {
    throw new Error(unavailableModelMessage(modelId))
  }
  if (!response.ok) {
    throw new Error(`OpenRouter could not validate model "${modelId}": ${getOpenRouterError(payload) || `HTTP ${response.status}`}`)
  }
  if (!Array.isArray(endpoints)) {
    throw new Error(`OpenRouter returned an invalid endpoint response for model "${modelId}".`)
  }
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

  if (!model) {
    throw new Error('AI not configured - ask an admin to configure the model and OpenRouter key.')
  }

  const res = await workerFetch(CHAT_URL, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      model,
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: opts.toolChoice || 'auto',
      temperature: 0.2,
    }),
    signal: opts.signal,
  })

  const payload = await readResponsePayload(res)
  const providerError = getOpenRouterError(payload)
  if (!res.ok || providerError) {
    if (res.status === 404 && /no endpoints found/i.test(providerError || '')) {
      throw new Error(`OpenRouter 404: ${unavailableModelMessage(model)}`)
    }
    throw new Error(`OpenRouter ${res.status}: ${providerError || 'Request failed.'}`)
  }
  if (!Array.isArray(payload?.choices) || !payload.choices[0]?.message) {
    throw new Error('OpenRouter returned no assistant response.')
  }

  return payload as ORCompletionResponse
}
