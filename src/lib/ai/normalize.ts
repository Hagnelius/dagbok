import { ACTIVITIES, MEALS, UNITS, type AiFoodItem, type AiResult, type AiWorkoutItem, type ActivityType, type Intensity, type MealType, type Unit, type ValueOrigin } from '../types'
import { isDateKey, isTime } from '../dates'

const ORIGINS: ValueOrigin[] = ['angivet', 'beraknat', 'uppskattat', 'osakert']
const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : undefined }
  return undefined
}
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : undefined)
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)

const UNIT_ALIASES: Record<string, Unit> = { gram: 'g', gr: 'g', st: 'st', styck: 'st', stycken: 'st', skivor: 'skiva', portioner: 'portion', matsked: 'msk', tesked: 'tsk', milliliter: 'ml', deciliter: 'dl' }
const MEAL_ALIASES: Record<string, MealType> = { breakfast: 'frukost', dinner: 'middag', snack: 'mellanmal', mellanmål: 'mellanmal', drink: 'dryck', kvällsmat: 'middag' }
const ACT_ALIASES: Record<string, ActivityType> = { löpning: 'lopning', running: 'lopning', walking: 'promenad', cycling: 'cykling', swimming: 'simning', football: 'fotboll', soccer: 'fotboll', other: 'annat' }
const INT_ALIASES: Record<string, Intensity> = { låg: 'lag', low: 'lag', medium: 'medel', moderate: 'medel', hög: 'hog', high: 'hog' }

/**
 * Validerar och normaliserar ett AI-svar (från server eller inklistrat). Allt okänt rensas bort,
 * så att ett felaktigt eller manipulerat svar aldrig kan skapa ogiltiga poster.
 */
export function normalizeAiResult(raw: unknown): AiResult {
  let obj = raw
  if (typeof raw === 'string') obj = parseJsonLoose(raw)
  if (!obj || typeof obj !== 'object') throw new Error('Svaret innehåller ingen giltig JSON.')
  const o = obj as Record<string, unknown>
  const grams = (v: unknown) => { const g = num(v); return g !== undefined && g > 0 && g <= 5000 ? Math.round(g) : undefined }
  const foods: AiFoodItem[] = (Array.isArray(o.foods) ? o.foods : []).slice(0, 40).flatMap((f): AiFoodItem[] => {
    if (!f || typeof f !== 'object') return []
    const x = f as Record<string, unknown>
    const name = str(x.name)
    if (!name) return []
    const unitRaw = String(x.unit ?? 'g').toLowerCase()
    const mealRaw = String(x.meal ?? '').toLowerCase()
    return [{
      name,
      amount: Math.max(0, num(x.amount) ?? 1),
      unit: UNIT_ALIASES[unitRaw] ?? pick(unitRaw, UNITS, 'portion'),
      grams: grams(x.grams),
      kcal: Math.max(0, Math.round(num(x.kcal) ?? 0)),
      protein: Math.max(0, Math.round((num(x.protein) ?? 0) * 10) / 10),
      fat: num(x.fat),
      carbs: num(x.carbs),
      meal: MEAL_ALIASES[mealRaw] ?? pick(mealRaw, MEALS, 'mellanmal'),
      date: isDateKey(x.date) ? x.date : undefined,
      time: isTime(x.time) ? x.time : undefined,
      amountOrigin: pick(x.amountOrigin, ORIGINS, 'uppskattat'),
      nutritionOrigin: pick(x.nutritionOrigin, ORIGINS, 'uppskattat'),
      note: str(x.note),
    }]
  })
  const workouts: AiWorkoutItem[] = (Array.isArray(o.workouts) ? o.workouts : []).slice(0, 20).flatMap((w): AiWorkoutItem[] => {
    if (!w || typeof w !== 'object') return []
    const x = w as Record<string, unknown>
    const actRaw = String(x.activity ?? '').toLowerCase()
    const intRaw = String(x.intensity ?? '').toLowerCase()
    const dur = num(x.durationMin)
    if (!dur || dur <= 0) return []
    return [{
      activity: ACT_ALIASES[actRaw] ?? pick(actRaw, ACTIVITIES, 'annat'),
      label: str(x.label),
      durationMin: Math.round(dur),
      intensity: INT_ALIASES[intRaw] ?? pick(intRaw, ['lag', 'medel', 'hog'] as const, 'medel'),
      kcal: num(x.kcal) !== undefined ? Math.round(num(x.kcal)!) : undefined,
      date: isDateKey(x.date) ? x.date : undefined,
      time: isTime(x.time) ? x.time : undefined,
      distanceKm: num(x.distanceKm),
      avgHr: num(x.avgHr),
      note: str(x.note),
      durationOrigin: pick(x.durationOrigin, ORIGINS, 'angivet'),
      kcalOrigin: pick(x.kcalOrigin, ORIGINS, 'uppskattat'),
    }]
  })
  const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((s): s is string => !!s).slice(0, 10) : [])
  return { foods, workouts, assumptions: strs(o.assumptions), uncertainties: strs(o.uncertainties), followUpQuestion: str(o.followUpQuestion) }
}

/** Plockar ut JSON även om svaret är inlindat i text eller ```json-block. */
export function parseJsonLoose(s: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s)
  const body = fence ? fence[1] : s
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Hittade ingen JSON i texten.')
  return JSON.parse(body.slice(start, end + 1))
}
