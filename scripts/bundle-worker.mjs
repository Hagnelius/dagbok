// Slår ihop serverfunktionen till EN fil som kan klistras in direkt i Cloudflares webbredigerare.
// Kör: npm run bundle:worker  (skapar server/cloudflare-worker-bundle.js)
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../server/', import.meta.url)

export async function buildWorkerBundle() {
  const shared = (await readFile(new URL('shared.mjs', root), 'utf8')).replace(/^export /gm, '')
  return `// Kost- och träningsdagbok – AI-serverfunktion för Cloudflare Workers.
// GENERERAD FIL – ändra i server/shared.mjs och kör "npm run bundle:worker".
//
// Klistra in hela filen i Cloudflare (Workers → din Worker → Edit code) och spara.
// Inställningar (Settings → Variables and Secrets):
//   GEMINI_API_KEY   (Secret)  nyckel från Google AI Studio – gratisnivå
//   APP_TOKEN        (Secret)  valfri lång kod, samma som "Åtkomstkod" i appen
//   ALLOWED_ORIGIN   (Text)    t.ex. https://hagnelius.github.io
//   AI_MODEL         (Text, valfri) standard för Gemini: ${'gemini-flash-latest'}
// Alternativ: ANTHROPIC_API_KEY eller OPENAI_API_KEY i stället för GEMINI_API_KEY.

${shared}
export default {
  async fetch(request, env) {
    const headers = Object.fromEntries(request.headers)
    const r = await handle(request.method, headers, request.method === 'POST' ? await request.text() : '', env)
    return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: r.headers })
  },
}
`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(new URL('cloudflare-worker-bundle.js', root), await buildWorkerBundle())
  console.log('Skapade server/cloudflare-worker-bundle.js')
}
