// Hämtar Livsmedelsverkets livsmedelsdatabas (CC BY 4.0) vid bygget och lägger en avskalad version
// i appen som livsmedelsverket.json. Körs av Vite-pluginen nedan (bara vid `vite build`).
// Finns src/data/livsmedelsverket.json används den i stället (t.ex. vid bygge utan internet).
// Källa: Livsmedelsverket, https://dataportal.livsmedelsverket.se/livsmedel/swagger/index.html
import { existsSync, readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

const BASE = 'https://dataportal.livsmedelsverket.se/livsmedel/api/v1'
const LOCAL = 'src/data/livsmedelsverket.json'

interface ListPage { _meta: { totalRecords: number }; livsmedel: Array<{ nummer: number; namn: string }> }
interface Value { euroFIRkod: string; enhet: string; varde: number }

async function getJson<T>(url: string, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      return (await res.json()) as T
    } catch (e) {
      if (i >= tries) throw e
      await new Promise((r) => setTimeout(r, 500 * i))
    }
  }
}

const r1 = (x: unknown) => Math.round((Number(x) || 0) * 10) / 10

/** [nummer, namn, kcal, protein, fett, kolhydrater] per 100 g. */
export async function fetchLivsmedel() {
  const info = await getJson<{ apiVersion: string }>(`${BASE}/api-info`)
  const list: ListPage['livsmedel'] = []
  for (let offset = 0; ; offset += 500) {
    const page = await getJson<ListPage>(`${BASE}/livsmedel?offset=${offset}&limit=500&sprak=1`)
    list.push(...page.livsmedel)
    if (list.length >= page._meta.totalRecords || page.livsmedel.length === 0) break
  }
  const foods: Array<[number, string, number, number, number, number]> = []
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const item = list[next++]
      const nv = await getJson<Value[]>(`${BASE}/livsmedel/${item.nummer}/naringsvarden?sprak=1`)
      const val = (code: string, unit?: string) => nv.find((x) => x.euroFIRkod === code && (!unit || x.enhet === unit))?.varde
      const kcal = val('ENERC', 'kcal')
      if (kcal === undefined) continue
      foods.push([item.nummer, item.namn.trim(), Math.round(kcal), r1(val('PROT')), r1(val('FAT')), r1(val('CHO'))])
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  foods.sort((a, b) => a[0] - b[0])
  return {
    source: 'Livsmedelsverkets livsmedelsdatabas, CC BY 4.0',
    apiVersion: info.apiVersion,
    fetchedAt: new Date().toISOString().slice(0, 10),
    fields: ['nummer', 'namn', 'kcal', 'protein', 'fett', 'kolhydrater'],
    foods,
  }
}

export function livsmedelsverketPlugin(): Plugin {
  return {
    name: 'livsmedelsverket',
    apply: 'build',
    async generateBundle() {
      let source: string
      try {
        source = existsSync(LOCAL) ? readFileSync(LOCAL, 'utf8') : JSON.stringify(await fetchLivsmedel())
      } catch (e) {
        // Appen fungerar ändå med den inbyggda listan – bygget ska inte stoppas av att API:t är nere.
        this.warn(`Kunde inte hämta Livsmedelsverkets data: ${(e as Error).message}`)
        source = JSON.stringify({ source: 'Livsmedelsverkets livsmedelsdatabas, CC BY 4.0', foods: [] })
      }
      this.emitFile({ type: 'asset', fileName: 'livsmedelsverket.json', source })
    },
  }
}
