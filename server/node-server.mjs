// Lokal AI-server för test/egen drift utan beroenden (Node 18+).
// ANTHROPIC_API_KEY=... ALLOWED_ORIGIN=http://localhost:5173 node server/node-server.mjs
import http from 'node:http'
import { handle } from './shared.mjs'

const port = Number(process.env.PORT || 8787)
http.createServer(async (req, res) => {
  let body = ''
  req.on('data', (c) => { body += c; if (body.length > 5_000_000) req.destroy() })
  req.on('end', async () => {
    const r = await handle(req.method, req.headers, body, process.env)
    res.writeHead(r.status, r.headers)
    res.end(r.body)
  })
}).listen(port, () => console.log(`AI-server lyssnar på http://localhost:${port}/tolka`))
