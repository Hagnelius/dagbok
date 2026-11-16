// Kost- och träningsdagbok – AI-serverfunktion för Cloudflare Workers.
// GENERERAD FIL – ändra i server/shared.mjs och kör "npm run bundle:worker".
//
// Klistra in hela filen i Cloudflare (Workers → din Worker → Edit code) och spara.
// Inställningar (Settings → Variables and Secrets):
//   GEMINI_API_KEY   (Secret)  nyckel från Google AI Studio – gratisnivå
//   APP_TOKEN        (Secret)  valfri lång kod, samma som "Åtkomstkod" i appen
//   ALLOWED_ORIGIN   (Text)    t.ex. https://hagnelius.github.io
//   AI_MODEL         (Text, valfri) standard för Gemini: gemini-flash-latest
//   AI_REASONING     (Text, valfri) Geminis tankeinsats: low (standard), medium, high
// Alternativ: ANTHROPIC_API_KEY eller OPENAI_API_KEY i stället för GEMINI_API_KEY.

// Delad logik för AI-serverfunktionen (Cloudflare Worker och lokal Node-server).
// API-nyckeln läses ENDAST från miljövariabler på servern och skickas aldrig till klienten.

function buildPrompt(text, today, now, weightKg, photo = false) {
  const intro = photo
    ? `Du analyserar ett bifogat foto av en måltid och gör en realistisk uppskattning av vad den innehåller, som JSON.
Bedöm livsmedel och mängder utifrån det som syns (tallrikens storlek, bestick och förpackningar ger skala).
Mängder och näring från fotot är "uppskattat", eller "osakert" om du är osäker. Det användaren skriver i texten nedan är "angivet" och går före bilden.
Tänk på dolda kalorier (olja, smör, sås, dressing) och nämn dem som antaganden. Ställ en följdfråga om något avgörande inte syns.`
    : 'Du tolkar en svensk dagboksanteckning om mat och/eller träning till JSON.'
  return `${intro}
Dagens datum: ${today}. Klockan: ${now}.${weightKg ? ` Kroppsvikt: ${weightKg} kg (för att uppskatta träningskalorier).` : ''}

Svara ENDAST med JSON enligt detta schema:
{
  "foods": [{
    "name": "livsmedel på svenska", "amount": number, "unit": "g|ml|dl|st|portion|skiva|msk|tsk|krm",
    "kcal": number, "protein": number, "fat": number, "carbs": number,
    "meal": "frukost|lunch|middag|mellanmal|dryck",
    "date": "YYYY-MM-DD (om nämnt)", "time": "HH:mm (om nämnt)",
    "amountOrigin": "angivet|uppskattat|osakert", "nutritionOrigin": "beraknat|uppskattat|osakert",
    "note": "kort kommentar vid behov"
  }],
  "workouts": [{
    "activity": "promenad|lopning|cykling|crosstrainer|gym|fotboll|simning|annat", "label": "valfri beskrivning",
    "durationMin": number, "intensity": "lag|medel|hog", "kcal": number,
    "date": "YYYY-MM-DD", "time": "HH:mm", "distanceKm": number, "avgHr": number, "note": "",
    "durationOrigin": "angivet|uppskattat|osakert", "kcalOrigin": "uppskattat|osakert"
  }],
  "assumptions": ["antaganden du gjort, på svenska"],
  "uncertainties": ["osäkerheter, på svenska"],
  "followUpQuestion": "EN kort fråga endast om en saknad uppgift har stor betydelse för beräkningen, annars utelämna"
}

Regler:
- Dela upp måltider i enskilda livsmedel. Näringsvärden avser den angivna mängden, inte per 100 g.
- Använd svenska typvärden (Livsmedelsverket) och var realistisk. Ange "angivet" endast för sådant som står i texten.
- Träningskalorier är nettoförbrukning utöver vila och alltid "uppskattat".
- Hitta inte på mat eller träning som inte nämns.

${photo ? 'Användarens kommentar till fotot' : 'Text'}:
"""${String(text).slice(0, 2000) || '(ingen kommentar)'}"""`
}

