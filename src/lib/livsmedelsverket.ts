import type { DbFood } from './foodDb'
import type { AiFoodItem, AiResult, Unit } from './types'

/**
 * Livsmedelsverkets livsmedelsdatabas (CC BY 4.0), ca 2 600 livsmedel med värden per 100 g.
 * Filen livsmedelsverket.json skapas vid bygget (scripts/livsmedelsverket.ts), laddas vid behov
 * och sparas offline av service workern. Källa: Livsmedelsverket.
 */
export const LV_SOURCE = 'Livsmedelsverkets livsmedelsdatabas (CC BY 4.0)'

export interface LvFood {
  nr: number
  name: string
  per100: { kcal: number; protein: number; fat: number; carbs: number }
  tokens: string[]
}

type Row = [number, string, number, number, number, number]

let cache: Promise<LvFood[]> | undefined

/** Laddar databasen en gång. Ger en tom lista om filen saknas (appen fungerar ändå). */
export function loadLv(): Promise<LvFood[]> {
  cache ??= fetch(`${import.meta.env.BASE_URL}livsmedelsverket.json`)
    .then((r) => (r.ok ? r.json() : { foods: [] }))
    .then((d: { foods?: Row[] }) => toLvFoods(d.foods ?? []))
    .catch(() => { cache = undefined; return [] })
  return cache
}

export function toLvFoods(rows: Row[]): LvFood[] {
  return rows.map(([nr, name, kcal, protein, fat, carbs]) => ({ nr, name, per100: { kcal, protein, fat, carbs }, tokens: tokenize(name) }))
}

/** För tester: ersätt databasen med egna rader. */
export function setLvForTest(rows: Row[]) {
  cache = Promise.resolve(toLvFoods(rows))
}

export function tokenize(s: string): string[] {
  return s.toLowerCase().normalize('NFC').replace(/[^a-zåäöéüæø0-9%]+/g, ' ').trim().split(' ').filter(Boolean)
}

/** Ordstam för böjningar: "potatisar" → "potatis", "kokta" → "kokt", "köttbullar"/"köttbulle" → "köttbull". */
const ENDINGS = ['arna', 'erna', 'orna', 'ade', 'ar', 'er', 'or', 'en', 'et', 'na', 'a', 'e', 'n', 's', 'r', 't']
function stem(t: string): string {
  for (const e of ENDINGS) if (t.length - e.length >= 3 && t.endsWith(e)) return t.slice(0, -e.length)
  return t
}
/** Samma ord, bortsett från böjning. Sammansättningar räknas inte: "potatis" ≠ "potatispalt". */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 3 || b.length < 3) return false
  const sa = stem(a), sb = stem(b)
  return sa === b || a === sb || (sa === sb && sa.length >= 5)
}

/** Sökning för "Lägg till mat": alla sökord ska finnas i namnet; namn som börjar med sökningen först. */
export function searchLv(query: string, foods: LvFood[], limit = 15): LvFood[] {
  const q = tokenize(query)
  if (!q.length) return []
  const qs = q.join(' ')
  const scored: Array<[number, LvFood]> = []
  for (const f of foods) {
    if (!q.every((w) => f.tokens.some((t) => t.startsWith(w) || sameWord(w, t)))) continue
    const name = f.tokens.join(' ')
    // Hela ord före ordbörjan: "potatis" ger Potatis … före Potatispalt.
    let s = sameWord(q[0], f.tokens[0]) ? (name.startsWith(qs) ? 110 : 100) : name.startsWith(qs) ? 90 : f.tokens.some((t) => sameWord(q[0], t)) ? 80 : f.tokens[0].startsWith(q[0]) ? 70 : 40
    s += (q.length / f.tokens.length) * 20 - name.length / 30
    scored.push([s, f])
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1])
}

