import { addDays, mealForTime } from '../dates'
import { estimateWorkoutKcal } from '../exercise'
import { findFoodInText, nutritionFor, type DbFood } from '../foodDb'
import { MEAL_LABEL } from '../labels'
import type { ActivityType, AiFoodItem, AiResult, AiWorkoutItem, Intensity, MealType, Unit, ValueOrigin } from '../types'

/**
 * Lokal, regelbaserad tolkning utan nätverk. Den förstår enkla svenska meningar med mängd + enhet +
 * livsmedel ur den inbyggda livsmedelslistan, samt träning med tid och aktivitet. Allt markeras som
 * uppskattat och visas i granskningsvyn innan något sparas.
 */

const NUMBER_WORDS: Record<string, number> = {
  en: 1, ett: 1, ena: 1, två: 2, tva: 2, tre: 3, fyra: 4, fem: 5, sex: 6, sju: 7, åtta: 8, nio: 9, tio: 10,
  elva: 11, tolv: 12, femton: 15, tjugo: 20, trettio: 30, fyrtio: 40, femtio: 50, sextio: 60, nittio: 90,
  halv: 0.5, halva: 0.5, halvt: 0.5, kvarts: 0.25, par: 2, några: 3, nagra: 3,
}

const UNIT_WORDS: Array<[RegExp, Unit | 'kg' | 'cl' | 'l']> = [
  [/^(g|gr|gram)$/, 'g'], [/^kg|kilo$/, 'kg'], [/^(ml|milliliter)$/, 'ml'], [/^(cl|centiliter)$/, 'cl'],
  [/^(dl|deciliter)$/, 'dl'], [/^(l|liter)$/, 'l'],
  [/^(msk|matsked|matskedar)$/, 'msk'], [/^(tsk|tesked|teskedar)$/, 'tsk'], [/^(krm|kryddmått)$/, 'krm'],
  [/^(st|styck|stycken)$/, 'st'], [/^(skiva|skivor)$/, 'skiva'], [/^(portion|portioner|tallrik|tallrikar)$/, 'portion'],
  [/^(glas|kopp|koppar|burk|burkar|flaska|flaskor|bit|bitar|näve|nävar|skopa|skopor|scoop)$/, 'st'],
]

const ACTIVITY_PATTERNS: Array<[RegExp, ActivityType, string?]> = [
  [/crosstrainer|cross-trainer|crossträn/, 'crosstrainer'],
  [/\bgym|styrketräning|styrka|lyfte|vikter/, 'gym'],
  [/fotboll|match|futsal/, 'fotboll'],
  [/löp|sprang|jogg|springa/, 'lopning'],
  [/cykl|spinning|cykel/, 'cykling'],
  [/sim(ma|made|ning)|simhall/, 'simning'],
  [/promenad|promenera|gick|vandr|walk/, 'promenad'],
  [/padel|tennis|innebandy|yoga|dans|hockey|golf|klättr/, 'annat'],
]

function wordNum(tok: string): number | undefined {
  const t = tok.replace(',', '.')
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); return b ? a / b : undefined }
  return NUMBER_WORDS[tok]
}

function detectMeal(text: string, nowTime: string): { meal: MealType; explicit: boolean } {
  const t = text.toLowerCase()
  if (/frukost/.test(t)) return { meal: 'frukost', explicit: true }
  if (/lunch/.test(t)) return { meal: 'lunch', explicit: true }
  if (/middag|kvällsmat|kvallsmat/.test(t)) return { meal: 'middag', explicit: true }
  if (/mellanmål|mellanmal|fika|kvällsfika/.test(t)) return { meal: 'mellanmal', explicit: true }
  return { meal: mealForTime(nowTime), explicit: false }
}

function detectDate(text: string, today: string): string | undefined {
  const t = text.toLowerCase()
  if (/\bi förrgår\b|\bförrgår/.test(t)) return addDays(today, -2)
  if (/\bigår\b|\bi går\b/.test(t)) return addDays(today, -1)
  return undefined
}

function detectIntensity(seg: string): { intensity: Intensity; explicit: boolean } {
  if (/lätt|låg|lugn|lugnt|easy|återhämt/.test(seg)) return { intensity: 'lag', explicit: true }
  if (/hård|hårt|hög|tung|tungt|intensiv|intervall|max/.test(seg)) return { intensity: 'hog', explicit: true }
  if (/medel|måttlig|lagom|medelintensi/.test(seg)) return { intensity: 'medel', explicit: true }
  return { intensity: 'medel', explicit: false }
}

