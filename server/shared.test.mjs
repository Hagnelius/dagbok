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