/** Ord i AI:ns namn som inte säger något om livsmedlet. */
const STOP = new Set(['och', 'med', 'm', 'i', 'på', 'av', 'en', 'ett', 'lite', 'ca', 'typ', 'st', 'g', 'portion', 'portioner', 'bit', 'bitar', 'skiva', 'skivor', 'glas', 'kopp', 'hemlagad', 'hemgjord', 'vanlig', 'vanliga', 'stor', 'stora', 'liten', 'små', 'naturell', 'färsk', 'färska', 'svensk'])
/** Fyllnadsord i Livsmedelsverkets namn som inte räknas vid täckning. */
const LV_FILLER = new Set(['m', 'u', 'el', 'typ', 'och', 'i', 'ca', 'vol', '%', 'fett', 'berikad'])
/** Varianter som bara ska väljas om AI:n själv nämner dem (rått, okokt, koncentrat …). */
const SPECIAL = new Set(['rå', 'rått', 'råa', 'okokt', 'konc', 'torkad', 'torkade', 'pulver', 'glutenfri', 'glutenfritt', 'laktosfri', 'mjölkfri', 'äggfri', 'eko', 'barnmat', 'veg', 'sötningsm', 'smaksatt', 'smaksatta', 'light', 'konserv', 'restaurang', 'frysvara', 'kylvara', 'halal', 'osaltad', 'sockerfria', 'lever', 'mage', 'hjärta', 'njure', 'tunga', 'blod'])
/** Första ord hos Livsmedelsverket som bara är en kategori ("Sött vetebröd kanelbulle", "Ost hårdost"). */
const CATEGORY = new Set(['sött', 'ost', 'färskost', 'bröd', 'hårt', 'mjuk', 'pasta', 'ris', 'kyckling', 'sallad', 'korv', 'kex', 'fisk', 'nöt', 'fläsk', 'gris', 'kalv', 'lamm', 'dryck', 'matfettsblandning', 'frukostflingor'])

