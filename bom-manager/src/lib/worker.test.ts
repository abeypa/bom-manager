import { describe, expect, it } from 'vitest'
import worker from '../../worker'

describe('OpenRouter Worker configuration errors', () => {
  it('returns JSON instead of throwing when Supabase runtime bindings are missing', async () => {
    const response = await worker.fetch(
      new Request('https://bom.test/api/openrouter/chat', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
      {
        ASSETS: { fetch: () => Promise.resolve(new Response('asset')) },
      } as any,
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toEqual({
      error: 'AI proxy is missing Cloudflare runtime bindings: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY',
    })
  })
})
