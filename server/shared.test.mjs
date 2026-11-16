// Körs med: node --test server/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from './shared.mjs'

const env = { ALLOWED_ORIGIN: 'https://app.example', APP_TOKEN: 'hemlig', ANTHROPIC_API_KEY: 'x' }
const h = (extra = {}) => ({ origin: 'https://app.example', authorization: 'Bearer hemlig', ...extra })

test('preflight', async () => { assert.equal((await handle('OPTIONS', h(), '', env)).status, 204) })
test('fel källa nekas', async () => { assert.equal((await handle('POST', h({ origin: 'https://ond.example' }), '{"text":"a"}', env)).status, 403) })
test('fel token nekas', async () => { assert.equal((await handle('POST', h({ authorization: 'Bearer fel' }), '{"text":"a"}', env)).status, 401) })
test('tom text nekas', async () => { assert.equal((await handle('POST', h(), '{"text":""}', env)).status, 400) })
test('för lång text nekas', async () => { assert.equal((await handle('POST', h(), JSON.stringify({ text: 'a'.repeat(2001) }), env)).status, 400) })
test('felaktig bildtyp nekas', async () => { assert.equal((await handle('POST', h(), JSON.stringify({ text: '', image: { mediaType: 'image/gif', data: 'A'.repeat(200) } }), env)).status, 400) })
test('för stor bild nekas', async () => { assert.equal((await handle('POST', h(), JSON.stringify({ text: '', image: { mediaType: 'image/jpeg', data: 'A'.repeat(4_000_001) } }), env)).status, 400) })
test('bild skickas till AI-tjänsten som bildinnehåll', async () => {
  const orig = globalThis.fetch
  let sent
  globalThis.fetch = async (_url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ content: [{ text: '{"foods":[],"workouts":[]}' }] }), { status: 200 }) }
  try {
    const r = await handle('POST', h(), JSON.stringify({ text: '', image: { mediaType: 'image/jpeg', data: 'A'.repeat(200) } }), env)
    assert.equal(r.status, 200)
    assert.equal(sent.messages[0].content[0].type, 'image')
    assert.match(sent.messages[0].content[1].text, /bifogat foto/)
  } finally { globalThis.fetch = orig }
})
test('Gemini: rätt adress, nyckel, modell och bild som data-URL', async () => {
  const orig = globalThis.fetch
  let url, init
  globalThis.fetch = async (u, i) => { url = u; init = i; return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"foods":[{"name":"Kebab","amount":1,"unit":"portion","kcal":800,"protein":40}],"workouts":[]}\n```' } }] }), { status: 200 }) }
  try {
    const genv = { ALLOWED_ORIGIN: 'https://app.example', APP_TOKEN: 'hemlig', GEMINI_API_KEY: 'gk' }
    const r = await handle('POST', h(), JSON.stringify({ text: 'kebab', image: { mediaType: 'image/jpeg', data: 'A'.repeat(200) } }), genv)
    assert.equal(r.status, 200)
    assert.equal(JSON.parse(r.body).foods[0].name, 'Kebab')
    assert.match(url, /generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions/)
    assert.equal(init.headers.authorization, 'Bearer gk')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'gemini-flash-latest')
    assert.equal(body.response_format, undefined)
    assert.match(body.messages[0].content[0].image_url.url, /^data:image\/jpeg;base64,/)
  } finally { globalThis.fetch = orig }
})
test('Gemini: slut på gratiskvot ger begripligt fel', async () => {
  const orig = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { status: 429 })
  const origErr = console.error; console.error = () => {}
  try {
    const r = await handle('POST', h(), JSON.stringify({ text: 'kebab' }), { ALLOWED_ORIGIN: 'https://app.example', APP_TOKEN: 'hemlig', GEMINI_API_KEY: 'gk' })
    assert.equal(r.status, 502)
    assert.match(JSON.parse(r.body).error, /gratiskvot/)
  } finally { globalThis.fetch = orig; console.error = origErr }
})
test('paketerad Worker-fil är uppdaterad', async () => {
  const { buildWorkerBundle } = await import('../scripts/bundle-worker.mjs')
  const { readFile } = await import('node:fs/promises')
  const current = await readFile(new URL('./cloudflare-worker-bundle.js', import.meta.url), 'utf8')
  assert.equal(current, await buildWorkerBundle(), 'Kör: npm run bundle:worker')
})
test('felmeddelande från Gemini skickas vidare (utan användartext)', async () => {
  const orig = globalThis.fetch
  const origErr = console.error; console.error = () => {}
  globalThis.fetch = async () => new Response(JSON.stringify([{ error: { code: 404, message: 'models/x is not found for API version v1beta', status: 'NOT_FOUND' } }]), { status: 404 })
  try {
    const r = await handle('POST', h(), JSON.stringify({ text: 'hemlig mat' }), { ALLOWED_ORIGIN: 'https://app.example', APP_TOKEN: 'hemlig', GEMINI_API_KEY: 'gk' })
    assert.equal(r.status, 502)
    const err = JSON.parse(r.body).error
    assert.match(err, /404: models\/x is not found/)
    assert.doesNotMatch(err, /hemlig mat/)
  } finally { globalThis.fetch = orig; console.error = origErr }
})
test('Gemini: kort tankeinsats och reservmodeller vid 524/503/404', async () => {
  const orig = globalThis.fetch
  const origErr = console.error; console.error = () => {}
  const models = []
  globalThis.fetch = async (_u, init) => {
    const b = JSON.parse(init.body); models.push(b.model)
    assert.equal(b.reasoning_effort, 'low')
    if (models.length === 1) return new Response('error code: 524', { status: 524 })
    if (models.length === 2) return new Response(JSON.stringify([{ error: { message: 'This model is currently experiencing high demand.' } }]), { status: 503 })
    if (models.length === 3) return new Response('{}', { status: 404 })
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"foods":[],"workouts":[]}' } }] }), { status: 200 })
  }
  try {
    const r = await handle('POST', h(), JSON.stringify({ text: 'kebab' }), { ALLOWED_ORIGIN: 'https://app.example', APP_TOKEN: 'hemlig', GEMINI_API_KEY: 'gk' })
    assert.equal(r.status, 200)
    assert.deepEqual(models, ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])
  } finally { globalThis.fetch = orig; console.error = origErr }
})
test('Gemini: fel nyckel ger inget nytt försök', async () => {
  const orig = globalThis.fetch
  const origErr = console.error; console.error = () => {}
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify([{ error: { message: 'API key not valid' } }]), { status: 400 }) }
  try {
    const r = await handle('POST', h(), JSON.stringify({ text: 'kebab' }), { ALLOWED_ORIGIN: 'https://app.example', APP_TOKEN: 'hemlig', GEMINI_API_KEY: 'gk' })
    assert.equal(r.status, 502); assert.equal(calls, 1)
    assert.match(JSON.parse(r.body).error, /API key not valid/)
  } finally { globalThis.fetch = orig; console.error = origErr }
})
test('Gemini: alla modeller överbelastade ger begripligt fel', async () => {
  const orig = globalThis.fetch
  const origErr = console.error; console.error = () => {}
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response('{}', { status: 503 }) }
  try {
    const r = await handle('POST', h(), JSON.stringify({ text: 'kebab' }), { ALLOWED_ORIGIN: 'https://app.example', APP_TOKEN: 'hemlig', GEMINI_API_KEY: 'gk' })
    assert.equal(r.status, 502); assert.equal(calls, 4)
    assert.match(JSON.parse(r.body).error, /överbelastad/)
  } finally { globalThis.fetch = orig; console.error = origErr }
})