/** Vanliga vardagsnamn som inte står ordagrant hos Livsmedelsverket. Värdet är Livsmedelsverkets namn. */
const ALIASES: Record<string, string> = {}
const alias = (lvName: string, ...names: string[]) => names.forEach((n) => (ALIASES[n] = lvName))
alias('Mellanmjölk fett 1,5% berikad', 'mjölk')
alias('Ost hårdost fett 28%', 'ost', 'hårdost', 'prästost', 'herrgårdsost', 'västerbottensost', 'grevé', 'präst', 'gouda', 'cheddar')
alias('Färskost cottage cheese naturell fett 4%', 'keso', 'cottage cheese')
alias('Matfettsblandning havssaltat fett 80% berikad typ Bregott', 'bregott', 'smör bregott')
alias('Hårt bröd fullkorn råg fibrer 15,5% typ Husman', 'knäckebröd', 'knäcke')
alias('Bröd fullkorn vete råg fibrer ca 6%', 'fullkornsbröd', 'grovt bröd', 'rågbröd')
alias('Fransk omelett m. vatten', 'omelett')
alias('Pasta kokt u. salt', 'pasta', 'spagetti', 'spaghetti', 'makaroner', 'spagetti kokt', 'kokt spagetti', 'kokt pasta', 'penne', 'fusilli')
alias('Ris långkornigt kokt m. salt', 'ris', 'kokt ris', 'ris kokt', 'vitt ris')
alias('Ris jasmin kokt m. salt', 'jasminris', 'kokt jasminris')
alias('Ris basmati kokt m. salt', 'basmatiris', 'kokt basmatiris')
alias('Vin rött vol. % 14', 'rödvin', 'vin rött', 'rött vin')
alias('Vin vitt vol. % 12', 'vitt vin', 'vitvin', 'vin vitt')
alias('Öl starköl el. exportöl vol. % 5,4', 'öl', 'starköl')
alias('Kaffe bryggt', 'kaffe', 'bryggkaffe', 'svart kaffe')
alias('Te bryggt', 'te')
alias('Potatis höst kokt m. salt', 'potatis', 'kokt potatis', 'potatis kokt')
alias('Lax stekt m. salt', 'lax', 'laxfilé', 'ugnsbakad lax', 'lax ugnsbakad', 'stekt laxfilé', 'ugnsbakad laxfilé')
alias('Pizza Capricciosa m. rökt skinka champinjon restaurang', 'pizza')
alias('Sött vetebröd kanelbulle hembakad', 'kanelbulle', 'kanelbullar')
alias('Yoghurt naturell fett 3% berikad', 'yoghurt')
alias('Yoghurt naturell fett 10%', 'grekisk yoghurt', 'turkisk yoghurt')
alias('Sallad m. grönsallat gurka tomat u. dressing', 'sallad', 'grönsallad', 'grönsallat', 'grön sallad')
alias('Kyckling kött kokt stekt grillat', 'kyckling', 'stekt kyckling', 'grillad kyckling', 'kycklingkött')
alias('Kyckling bröstfilé färsk stekt u. skinn', 'kycklingfilé', 'kycklingbröst', 'stekt kycklingfilé', 'kycklingbröst stekt', 'stekt kycklingbröst', 'grillad kycklingfilé')
alias('Nöt färs fett 10% stekt m. salt', 'nötfärs', 'köttfärs', 'stekt nötfärs', 'stekt köttfärs', 'nötfärs stekt', 'köttfärs stekt')
alias('Morot', 'morot', 'morötter')
alias('Räka kokt', 'räkor', 'räka', 'kokta räkor')
alias('Chips potatis naturell', 'chips', 'potatischips')
alias('Glass fett ca 10%', 'glass', 'vaniljglass')
alias('Majonnäs fett 80%', 'majonnäs', 'majo')
alias('Pommes frites friterad potatis fett ca 11% frysvara', 'pommes', 'pommes frites', 'pommes frites ugnsbakade')
alias('Mörk choklad kakao < 70%', 'mörk choklad')
alias('Kikärtor torkade kokta m. salt', 'kikärtor', 'kokta kikärtor')
// Medvetet ingen träff: för brett för ett säkert värde.
alias('', 'choklad', 'godis', 'kaffe mjölk', 'smörgås', 'macka', 'ärtor', 'gröna ärtor')

export function lvByName(name: string, foods: LvFood[]): LvFood | undefined {
  return foods.find((f) => f.name === name)
}

/** Hur väl ett AI-ord täcker Livsmedelsverkets ord: som eget ord, eller som sammansättning av två ord. */
function wordHits(w: string, tokens: string[]): number[] {
  const i = tokens.findIndex((t) => sameWord(w, t))
  if (i >= 0) return [i]
  // "kycklingfilé" → "kyckling" + "bröstfilé", "apelsinjuice" ej → "apelsin"
  for (let a = 0; a < tokens.length; a++) {
    const t = tokens[a]
    if (t.length < 3 || !w.startsWith(t) || w.length - t.length < 3) continue
    const rest = w.slice(t.length)
    const b = tokens.findIndex((u, j) => j !== a && (sameWord(rest, u) || (rest.length >= 4 && u.endsWith(rest))))
    if (b >= 0) return [a, b]
  }
  return []
}

/**
 * Säker träff för ett AI-föreslaget namn. Alla ord ska finnas som hela ord (med böjning) i
 * Livsmedelsverkets namn, och Livsmedelsverkets huvudord ska vara ett av dem. Ger undefined
 * hellre än en tveksam träff – då behålls AI:ns egen uppskattning.
 */
