import { db, nowIso, uid } from './db'
import { addDays, todayKey } from './dates'
import { estimateWorkoutKcal } from './exercise'
import type { FoodEntry, Measurement, Workout } from './types'

/**
 * Syntetiska testdata för demoläget. Alla rader märks med isDemo: true och kan tas bort
 * med clearDemoData() utan att riktiga registreringar påverkas.
 */
const MEALS: Array<[FoodEntry['meal'], string, number, number, string]> = [
  ['frukost', 'Havregrynsgröt med mjölk', 330, 14, '08:00'],
  ['frukost', 'Kvarg med blåbär', 220, 28, '08:05'],
  ['lunch', 'Kycklinggryta med ris', 650, 45, '12:00'],
  ['lunch', 'Laxsallad', 540, 36, '12:15'],
  ['mellanmal', 'Proteinbar', 210, 20, '15:30'],
  ['mellanmal', 'Banan', 115, 1, '15:00'],
  ['middag', 'Köttfärssås med pasta', 720, 42, '18:30'],
  ['middag', 'Torsk med potatis', 520, 40, '18:00'],
  ['dryck', 'Kaffe latte', 135, 9, '10:00'],
]

function rand(seed: number) {
  let s = seed
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

export async function loadDemoData(days = 28) {
  const r = rand(42)
  const today = todayKey()
  const t = nowIso()
  const entries: FoodEntry[] = []
  const workouts: Workout[] = []
  const measurements: Measurement[] = []
  let weight = 92
  for (let i = days; i >= 1; i--) {
    const date = addDays(today, -i)
    if (r() < 0.12) continue // några dagar utan registrering
    const picks = [MEALS[r() < 0.5 ? 0 : 1], MEALS[r() < 0.5 ? 2 : 3], MEALS[r() < 0.5 ? 4 : 5], MEALS[r() < 0.5 ? 6 : 7]]
    if (r() < 0.6) picks.push(MEALS[8])
    for (const [meal, name, kcal, protein, time] of picks) {
      const f = 0.85 + r() * 0.35
      entries.push({ id: uid(), date, time, meal, name, amount: 1, unit: 'portion', kcal: Math.round(kcal * f), protein: Math.round(protein * f), source: 'manuell', isDemo: true, createdAt: t, updatedAt: t })
    }
    if (r() < 0.55) {
      const kinds: Array<[Workout['activity'], number]> = [['crosstrainer', 45], ['gym', 60], ['cykling', 45], ['promenad', 40]]
      const [activity, dur] = kinds[Math.floor(r() * kinds.length)]
      workouts.push({ id: uid(), date, activity, durationMin: dur, intensity: 'medel', kcal: estimateWorkoutKcal(activity, 'medel', dur, weight), kcalEstimated: true, source: 'manuell', isDemo: true, createdAt: t, updatedAt: t })
    }
    weight += -0.08 + (r() - 0.5) * 0.6
    if (r() < 0.7) measurements.push({ id: uid(), date, time: '07:00', weightKg: Math.round(weight * 10) / 10, isDemo: true, createdAt: t, updatedAt: t })
  }
  await db.transaction('rw', db.entries, db.workouts, db.measurements, async () => {
    await db.entries.bulkAdd(entries)
    await db.workouts.bulkAdd(workouts)
    await db.measurements.bulkAdd(measurements)
  })
}

export async function clearDemoData() {
  await db.transaction('rw', [db.entries, db.workouts, db.measurements, db.foods, db.mealTemplates, db.recipes, db.workoutTemplates, db.dayNotes], async () => {
    await db.entries.filter((x) => !!x.isDemo).delete()
    await db.workouts.filter((x) => !!x.isDemo).delete()
    await db.measurements.filter((x) => !!x.isDemo).delete()
    await db.foods.filter((x) => !!x.isDemo).delete()
    await db.mealTemplates.filter((x) => !!x.isDemo).delete()
    await db.recipes.filter((x) => !!x.isDemo).delete()
    await db.workoutTemplates.filter((x) => !!x.isDemo).delete()
    await db.dayNotes.filter((x) => !!x.isDemo).delete()
  })
}

export async function hasDemoData(): Promise<boolean> {
  return (await db.entries.filter((x) => !!x.isDemo).count()) + (await db.measurements.filter((x) => !!x.isDemo).count()) > 0
}

/** Startförslag på snabbval som skapas efter introduktionen (riktiga, redigerbara favoriter – inte demodata). */
export async function seedStarterLibrary() {
  if ((await db.foods.count()) + (await db.mealTemplates.count()) + (await db.workoutTemplates.count()) > 0) return
  const t = nowIso()
  const base = { favorite: true, useCount: 0, createdAt: t, updatedAt: t }
  await db.foods.bulkAdd([
    { ...base, id: uid(), sortOrder: 0, name: 'Proteinshake', amount: 1, unit: 'portion', kcal: 115, protein: 23, fat: 2, carbs: 2 },
    { ...base, id: uid(), sortOrder: 1, name: 'Proteinbar', amount: 1, unit: 'st', kcal: 210, protein: 20, fat: 7, carbs: 18 },
    { ...base, id: uid(), sortOrder: 2, name: 'Banan', amount: 1, unit: 'st', kcal: 115, protein: 1.4, fat: 0.4, carbs: 25 },
    { ...base, id: uid(), sortOrder: 3, name: 'Ägg', amount: 1, unit: 'st', kcal: 77, protein: 6.9, fat: 5.3, carbs: 0.2 },
    { ...base, id: uid(), sortOrder: 4, name: 'Popcorn', amount: 1, unit: 'portion', kcal: 145, protein: 2.7, fat: 7.5, carbs: 16.5 },
    { ...base, id: uid(), sortOrder: 5, name: 'Kaffe med mjölk', amount: 1, unit: 'st', kcal: 25, protein: 1.5, fat: 0.8, carbs: 2.5 },
  ])
  await db.mealTemplates.bulkAdd([
    { ...base, id: uid(), sortOrder: 0, name: 'Min vanliga frukost', meal: 'frukost', items: [
      { id: uid(), name: 'Bröd, fullkorn', amount: 2, unit: 'skiva', kcal: 175, protein: 5.6, fat: 2.1, carbs: 31.5 },
      { id: uid(), name: 'Färskost', amount: 1, unit: 'msk', kcal: 35, protein: 0.9, fat: 3.2, carbs: 0.6 },
      { id: uid(), name: 'Skinka (pålägg)', amount: 8, unit: 'skiva', kcal: 76, protein: 13.7, fat: 2.2, carbs: 0.7 },
      { id: uid(), name: 'Ägg', amount: 1, unit: 'st', kcal: 77, protein: 6.9, fat: 5.3, carbs: 0.2 },
    ] },
    { ...base, id: uid(), sortOrder: 1, name: 'Knäckebröd med skinka', meal: 'mellanmal', items: [
      { id: uid(), name: 'Knäckebröd', amount: 2, unit: 'skiva', kcal: 88, protein: 2.5, fat: 0.5, carbs: 16.9 },
      { id: uid(), name: 'Skinka (pålägg)', amount: 4, unit: 'skiva', kcal: 38, protein: 6.8, fat: 1.1, carbs: 0.4 },
    ] },
  ])
  await db.workoutTemplates.bulkAdd([
    { ...base, id: uid(), sortOrder: 0, name: '45 min crosstrainer', activity: 'crosstrainer', durationMin: 45, intensity: 'medel' },
    { ...base, id: uid(), sortOrder: 1, name: '60 min gym, medel', activity: 'gym', durationMin: 60, intensity: 'medel' },
    { ...base, id: uid(), sortOrder: 2, name: 'Löprunda 30 min', activity: 'lopning', durationMin: 30, intensity: 'medel' },
    { ...base, id: uid(), sortOrder: 3, name: 'Promenad 30 min', activity: 'promenad', durationMin: 30, intensity: 'lag' },
  ])
}
