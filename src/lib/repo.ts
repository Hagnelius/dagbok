import { db, nowIso, uid } from './db'
import { addDays, todayKey } from './dates'
import { scale } from './nutrition'
import { calculateTargets } from './calc'
import { recipeNutrition } from './nutrition'
import {
  DEFAULT_SETTINGS, type Food, type FoodEntry, type Goal, type MealTemplate, type MealType, type Measurement,
  type Profile, type Recipe, type Settings, type Workout, type WorkoutTemplate,
} from './types'

// ---------- Inställningar & profil ----------

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  return { ...DEFAULT_SETTINGS, ...s }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch, id: 'settings' as const }
  await db.settings.put(next)
  return next
}

export async function getProfile(): Promise<Profile | undefined> {
  return db.profile.get('me')
}

/** Sparar profil och skapar en ny målpost som gäller från och med idag (ersätter ev. dagens). */
export async function saveProfileAndGoal(profile: Profile, goal: Omit<Goal, 'id' | 'createdAt' | 'validFrom'>, validFrom = todayKey()) {
  await db.transaction('rw', db.profile, db.goals, async () => {
    await db.profile.put({ ...profile, updatedAt: nowIso() })
    await db.goals.where('validFrom').equals(validFrom).delete()
    await db.goals.add({ ...goal, id: uid(), validFrom, createdAt: nowIso() })
  })
}

/** Räknar om målet när t.ex. träningskaloriläget ändras (bara om målet är beräknat). */
export async function recalcGoalIfCalculated(): Promise<void> {
  const [profile, settings, goals] = await Promise.all([getProfile(), getSettings(), db.goals.toArray()])
  if (!profile) return
  const current = goals.sort((a, b) => a.validFrom.localeCompare(b.validFrom)).at(-1)
  if (!current || current.mode !== 'beraknat') return
  const latestWeight = (await db.measurements.orderBy('date').reverse().filter((m) => !!m.weightKg).first())?.weightKg
  const r = calculateTargets({
    ...profile,
    weightKg: latestWeight ?? profile.startWeightKg,
    exerciseMode: settings.exerciseCalorieMode,
  })
  await saveProfileAndGoal(profile, { mode: 'beraknat', kcal: r.kcal, protein: r.protein, fat: r.fat, carbs: r.carbs, calculation: r.calculation })
}

// ---------- Matposter ----------

export type NewEntry = Omit<FoodEntry, 'id' | 'createdAt' | 'updatedAt'>

export async function addEntries(items: NewEntry[]): Promise<string[]> {
  const t = nowIso()
  const rows: FoodEntry[] = items.map((i) => ({ ...i, id: uid(), createdAt: t, updatedAt: t }))
  await db.entries.bulkAdd(rows)
  return rows.map((r) => r.id)
}

export async function updateEntry(id: string, patch: Partial<FoodEntry>) {
  await db.entries.update(id, { ...patch, updatedAt: nowIso() })
}

export async function deleteEntry(id: string) {
  await db.entries.delete(id)
}

/** Kopierar en post till samma eller annan dag (valfritt med ny mängdfaktor). */
export async function duplicateEntry(id: string, toDate?: string, factor = 1): Promise<string | undefined> {
  const e = await db.entries.get(id)
  if (!e) return
  const { id: _i, createdAt: _c, updatedAt: _u, groupId: _g, ...rest } = e
  void _i; void _c; void _u; void _g
  const n = factor === 1 ? {} : { ...scale(e, factor), amount: Math.round(e.amount * factor * 100) / 100 }
  const [nid] = await addEntries([{ ...rest, ...n, date: toDate ?? e.date, source: 'kopia', sourceId: e.id }])
  return nid
}

/** Kopierar alla poster för en måltid (eller hela dagen om meal saknas) till en annan dag. */
export async function copyEntries(fromDate: string, toDate: string, meal?: MealType, toMeal?: MealType): Promise<number> {
  let list = await db.entries.where('date').equals(fromDate).toArray()
  if (meal) list = list.filter((e) => e.meal === meal)
  const groupMap = new Map<string, string>()
  const items: NewEntry[] = list.map((e) => {
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = e
    void _i; void _c; void _u
    let groupId = rest.groupId
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, uid())
      groupId = groupMap.get(groupId)
    }
    return { ...rest, groupId, date: toDate, meal: toMeal ?? rest.meal, source: 'kopia' as const, sourceId: e.id, isDemo: false }
  })
  await addEntries(items)
  return items.length
}

