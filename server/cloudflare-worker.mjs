// Cloudflare Worker för AI-tolkning. Driftsätt med Wrangler (se README → AI-integration).
// Hemligheter: ANTHROPIC_API_KEY (eller OPENAI_API_KEY + AI_PROVIDER=openai), APP_TOKEN.
// Variabler: ALLOWED_ORIGIN (t.ex. https://dittnamn.github.io), AI_MODEL.
import { handle } from './shared.mjs'

export default {
  async fetch(request, env) {
    const headers = Object.fromEntries(request.headers)
    const r = await handle(request.method, headers, request.method === 'POST' ? await request.text() : '', env)
    return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: r.headers })
  },
}