function parseDuration(seg: string): number | undefined {
  const s = seg.replace(',', '.')
  let total = 0
  let found = false
  const h = /(\d+(?:\.\d+)?|en|ett|två|tre|halv)\s*(?:h|tim|timme|timmar)\b/.exec(s)
  if (h) { total += (wordNum(h[1]) ?? 0) * 60; found = true }
  if (/en och en halv timme|1,5 timme/.test(seg)) { total = 90; found = true }
  else if (/halvtimme/.test(seg) && !h) { total += 30; found = true }
  const m = /(\d+)\s*(?:min|minuter|minuters|m)\b/.exec(s)
  if (m) { total += Number(m[1]); found = true }
  return found ? Math.round(total) : undefined
}

function splitSegments(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/[\n;]|,(?!\d)|\.(?!\d)|(?<!\p{L})(?:och sedan|och sen|sedan|sen|och|samt|plus)(?!\p{L})|\+/iu)
    .map((s) => s.trim())
    .filter((s) => /[a-zåäö]{2,}/i.test(s))
}

interface QtyGuess { amount?: number; unit?: Unit | 'kg' | 'cl' | 'l'; vague: boolean }

function quantityBefore(segment: string, index: number): QtyGuess {
  const before = segment.slice(0, index).toLowerCase().replace(/[.,!?]/g, (c) => (c === ',' ? ',' : ' '))
  const toks = before.split(/\s+/).filter(Boolean).slice(-4)
  let amount: number | undefined
  let unit: QtyGuess['unit']
  let vague = false
  for (let k = 0; k < toks.length; k++) {
    let tok = toks[k]
    // "30g" / "2dl"
    const glued = /^(\d+(?:[.,]\d+)?)([a-zåäö]+)$/.exec(tok)
    if (glued) { amount = Number(glued[1].replace(',', '.')); tok = glued[2] }
    const n = wordNum(tok)
    if (n !== undefined && !glued) {
      // "en halv" → 0,5 ; "två och en halv" hanteras inte (sällsynt)
      if (amount !== undefined && n === 0.5 && amount === 1) amount = 0.5
      else if (amount === undefined || tok !== 'en') amount = n
      continue
    }
    for (const [re, u] of UNIT_WORDS) if (re.test(tok)) unit = u
    if (/^(lite|lite grann|skvätt|klick|nypa|några)$/.test(tok)) vague = true
  }
  return { amount, unit, vague }
}

function resolveAmount(food: DbFood, q: QtyGuess): { amount: number; unit: Unit; origin: ValueOrigin } {
  let amount = q.amount
  let unit = q.unit
  if (unit === 'kg') { unit = 'g'; amount = (amount ?? 1) * 1000 }
  if (unit === 'cl') { unit = food.liquid ? 'ml' : 'g'; amount = (amount ?? 1) * 10 }
  if (unit === 'l') { unit = food.liquid ? 'ml' : 'g'; amount = (amount ?? 1) * 1000 }
  if (unit && food.units[unit as Unit] !== undefined) {
    return { amount: amount ?? 1, unit: unit as Unit, origin: amount !== undefined ? 'angivet' : 'uppskattat' }
  }
  if (q.vague) {
    const smallUnit = (['tsk', 'msk', 'skiva', 'st'] as Unit[]).find((u) => food.units[u] !== undefined)
    if (smallUnit) return { amount: 1, unit: smallUnit, origin: 'osakert' }
    return { amount: food.defaultAmount * 0.5, unit: food.defaultUnit, origin: 'osakert' }
  }
  if (amount !== undefined && !unit) {
    // Ett tal utan enhet: "tre ägg" → st om det finns, annars standardenheten.
    const u: Unit = food.units.st !== undefined ? 'st' : food.units.skiva !== undefined ? 'skiva' : food.units.portion !== undefined ? 'portion' : food.defaultUnit
    return { amount, unit: u, origin: 'angivet' }
  }
  return { amount: food.defaultAmount, unit: food.defaultUnit, origin: 'uppskattat' }
}

export interface LocalParseContext {
  today: string
  now: string
  weightKg?: number
}