export function matchLv(name: string, foods: LvFood[]): LvFood | undefined {
  const words = tokenize(name).filter((w) => !STOP.has(w) && !/^\d/.test(w))
  if (!words.length) return undefined
  const key = words.join(' ')
  if (key in ALIASES) return ALIASES[key] ? lvByName(ALIASES[key], foods) : undefined
  let best: { f: LvFood; score: number } | undefined
  for (const f of foods) {
    const hit = new Set<number>()
    let ok = true
    for (const w of words) {
      const h = wordHits(w, f.tokens)
      if (!h.length) { ok = false; break }
      h.forEach((i) => hit.add(i))
    }
    if (!ok) continue
    if (!hit.has(0) && !(CATEGORY.has(f.tokens[0]) && hit.has(1))) continue
    const content = f.tokens
      .map((t, i) => [t, i] as const)
      .filter(([t, i]) => !LV_FILLER.has(t) && !/^\d/.test(t) && !(i === 0 && !hit.has(0)))
    const covered = content.filter(([, i]) => hit.has(i)).length
    const special = content.filter(([t, i]) => !hit.has(i) && SPECIAL.has(t)).length
    const score = covered / content.length - special * 0.3 - f.name.length / 2000
    if (!best || score > best.score) best = { f, score }
  }
  return best && best.score >= 0.25 ? best.f : undefined
}

// ---------- Portioner ----------

/** Gram per enhet för vanliga livsmedel, efter Livsmedelsverkets huvudord (första ordet i namnet). */
const PORTIONS: Array<[RegExp, Partial<Record<Unit, number>>, [Unit, number]]> = [
  [/^ägg$/, { st: 55 }, ['st', 1]],
  [/^banan/, { st: 120 }, ['st', 1]],
  [/^äpple/, { st: 150 }, ['st', 1]],
  [/^(apelsin|päron|nektarin|persika)/, { st: 150 }, ['st', 1]],
  [/^(clementin|mandarin|satsuma)/, { st: 70 }, ['st', 1]],
  [/^kiwi/, { st: 75 }, ['st', 1]],
  [/^avokado/, { st: 150 }, ['st', 0.5]],
  [/^tomat$/, { st: 90 }, ['st', 1]],
  [/^paprika/, { st: 150 }, ['st', 0.5]],
  [/^morot/, { st: 70 }, ['st', 1]],
  [/^(lök|gul lök|rödlök)/, { st: 100 }, ['st', 0.5]],
  [/^potatis/, { st: 80 }, ['st', 2]],
  [/^(bröd|limpa|rostbröd|formbröd)/, { skiva: 35 }, ['skiva', 1]],
  [/^knäckebröd/, { skiva: 13 }, ['skiva', 2]],
  [/^(kanelbulle|vetebulle|bulle|kardemummabulle)/, { st: 70 }, ['st', 1]],
  [/^köttbull/, { st: 15 }, ['st', 8]],
  [/^fiskpinn/, { st: 25 }, ['st', 6]],
  [/^(korv|varmkorv|grillkorv|falukorv)/, { st: 60 }, ['st', 2]],
  [/^(ost|hårdost|prästost|herrgårdsost)/, { skiva: 10 }, ['skiva', 2]],
  [/^(smör|margarin|bordsmargarin|matfett)/, { msk: 14, tsk: 5 }, ['tsk', 1]],
  [/^(olja|rapsolja|olivolja|solrosolja)/, { msk: 13, tsk: 4.5, dl: 90 }, ['msk', 1]],
  [/^(havregryn|gryn)/, { dl: 35 }, ['dl', 1]],
  [/^(müsli|granola)/, { dl: 40 }, ['dl', 1]],
  [/^(flingor|cornflakes)/, { dl: 12 }, ['dl', 2]],
  [/^(socker|strösocker)/, { dl: 85, msk: 13, tsk: 4 }, ['tsk', 1]],
  [/^(vetemjöl|mjöl)/, { dl: 60 }, ['dl', 1]],
  [/^(honung|sylt|marmelad)/, { msk: 20, tsk: 7 }, ['msk', 1]],
  [/^(ris|pasta|makaroner|spagetti|bulgur|couscous|matvete)/, { dl: 70 }, ['g', 150]],
]

