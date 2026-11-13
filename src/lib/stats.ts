import { addDays, dateRange } from './dates'
import { sumNutrition } from './nutrition'
import type { ActivityType, FoodEntry, Goal, Measurement, WeighInPolicy, Workout } from './types'

/** Det mål som gällde ett visst datum (senaste med validFrom ≤ datum, annars det äldsta). */
export function goalForDate(goals: Goal[], date: string): Goal | undefined {
  if (goals.length === 0) return undefined
  const sorted = [...goals].sort((a, b) => (a.validFrom === b.validFrom ? a.createdAt.localeCompare(b.createdAt) : a.validFrom.localeCompare(b.validFrom)))
  let found: Goal | undefined
  for (const g of sorted) if (g.validFrom <= date) found = g
  return found ?? sorted[0]
}

// ---------- Vikt ----------

export interface DailyWeight { date: string; weight: number; count: number }

/**
 * Ett värde per dag. Vid flera vägningar samma dag används inställningen:
 * "forsta" = dagens första vägning (standard, mest jämförbar), "senaste" eller "medel".
 */
export function dailyWeights(measurements: Measurement[], policy: WeighInPolicy): DailyWeight[] {
  const byDate = new Map<string, Measurement[]>()
  for (const m of measurements) {
    if (m.weightKg === undefined || m.weightKg === null || !(m.weightKg > 0)) continue
    const list = byDate.get(m.date) ?? []
    list.push(m)
    byDate.set(m.date, list)
  }
  const out: DailyWeight[] = []
  for (const [date, list] of byDate) {
    list.sort((a, b) => a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt))
    let w: number
    if (policy === 'senaste') w = list[list.length - 1].weightKg!
    else if (policy === 'medel') w = list.reduce((s, m) => s + m.weightKg!, 0) / list.length
    else w = list[0].weightKg!
    out.push({ date, weight: Math.round(w * 100) / 100, count: list.length })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Rullande 7-dagarsgenomsnitt för datum: medel av dagliga värden i [datum−6, datum]. */
export function rollingAverage(daily: DailyWeight[], date: string, windowDays = 7): number | undefined {
  const from = addDays(date, -(windowDays - 1))
  const vals = daily.filter((d) => d.date >= from && d.date <= date).map((d) => d.weight)
  if (vals.length === 0) return undefined
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
}

export interface WeightPoint { date: string; weight: number; avg7: number }

export function weightSeries(daily: DailyWeight[], start?: string, end?: string): WeightPoint[] {
  return daily
    .filter((d) => (!start || d.date >= start) && (!end || d.date <= end))
    .map((d) => ({ date: d.date, weight: d.weight, avg7: rollingAverage(daily, d.date)! }))
}

export interface WeightSummary {
  latest?: DailyWeight
  avg7?: number
  start?: number
  changeSinceStart?: number
  change7?: number
  change30?: number
  toGoal?: number
}

/**
 * Förändringar baseras på 7-dagarsgenomsnitt för att dämpa dagliga variationer:
 * förändring N dagar = snitt7(senaste datum) − snitt7(senaste datum − N). Saknas data i det
 * tidigare fönstret blir värdet odefinierat.
 */
export function weightSummary(daily: DailyWeight[], startWeight?: number, goalWeight?: number): WeightSummary {
  if (daily.length === 0) return { start: startWeight }
  const latest = daily[daily.length - 1]
  const avg7 = rollingAverage(daily, latest.date)
  const start = startWeight ?? daily[0].weight
  const prev = (n: number) => {
    const a = rollingAverage(daily, addDays(latest.date, -n))
    return a === undefined || avg7 === undefined ? undefined : Math.round((avg7 - a) * 10) / 10
  }
  return {
    latest,
    avg7,
    start,
    changeSinceStart: Math.round(((avg7 ?? latest.weight) - start) * 10) / 10,
    change7: prev(7),
    change30: prev(30),
    toGoal: goalWeight ? Math.round(((avg7 ?? latest.weight) - goalWeight) * 10) / 10 : undefined,
  }
}

// ---------- Perioder ----------

export interface DayStat {
  date: string
  hasData: boolean
  kcal: number
  protein: number
  kcalGoal?: number
  proteinGoal?: number
  workoutMin: number
  workoutKcal: number
}

export interface PeriodStats {
  start: string
  end: string
  days: DayStat[]
  totalDays: number
  loggedDays: number
  avgKcal?: number
  avgProtein?: number
  avgKcalGoal?: number
  avgProteinGoal?: number
  kcalDiffFromGoal?: number
  proteinGoalHitDays: number
  workoutCount: number
  workoutMinutes: number
  workoutKcal: number
  workoutKcalEstimated: boolean
  byActivity: Array<{ activity: ActivityType; count: number; minutes: number }>
}

/**
 * Statistik för ett datumintervall. Dagar UTAN registrerad mat räknas inte som nolldagar –
 * de exkluderas från snitten. En dag med registreringar som summerar till 0 kcal räknas däremot.
 * `excludeDates` används t.ex. för att inte låta en pågående dag (idag) dra ner veckosnittet.
 */
export function periodStats(
  entries: FoodEntry[], workouts: Workout[], goals: Goal[], start: string, end: string,
  opts: { excludeDates?: string[] } = {},
): PeriodStats {
  const exclude = new Set(opts.excludeDates ?? [])
  const entriesByDate = new Map<string, FoodEntry[]>()
  for (const e of entries) {
    if (e.date < start || e.date > end) continue
    const l = entriesByDate.get(e.date) ?? []
    l.push(e)
    entriesByDate.set(e.date, l)
  }
  const wByDate = new Map<string, Workout[]>()
  const inRangeWorkouts = workouts.filter((w) => w.date >= start && w.date <= end)
  for (const w of inRangeWorkouts) {
    const l = wByDate.get(w.date) ?? []
    l.push(w)
    wByDate.set(w.date, l)
  }
  const days: DayStat[] = dateRange(start, end).map((date) => {
    const list = entriesByDate.get(date) ?? []
    const t = sumNutrition(list)
    const g = goalForDate(goals, date)
    const ws = wByDate.get(date) ?? []
    return {
      date,
      hasData: list.length > 0,
      kcal: t.kcal,
      protein: t.protein,
      kcalGoal: g?.kcal,
      proteinGoal: g?.protein,
      workoutMin: ws.reduce((s, w) => s + w.durationMin, 0),
      workoutKcal: ws.reduce((s, w) => s + (w.kcal ?? 0), 0),
    }
  })
  const logged = days.filter((d) => d.hasData && !exclude.has(d.date))
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
  const avgKcal = avg(logged.map((d) => d.kcal))
  const avgProtein = avg(logged.map((d) => d.protein))
  const withGoal = logged.filter((d) => d.kcalGoal !== undefined)
  const avgKcalGoal = avg(withGoal.map((d) => d.kcalGoal!))
  const avgProteinGoal = avg(logged.filter((d) => d.proteinGoal !== undefined).map((d) => d.proteinGoal!))
  const byAct = new Map<ActivityType, { activity: ActivityType; count: number; minutes: number }>()
  for (const w of inRangeWorkouts) {
    const a = byAct.get(w.activity) ?? { activity: w.activity, count: 0, minutes: 0 }
    a.count++
    a.minutes += w.durationMin
    byAct.set(w.activity, a)
  }
  return {
    start, end, days,
    totalDays: days.length,
    loggedDays: logged.length,
    avgKcal: avgKcal === undefined ? undefined : Math.round(avgKcal),
    avgProtein: avgProtein === undefined ? undefined : Math.round(avgProtein),
    avgKcalGoal: avgKcalGoal === undefined ? undefined : Math.round(avgKcalGoal),
    avgProteinGoal: avgProteinGoal === undefined ? undefined : Math.round(avgProteinGoal),
    kcalDiffFromGoal: avgKcal !== undefined && avgKcalGoal !== undefined ? Math.round(avgKcal - avgKcalGoal) : undefined,
    proteinGoalHitDays: logged.filter((d) => d.proteinGoal !== undefined && d.protein >= d.proteinGoal).length,
    workoutCount: inRangeWorkouts.length,
    workoutMinutes: inRangeWorkouts.reduce((s, w) => s + w.durationMin, 0),
    workoutKcal: inRangeWorkouts.reduce((s, w) => s + (w.kcal ?? 0), 0),
    workoutKcalEstimated: inRangeWorkouts.some((w) => w.kcalEstimated && w.kcal),
    byActivity: [...byAct.values()].sort((a, b) => b.minutes - a.minutes),
  }
}
