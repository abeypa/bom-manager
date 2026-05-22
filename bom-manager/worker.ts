interface Env {
  ASSETS: Fetcher
  OPENROUTER_API_KEY?: string
  OPENROUTER_CONFIG_SECRET?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

type ConfigSource = 'app_settings' | 'worker_secret' | 'none'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const APP_TITLE = 'BOM Manager'
const SETTINGS_TABLE = 'app_settings'
const KEY_CIPHERTEXT = 'ai_api_key_ciphertext'
const KEY_IV = 'ai_api_key_iv'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(),
    },
  })
}

function requireEnv(env: Env, key: keyof Env): string {
  const value = env[key]
  if (!value) throw new Error(`Missing Worker secret/env: ${String(key)}`)
  return value
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((b) => { binary += String.fromCharCode(b) })
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveConfigKey(secret: string) {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function encryptValue(secret: string, plaintext: string) {
  const key = await deriveConfigKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return {
    ciphertext: bytesToBase64(new Uint8Array(cipher)),
    iv: bytesToBase64(iv),
  }
}

async function decryptValue(secret: string, ciphertext: string, iv: string) {
  const key = await deriveConfigKey(secret)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    key,
    base64ToBytes(ciphertext),
  )
  return new TextDecoder().decode(plain)
}

async function supabaseFetch(env: Env, path: string, init: RequestInit = {}) {
  const baseUrl = requireEnv(env, 'VITE_SUPABASE_URL')
  const serviceKey = requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY')
  const headers = new Headers(init.headers || {})
  headers.set('apikey', serviceKey)
  headers.set('Authorization', `Bearer ${serviceKey}`)
  return fetch(`${baseUrl}/rest/v1/${path}`, { ...init, headers })
}

async function getAuthUser(env: Env, bearerToken: string) {
  const baseUrl = requireEnv(env, 'VITE_SUPABASE_URL')
  const anonKey = requireEnv(env, 'VITE_SUPABASE_ANON_KEY')
  const res = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${bearerToken}`,
    },
  })
  if (!res.ok) return null
  return res.json<any>()
}

async function requireAuthenticated(request: Request, env: Env) {
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    return { ok: false, response: jsonResponse({ error: 'Authentication required' }, 401) }
  }

  const user = await getAuthUser(env, token)
  if (!user?.id) {
    return { ok: false, response: jsonResponse({ error: 'Invalid session' }, 401) }
  }

  return { ok: true as const, user }
}

async function requireAdmin(request: Request, env: Env) {
  const auth = await requireAuthenticated(request, env)
  if (!auth.ok) return auth

  const user = auth.user

  const res = await supabaseFetch(
    env,
    `profiles?select=role&id=eq.${encodeURIComponent(user.id)}&limit=1`,
    { method: 'GET' },
  )
  if (!res.ok) {
    return { ok: false, response: jsonResponse({ error: 'Failed to verify admin role' }, 500) }
  }
  const rows = await res.json<any[]>()
  const role = rows?.[0]?.role
  if (role !== 'admin') {
    return { ok: false, response: jsonResponse({ error: 'Admin access required' }, 403) }
  }

  return { ok: true as const, user }
}

async function loadStoredOpenRouterKey(env: Env): Promise<{ key: string | null; source: ConfigSource }> {
  const directKey = env.OPENROUTER_API_KEY?.trim()

  if (env.SUPABASE_SERVICE_ROLE_KEY && env.OPENROUTER_CONFIG_SECRET && env.VITE_SUPABASE_URL) {
    const query = `${SETTINGS_TABLE}?select=key,value&key=in.(${KEY_CIPHERTEXT},${KEY_IV})`
    const res = await supabaseFetch(env, query, { method: 'GET' })
    if (res.ok) {
      const rows = await res.json<any[]>()
      const ciphertext = rows.find((row) => row.key === KEY_CIPHERTEXT)?.value
      const iv = rows.find((row) => row.key === KEY_IV)?.value
      if (ciphertext && iv) {
        const decrypted = await decryptValue(env.OPENROUTER_CONFIG_SECRET, ciphertext, iv)
        return { key: decrypted, source: 'app_settings' }
      }
    }
  }

  if (directKey) return { key: directKey, source: 'worker_secret' }
  return { key: null, source: 'none' }
}

async function saveStoredOpenRouterKey(env: Env, apiKey: string) {
  const configSecret = requireEnv(env, 'OPENROUTER_CONFIG_SECRET')
  const payload = await encryptValue(configSecret, apiKey)
  const body = JSON.stringify([
    { key: KEY_CIPHERTEXT, value: payload.ciphertext, updated_at: new Date().toISOString() },
    { key: KEY_IV, value: payload.iv, updated_at: new Date().toISOString() },
  ])
  const res = await supabaseFetch(env, `${SETTINGS_TABLE}?on_conflict=key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body,
  })
  if (!res.ok) {
    throw new Error(`Failed to save encrypted API key (${res.status})`)
  }
}

async function clearStoredOpenRouterKey(env: Env) {
  const res = await supabaseFetch(env, `${SETTINGS_TABLE}?key=in.(${KEY_CIPHERTEXT},${KEY_IV})`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error(`Failed to clear encrypted API key (${res.status})`)
  }
}

async function handleOpenRouterConfig(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'no-store',
        ...corsHeaders(),
      },
    })
  }

  if (request.method === 'GET') {
    const auth = await requireAuthenticated(request, env)
    if (!auth.ok) return auth.response
    const { key, source } = await loadStoredOpenRouterKey(env)
    return jsonResponse({ configured: Boolean(key), source }, 200)
  }

  if (request.method === 'POST') {
    const auth = await requireAdmin(request, env)
    if (!auth.ok) return auth.response

    let body: any
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON payload' }, 400)
    }
    const apiKey = String(body?.apiKey || '').trim()
    if (!apiKey) return jsonResponse({ error: 'API key is required' }, 400)

    try {
      await saveStoredOpenRouterKey(env, apiKey)
      return jsonResponse({ configured: true, source: 'app_settings' satisfies ConfigSource }, 200)
    } catch (error: any) {
      return jsonResponse({ error: error?.message || 'Failed to store API key' }, 500)
    }
  }

  if (request.method === 'DELETE') {
    const auth = await requireAdmin(request, env)
    if (!auth.ok) return auth.response
    try {
      await clearStoredOpenRouterKey(env)
      return jsonResponse({ configured: false, source: env.OPENROUTER_API_KEY ? 'worker_secret' : 'none' }, 200)
    } catch (error: any) {
      return jsonResponse({ error: error?.message || 'Failed to clear API key' }, 500)
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405)
}

async function handleOpenRouterProxy(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'no-store',
        ...corsHeaders(),
      },
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const { key: apiKey } = await loadStoredOpenRouterKey(env)
  if (!apiKey) {
    return jsonResponse({ error: 'AI proxy is not configured' }, 503)
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400)
  }

  const origin = new URL(request.url).origin
  const upstream = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': origin,
      'X-Title': APP_TITLE,
    },
    body: JSON.stringify(payload),
  })

  const headers = new Headers(upstream.headers)
  headers.set('Cache-Control', 'no-store')
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value)
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/openrouter/chat') {
      return handleOpenRouterProxy(request, env)
    }

    if (url.pathname === '/api/openrouter/config') {
      return handleOpenRouterConfig(request, env)
    }

    return env.ASSETS.fetch(request)
  },
}