/** Begripligt fel från AI-tjänsten. Svaret från tjänsten innehåller aldrig användarens text. */
async function serviceError(res) {
  let detail = ''
  try {
    const t = await res.text()
    try { const j = JSON.parse(t); detail = (Array.isArray(j) ? j[0] : j)?.error?.message ?? '' } catch { detail = t }
  } catch { /* ignorera */ }
  detail = String(detail).replace(/\s+/g, ' ').slice(0, 200)
  console.error(`AI-tjänsten svarade ${res.status}: ${detail}`)
  if (res.status === 429) return new Error('AI-tjänstens gratiskvot är slut för stunden – försök igen senare.')
  return new Error(`AI-tjänsten svarade ${res.status}${detail ? `: ${detail}` : ''}`)
}

function extractJson(s) {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s)
  const body = fence ? fence[1] : s
  const a = body.indexOf('{'), b = body.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('Modellen svarade inte med JSON')
  return JSON.parse(body.slice(a, b + 1))
}

async function callAnthropic(env, prompt, image) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.AI_MODEL || 'claude-sonnet-4-5', max_tokens: 2000, messages: [{ role: 'user', content: image
      ? [{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } }, { type: 'text', text: prompt }]
      : prompt }] }),
  })
  if (!res.ok) throw await serviceError(res)
  const data = await res.json()
  return data.content?.map((c) => c.text ?? '').join('') ?? ''
}

/** Googles Gemini via deras OpenAI-kompatibla gränssnitt (har en gratisnivå). */
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest'
/** Reservmodeller som provas i tur och ordning om en modell är överbelastad, saknas eller är för långsam. */
const GEMINI_FALLBACK_MODELS = ['gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']

async function callOpenAI(env, prompt, image, opts = {}) {
  const res = await fetch(opts.url || env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.key || env.OPENAI_API_KEY}` },
    // Gemini får ingen response_format – prompten kräver ren JSON och svaret tolkas tolerant.
    body: JSON.stringify({ model: opts.model || env.AI_MODEL || 'gpt-4o-mini', ...(opts.jsonMode === false ? {} : { response_format: { type: 'json_object' } }), ...(opts.reasoning ? { reasoning_effort: opts.reasoning } : {}), messages: [{ role: 'user', content: image
      ? [{ type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.data}` } }, { type: 'text', text: prompt }]
      : prompt }] }),
  })
  if (!res.ok) throw await serviceError(res)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/** true om felet gäller just den modellen (överbelastad, saknas, kvot eller för långsam) – då provas nästa. */
function tryNextModel(e) {
  return e?.name === 'TimeoutError' || e?.name === 'AbortError' || /svarade (404|429|5\d\d)|gratiskvot/.test(e?.message ?? '')
}

/**
 * Gemini med kort tankeinsats så att svaret kommer snabbt. Googles gratisnivå är ibland överbelastad
 * (503) eller långsam – då provas reservmodellerna i tur och ordning, allt inom ca 85 s.
 * AI_MODEL kan vara en kommaseparerad lista som ersätter standardordningen.
 */
async function callGemini(env, prompt, image) {
  const base = { url: GEMINI_URL, key: env.GEMINI_API_KEY, jsonMode: false, reasoning: env.AI_REASONING || 'low' }
  const models = env.AI_MODEL ? env.AI_MODEL.split(',').map((m) => m.trim()).filter(Boolean) : [GEMINI_DEFAULT_MODEL, ...GEMINI_FALLBACK_MODELS]
  const started = Date.now()
  const errors = []
  for (const [i, model] of models.entries()) {
    const left = 85_000 - (Date.now() - started)
    if (left < 5_000) break
    try {
      return await callOpenAI(env, prompt, image, { ...base, model, timeoutMs: Math.min(i === 0 ? 30_000 : 20_000, left) })
    } catch (e) {
      if (!tryNextModel(e)) throw e
      console.error(`${model} gick inte att använda (${e.name === 'Error' ? e.message.slice(0, 60) : e.name}), provar nästa`)
      errors.push(e)
    }
  }
  const all = (re) => errors.length > 0 && errors.every((e) => re.test(e.message))
  if (all(/gratiskvot/) || all(/svarade 404/)) throw errors[errors.length - 1]
  if (errors.every((e) => e.name === 'TimeoutError' || e.name === 'AbortError')) throw new Error('AI-tjänsten svarade inte i tid – försök igen om en stund.')
  throw new Error('Googles AI-tjänst är överbelastad just nu – försök igen om en stund.')
}

