// Delad logik för AI-serverfunktionen (Cloudflare Worker och lokal Node-server).
// API-nyckeln läses ENDAST från miljövariabler på servern och skickas aldrig till klienten.

export function buildPrompt(text, today, now, weightKg, photo = false) {
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
  if (!res.ok) throw new Error(`AI-tjänsten svarade ${res.status}`)
  const data = await res.json()
  return data.content?.map((c) => c.text ?? '').join('') ?? ''
}

async function callOpenAI(env, prompt, image) {
  const res = await fetch(env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: env.AI_MODEL || 'gpt-4o-mini', response_format: { type: 'json_object' }, messages: [{ role: 'user', content: image
      ? [{ type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.data}` } }, { type: 'text', text: prompt }]
      : prompt }] }),
  })
  if (!res.ok) throw new Error(`AI-tjänsten svarade ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/**
 * Hanterar en tolkningsförfrågan. Returnerar { status, body, headers }.
 * Loggar aldrig användarens text.
 */
export async function handle(method, headers, bodyText, env) {
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
    const raw = env.AI_PROVIDER === 'openai' ? await callOpenAI(env, prompt, image) : await callAnthropic(env, prompt, image)
    // Klienten validerar och rensar svaret igen innan det visas för granskning.
    return { status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(extractJson(raw)) }
  } catch (e) {
    return { status: 502, headers: cors, body: JSON.stringify({ error: e.message }) }
  }
}