/** Huvudord för drycker och flytande livsmedel (≈ 1 g per ml). */
const LIQUID = /^(mjölk|mellanmjölk|lättmjölk|standardmjölk|filmjölk|fil|yoghurt|drickyoghurt|juice|apelsinjuice|dryck|havredryck|sojadryck|läsk|lemonad|saft|öl|vin|cider|kaffe|te|buljong|soppa|grädde|vispgrädde|matlagningsgrädde|kakao|choklad dryck|smoothie|vatten|sportdryck|energidryck|nyponsoppa|blåbärssoppa)$/

function unitsFor(f: LvFood): { units: Partial<Record<Unit, number>>; def: [Unit, number]; liquid: boolean } {
  const head = f.tokens[0] ?? ''
  const liquid = LIQUID.test(head)
  const p = PORTIONS.find(([re]) => re.test(head))
  const units: Partial<Record<Unit, number>> = { g: 1, ...(liquid ? { ml: 1, dl: 100 } : {}), ...(p?.[1] ?? {}) }
  if (units.dl !== undefined) {
    units.msk ??= Math.round(units.dl * 0.15 * 10) / 10
    units.tsk ??= Math.round(units.dl * 0.05 * 10) / 10
  }
  const def: [Unit, number] = p?.[2] ?? (liquid ? ['dl', 2] : ['g', 100])
  return { units, def, liquid }
}

/** Gör om till samma form som den inbyggda listan, så att mängd och enhet fungerar likadant. */
export function lvToDbFood(f: LvFood): DbFood & { lvNr: number } {
  const { units, def, liquid } = unitsFor(f)
  return { name: f.name, aliases: [], per100: f.per100, units, defaultUnit: def[0], defaultAmount: def[1], liquid, lvNr: f.nr }
}

// ---------- AI-tolkning ----------

const VOLUME_ML: Partial<Record<Unit, number>> = { ml: 1, krm: 1, tsk: 5, msk: 15, dl: 100 }

/** Vikt i gram för ett AI-förslag: AI:ns egen uppskattning, eller omräknad från enheten. */
function gramsOf(item: AiFoodItem, f: LvFood): number | undefined {
  if (item.grams && item.grams > 0) return item.grams
  if (item.unit === 'g') return item.amount
  const { units, liquid } = unitsFor(f)
  if (units[item.unit] !== undefined) return item.amount * units[item.unit]!
  if (liquid && VOLUME_ML[item.unit] !== undefined) return item.amount * VOLUME_ML[item.unit]!
  return undefined
}

/**
 * Hämtar näringsvärden från Livsmedelsverket när AI:ns livsmedel har en säker träff.
 * Mängden behålls; kalorier, protein, fett och kolhydrater räknas fram ur databasen.
 * Vid osäker träff, okänd vikt eller orimlig skillnad mot AI:ns värde behålls AI:ns uppskattning.
 */
export function enrichWithLv(result: AiResult, foods: LvFood[]): AiResult {
  if (!foods.length) return result
  return {
    ...result,
    foods: result.foods.map((item) => {
      const f = matchLv(item.name, foods)
      if (!f) return item
      const g = gramsOf(item, f)
      if (!g) return item
      const k = g / 100
      const kcal = Math.round(f.per100.kcal * k)
      // Skyddsnät mot fel träff: mycket stor skillnad mot AI:ns egen uppskattning.
      if (item.kcal > 20 && (kcal > item.kcal * 3 || kcal < item.kcal / 3)) return item
      const r1 = (x: number) => Math.round(x * k * 10) / 10
      return {
        ...item,
        kcal, protein: r1(f.per100.protein), fat: r1(f.per100.fat), carbs: r1(f.per100.carbs),
        nutritionOrigin: item.amountOrigin === 'osakert' ? 'osakert' : 'beraknat',
        note: [`Livsmedelsverket: ${f.name}`, item.note].filter(Boolean).join(' · '),
      }
    }),
  }
}