/**
 * Hanterar en tolkningsförfrågan. Returnerar { status, body, headers }.
 * Loggar aldrig användarens text.
 */
async function handle(method, headers, bodyText, env) {
  const origin = headers.origin || ''
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean)
  const cors = {
    'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0] || 'null',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'vary': 'origin',
  }
  if (method === 'OPTIONS') return { status: 204, headers: cors, body: '' }
  if (method !== 'POST') return { status: 405, headers: cors, body: JSON.stringify({ error: 'Endast POST' }) }
  if (allowed.length && !allowed.includes(origin)) return { status: 403, headers: cors, body: JSON.stringify({ error: 'Otillåten källa' }) }
  if (env.APP_TOKEN && headers.authorization !== `Bearer ${env.APP_TOKEN}`) return { status: 401, headers: cors, body: JSON.stringify({ error: 'Fel åtkomstkod' }) }
  let input
  try { input = JSON.parse(bodyText) } catch { return { status: 400, headers: cors, body: JSON.stringify({ error: 'Ogiltig JSON' }) } }
  // Foto (valfritt): endast JPEG/PNG/WebP i base64, högst ca 3 MB.
  let image
  if (input.image !== undefined) {
    const ok = input.image && ['image/jpeg', 'image/png', 'image/webp'].includes(input.image.mediaType) && typeof input.image.data === 'string'
      && input.image.data.length > 100 && input.image.data.length <= 4_000_000 && /^[A-Za-z0-9+/=]+$/.test(input.image.data.slice(0, 1000))
    if (!ok) return { status: 400, headers: cors, body: JSON.stringify({ error: 'Ogiltig eller för stor bild' }) }
    image = { mediaType: input.image.mediaType, data: input.image.data }
  }
  if (typeof input.text !== 'string') input.text = ''
  if ((!image && !input.text.trim()) || input.text.length > 2000) return { status: 400, headers: cors, body: JSON.stringify({ error: 'Text saknas eller är för lång' }) }
  const today = /^\d{4}-\d{2}-\d{2}$/.test(input.today) ? input.today : new Date().toISOString().slice(0, 10)
  const now = /^\d{2}:\d{2}$/.test(input.now) ? input.now : '12:00'
  const weight = typeof input.weightKg === 'number' && input.weightKg > 20 && input.weightKg < 400 ? Math.round(input.weightKg) : undefined
  try {
    const prompt = buildPrompt(input.text, today, now, weight, !!image)
    const provider = env.AI_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY ? 'openai' : 'anthropic')
    const raw = provider === 'gemini'
      ? await callGemini(env, prompt, image)
      : provider === 'openai' ? await callOpenAI(env, prompt, image) : await callAnthropic(env, prompt, image)
    // Klienten validerar och rensar svaret igen innan det visas för granskning.
    return { status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(extractJson(raw)) }
  } catch (e) {
    console.error(`Tolkningen misslyckades (${e.name})`)
    return { status: 502, headers: cors, body: JSON.stringify({ error: e.message }) }
  }
}

export default {
  async fetch(request, env) {
    const headers = Object.fromEntries(request.headers)
    const r = await handle(request.method, headers, request.method === 'POST' ? await request.text() : '', env)
    return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: r.headers })
  },
}