// ---------- Livsmedel, mallar, recept ----------

async function bump(table: 'foods' | 'mealTemplates' | 'recipes' | 'workoutTemplates', id: string) {
  const t = db[table] as unknown as { get(id: string): Promise<{ useCount: number } | undefined>; update(id: string, p: object): Promise<number> }
  const row = await t.get(id)
  if (row) await t.update(id, { useCount: (row.useCount ?? 0) + 1, lastUsedAt: nowIso() })
}

export async function addFoodToDay(food: Food, date: string, meal: MealType, time: string, portions = 1) {
  const n = scale(food, portions)
  await addEntries([{
    date, time, meal, name: food.name, amount: Math.round(food.amount * portions * 100) / 100, unit: food.unit,
    ...n, source: 'livsmedel', sourceId: food.id, origin: 'angivet',
  }])
  await bump('foods', food.id)
}

/** Lägger till alla ingredienser i en standardmåltid. Mallen påverkas inte. */
export async function addTemplateToDay(t: MealTemplate, date: string, meal: MealType, time: string, factor = 1) {
  const groupId = uid()
  await addEntries(t.items.map((i) => ({
    date, time, meal, name: i.name, amount: Math.round(i.amount * factor * 100) / 100, unit: i.unit,
    ...scale(i, factor), source: 'standardmaltid', sourceId: t.id, groupId, groupName: t.name, origin: 'angivet',
  })))
  await bump('mealTemplates', t.id)
}

export async function addRecipeToDay(r: Recipe, date: string, meal: MealType, time: string, portions: number) {
  const per = recipeNutrition(r.items, r.portions).perPortion
  await addEntries([{
    date, time, meal, name: r.name, amount: portions, unit: 'portion', ...scale(per, portions),
    source: 'recept', sourceId: r.id, origin: 'beraknat',
  }])
  await bump('recipes', r.id)
}

export async function saveFood(f: Partial<Food> & Pick<Food, 'name' | 'amount' | 'unit' | 'kcal' | 'protein'>): Promise<string> {
  const t = nowIso()
  if (f.id) {
    await db.foods.update(f.id, { ...f, updatedAt: t })
    return f.id
  }
  const count = await db.foods.count()
  const row: Food = { favorite: true, sortOrder: count, useCount: 0, ...f, id: uid(), createdAt: t, updatedAt: t }
  await db.foods.add(row)
  return row.id
}

export async function saveMealTemplate(m: Partial<MealTemplate> & Pick<MealTemplate, 'name' | 'items'>): Promise<string> {
  const t = nowIso()
  if (m.id) {
    await db.mealTemplates.update(m.id, { ...m, updatedAt: t })
    return m.id
  }
  const count = await db.mealTemplates.count()
  const row: MealTemplate = { favorite: true, sortOrder: count, useCount: 0, ...m, id: uid(), createdAt: t, updatedAt: t }
  await db.mealTemplates.add(row)
  return row.id
}

export async function saveRecipe(r: Partial<Recipe> & Pick<Recipe, 'name' | 'items' | 'portions'>): Promise<string> {
  const t = nowIso()
  if (r.id) {
    await db.recipes.update(r.id, { ...r, updatedAt: t })
    return r.id
  }
  const count = await db.recipes.count()
  const row: Recipe = { favorite: true, sortOrder: count, useCount: 0, ...r, id: uid(), createdAt: t, updatedAt: t }
  await db.recipes.add(row)
  return row.id
}

export async function saveWorkoutTemplate(w: Partial<WorkoutTemplate> & Pick<WorkoutTemplate, 'name' | 'activity' | 'durationMin' | 'intensity'>): Promise<string> {
  const t = nowIso()
  if (w.id) {
    await db.workoutTemplates.update(w.id, { ...w, updatedAt: t })
    return w.id
  }
  const count = await db.workoutTemplates.count()
  const row: WorkoutTemplate = { favorite: true, sortOrder: count, useCount: 0, ...w, id: uid(), createdAt: t, updatedAt: t }
  await db.workoutTemplates.add(row)
  return row.id
}

export type LibraryTable = 'foods' | 'mealTemplates' | 'recipes' | 'workoutTemplates'

