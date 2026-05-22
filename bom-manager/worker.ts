interface Env {
  ASSETS: Fetcher
  OPENROUTER_API_KEY?: string
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const APP_TITLE = 'BOM Manager'

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

async function handleOpenRouterProxy(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const apiKey = env.OPENROUTER_API_KEY
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

    return env.ASSETS.fetch(request)
  },
}