export function parseLocally(text: string, ctx: LocalParseContext): AiResult {
  const result: AiResult = { foods: [], workouts: [], assumptions: [], uncertainties: [] }
  const date = detectDate(text, ctx.today)
  const { meal, explicit: mealExplicit } = detectMeal(text, ctx.now)
  let unknown: string | undefined
  let missingAmountFor: string | undefined

  for (const seg of splitSegments(text)) {
    const lower = seg.toLowerCase()
    const act = ACTIVITY_PATTERNS.find(([re]) => re.test(lower))
    const duration = parseDuration(lower)
    if (act && (duration !== undefined || !findFoodInText(lower))) {
      const { intensity, explicit } = detectIntensity(lower)
      const dur = duration ?? (act[1] === 'fotboll' ? 90 : 30)
      const w: AiWorkoutItem = {
        activity: act[1],
        label: act[1] === 'annat' ? capitalizeFirst(seg.replace(/^(idag|igår|sen|sedan)\s+/i, '').slice(0, 40)) : act[1] === 'fotboll' && /match/.test(lower) ? 'Fotbollsmatch' : undefined,
        durationMin: dur,
        intensity,
        kcal: ctx.weightKg ? estimateWorkoutKcal(act[1], intensity, dur, ctx.weightKg) : undefined,
        date,
        durationOrigin: duration !== undefined ? 'angivet' : 'osakert',
        kcalOrigin: 'uppskattat',
        note: explicit ? undefined : 'Intensitet antagen: medel',
      }
      const dist = /(\d+(?:[.,]\d+)?)\s*(?:km|kilometer)/.exec(lower)
      if (dist) w.distanceKm = Number(dist[1].replace(',', '.'))
      result.workouts.push(w)
      if (duration === undefined) result.uncertainties.push(`Varaktighet för ${seg.trim()} saknas – antog ${dur} minuter.`)
      continue
    }
    // Mat: dela vidare på "med" (t.ex. "knäckebröd med skinka")
    for (const part of seg.split(/(?<!\p{L})med(?!\p{L})/iu).map((s) => s.trim()).filter((s) => /[a-zåäö]{2,}/i.test(s))) {
      const hit = findFoodInText(part)
      if (!hit) {
        if (/^(till |idag|igår|jag |åt |drack |hade )*(frukost|lunch|middag|mellanmål)?$/i.test(part.trim())) continue
        const cleaned = part.replace(/^(till (frukost|lunch|middag|mellanmål)\s*)?(åt|drack|hade|käkade)?\s*(jag)?\s*/i, '').trim()
        if (cleaned.length < 2 || /^(idag|igår|jag|lite|också|även)$/i.test(cleaned)) continue
        result.foods.push({
          name: capitalizeFirst(cleaned), amount: 1, unit: 'portion', kcal: 0, protein: 0, meal: guessMeal(cleaned, meal), date,
          amountOrigin: 'osakert', nutritionOrigin: 'osakert', note: 'Hittade inget näringsvärde – fyll i kcal och protein.',
        })
        unknown ??= cleaned
        continue
      }
      const q = quantityBefore(part, hit.index)
      const r = resolveAmount(hit.food, q)
      const n = nutritionFor(hit.food, r.amount, r.unit)!
      result.foods.push({
        name: hit.food.name, amount: r.amount, unit: r.unit, ...n, meal: hit.food.liquid && !mealExplicit ? 'dryck' : meal, date,
        amountOrigin: r.origin, nutritionOrigin: 'uppskattat',
        note: r.origin === 'osakert' ? 'Mängd tolkad som en liten mängd' : undefined,
      })
      if (r.origin === 'uppskattat' && n.kcal >= 250) missingAmountFor ??= hit.food.name.toLowerCase()
    }
  }

  if (result.foods.length) {
    result.assumptions.push(mealExplicit ? `Måltid: ${MEAL_LABEL[meal]}.` : `Måltid gissad utifrån klockslaget: ${MEAL_LABEL[meal]}.`)
    result.assumptions.push('Näringsvärden är typvärden från appens inbyggda livsmedelslista.')
  }
  if (result.workouts.length && !ctx.weightKg) result.uncertainties.push('Ingen vikt registrerad – kan inte uppskatta träningskalorier.')
  if (date) result.assumptions.push(`Datum tolkat som ${date}.`)
  if (unknown) result.followUpQuestion = `Vad innehöll "${unknown}" ungefär, och hur mycket?`
  else if (missingAmountFor) result.followUpQuestion = `Ungefär hur mycket ${missingAmountFor} var det? Jag har antagit en vanlig portion.`
  return result
}

function guessMeal(name: string, fallback: MealType): MealType {
  return /dricka|juice|läsk|kaffe|te\b|öl|vin/.test(name.toLowerCase()) ? 'dryck' : fallback
}

function capitalizeFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export type { AiFoodItem }
