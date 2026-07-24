import worker from '../../../worker'

/**
 * Cloudflare Pages Functions adapter.
 *
 * Production currently runs at bom-manager.pages.dev, where worker.ts is not
 * automatically mounted as an API handler. This catch-all forwards the three
 * /api/openrouter/* routes to the same authenticated Worker implementation
 * used by `wrangler deploy`.
 */
export async function onRequest(context: {
  request: Request
  env: Record<string, unknown>
}): Promise<Response> {
  return worker.fetch(context.request, context.env as any)
}