export async function duplicateLibraryItem(table: LibraryTable, id: string) {
  const tbl = db[table] as unknown as { get(id: string): Promise<Record<string, unknown> | undefined>; add(r: object): Promise<unknown>; count(): Promise<number> }
  const row = await tbl.get(id)
  if (!row) return
  const t = nowIso()
  await tbl.add({ ...row, id: uid(), name: `${row.name} (kopia)`, useCount: 0, lastUsedAt: undefined, sortOrder: await tbl.count(), createdAt: t, updatedAt: t })
}

export async function deleteLibraryItem(table: LibraryTable, id: string) {
  await (db[table] as unknown as { delete(id: string): Promise<void> }).delete(id)
}

export async function toggleFavorite(table: LibraryTable, id: string) {
  const tbl = db[table] as unknown as { get(id: string): Promise<{ favorite: boolean } | undefined>; update(id: string, p: object): Promise<number> }
  const row = await tbl.get(id)
  if (row) await tbl.update(id, { favorite: !row.favorite })
}

/** Flyttar ett objekt ett steg upp/ned i den manuella ordningen. */
export async function moveLibraryItem(table: LibraryTable, id: string, dir: -1 | 1) {
  const tbl = db[table] as unknown as { toArray(): Promise<Array<{ id: string; sortOrder: number }>>; update(id: string, p: object): Promise<number> }
  const rows = (await tbl.toArray()).sort((a, b) => a.sortOrder - b.sortOrder)
  const i = rows.findIndex((r) => r.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= rows.length) return
  ;[rows[i], rows[j]] = [rows[j], rows[i]]
  await db.transaction('rw', db[table], async () => {
    for (let k = 0; k < rows.length; k++) await tbl.update(rows[k].id, { sortOrder: k })
  })
}

// ---------- Träning ----------

export type NewWorkout = Omit<Workout, 'id' | 'createdAt' | 'updatedAt'>

export async function addWorkouts(items: NewWorkout[]): Promise<string[]> {
  const t = nowIso()
  const rows = items.map((w) => ({ ...w, id: uid(), createdAt: t, updatedAt: t }))
  await db.workouts.bulkAdd(rows)
  return rows.map((r) => r.id)
}
export async function updateWorkout(id: string, patch: Partial<Workout>) {
  await db.workouts.update(id, { ...patch, updatedAt: nowIso() })
}
export async function deleteWorkout(id: string) {
  await db.workouts.delete(id)
}
export async function duplicateWorkout(id: string, toDate?: string) {
  const w = await db.workouts.get(id)
  if (!w) return
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = w
  void _i; void _c; void _u
  await addWorkouts([{ ...rest, date: toDate ?? w.date, source: 'kopia', isDemo: false }])
}
export async function bumpWorkoutTemplate(id: string) {
  await bump('workoutTemplates', id)
}

// ---------- Mått ----------

export async function addMeasurement(m: Omit<Measurement, 'id' | 'createdAt' | 'updatedAt'>) {
  const t = nowIso()
  await db.measurements.add({ ...m, id: uid(), createdAt: t, updatedAt: t })
}
export async function updateMeasurement(id: string, patch: Partial<Measurement>) {
  await db.measurements.update(id, { ...patch, updatedAt: nowIso() })
}
export async function deleteMeasurement(id: string) {
  await db.measurements.delete(id)
}

// ---------- Dag ----------

export async function saveDayNote(date: string, note: string) {
  if (!note.trim()) await db.dayNotes.delete(date)
  else await db.dayNotes.put({ date, note, updatedAt: nowIso() })
}

/** Fritextsökning i historiken (mat, träning, anteckningar). */
export async function searchHistory(q: string, limit = 60) {
  const s = q.trim().toLowerCase()
  if (!s) return { entries: [] as FoodEntry[], workouts: [] as Workout[] }
  const entries = (await db.entries.filter((e) => e.name.toLowerCase().includes(s) || (e.note ?? '').toLowerCase().includes(s) || (e.groupName ?? '').toLowerCase().includes(s)).toArray())
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)).slice(0, limit)
  const workouts = (await db.workouts.filter((w) => (w.label ?? '').toLowerCase().includes(s) || (w.note ?? '').toLowerCase().includes(s) || w.activity.includes(s)).toArray())
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
  return { entries, workouts }
}

export { addDays }
