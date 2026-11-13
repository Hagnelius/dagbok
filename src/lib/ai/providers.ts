import type { AiProviderId, AiResult } from '../types'
import type { PreparedImage } from './image'
import { parseLocally } from './localParser'
import { normalizeAiResult } from './normalize'
import { buildPrompt } from './prompt'

export interface InterpretContext {
  today: string
  now: string
  weightKg?: number
}

/**
 * Abstraktion för AI-tolkning. Varje leverantör tar text och returnerar ett AiResult som ALLTID
 * granskas av användaren innan något sparas. Nya leverantörer läggs till här.
 */
export interface AiProvider {
  id: AiProviderId
  label: string
  /** true om texten lämnar enheten. Användaren informeras och måste godkänna först. */
  external: boolean
  /** true om leverantören kan analysera foton. */
  supportsImages: boolean
  interpret(text: string, ctx: InterpretContext, opts?: { endpoint?: string; token?: string; signal?: AbortSignal; image?: Pick<PreparedImage, 'mediaType' | 'data'> }): Promise<AiResult>
}

export const localProvider: AiProvider = {
  id: 'lokal',
  label: 'Lokal tolkning (offline)',
  external: false,
  supportsImages: false,
  async interpret(text, ctx, opts) {
    if (opts?.image) throw new Error('Den lokala tolkningen kan inte analysera foton.')
    return parseLocally(text, ctx)
  },
}

/** Skickar text till en egen serverfunktion (se server/ i projektet). API-nyckeln finns bara på servern. */
export const serverProvider: AiProvider = {
  id: 'server',
  label: 'Egen serverfunktion',
  external: true,
  supportsImages: true,
  async interpret(text, ctx, opts) {
    if (!opts?.endpoint) throw new Error('Ingen serveradress är angiven under Inställningar → AI.')
    const res = await fetch(opts.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
      // Minsta möjliga data: texten, datum/tid och (om tillgänglig) vikt för träningsuppskattning.
      body: JSON.stringify({
        text: text.slice(0, 2000), today: ctx.today, now: ctx.now, weightKg: ctx.weightKg,
        ...(opts.image ? { image: { mediaType: opts.image.mediaType, data: opts.image.data } } : {}),
      }),
      signal: opts.signal,
    })
    if (!res.ok) throw new Error(`Servern svarade med fel (${res.status}).`)
    return normalizeAiResult(await res.json())
  },
}

/** "Klistra in AI-svar": appen bygger en instruktion som kopieras till valfri AI-tjänst, svaret klistras in. */
export function pasteModePrompt(text: string, ctx: InterpretContext, photo = false): string {
  return buildPrompt(text, ctx.today, ctx.now, ctx.weightKg, photo)
}
export function parsePastedResponse(s: string): AiResult {
  return normalizeAiResult(s)
}
