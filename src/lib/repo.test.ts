import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addEntries, addTemplateToDay, copyEntries, deleteEntry, duplicateEntry, saveMealTemplate, updateEntry } from './repo'
import { sumNutrition } from './nutrition'
import { clearAll, exportAll, importBackup, validateBackup, exportCsv } from './backup'
import { saveInterpretation, acceptInterpretation } from './ai/commit'
import { parseLocally } from './ai/localParser'
import { normalizeAiResult } from './ai/normalize'

const dayTotal = async (date: string) => sumNutrition(await db.entries.where('date').equals(date).toArray())
const base = { time: '12:00', meal: 'lunch' as const, amount: 1, unit: 'st' as const, source: 'manuell' as const }

beforeEach(async () => { await clearAll() })

describe('registrering', () => {
  it('redigering och borttagning uppdaterar totalsummorna', async () => {
    const [a] = await addEntries([{ ...base, date: '2026-11-10', name: 'A', kcal: 500, protein: 30 }, { ...base, date: '2026-11-10', name: 'B', kcal: 300, protein: 20 }])
    expect((await dayTotal('2026-11-10')).kcal).toBe(800)
    await updateEntry(a, { kcal: 600, protein: 40 })
    expect(await dayTotal('2026-11-10')).toMatchObject({ kcal: 900, protein: 60 })
    await deleteEntry(a)
    expect(await dayTotal('2026-11-10')).toMatchObject({ kcal: 300, protein: 20 })
  })
  it('kopierar måltid och hel dag mellan dagar', async () => {
    await addEntries([
      { ...base, date: '2026-11-09', name: 'Gröt', meal: 'frukost', kcal: 300, protein: 12 },
      { ...base, date: '2026-11-09', name: 'Lunch', kcal: 600, protein: 40 },
    ])
    expect(await copyEntries('2026-11-09', '2026-11-10', 'frukost')).toBe(1)
    expect((await dayTotal('2026-11-10')).kcal).toBe(300)
    expect(await copyEntries('2026-11-09', '2026-11-11')).toBe(2)
    expect((await dayTotal('2026-11-11')).kcal).toBe(900)
    expect((await dayTotal('2026-11-09')).kcal).toBe(900) // originalet orört
  })
  it('duplicerar post med ny mängd', async () => {
    const [a] = await addEntries([{ ...base, date: '2026-11-10', name: 'Ris', amount: 100, unit: 'g', kcal: 130, protein: 2.7 }])
    await duplicateEntry(a, '2026-11-12', 2)
    const copy = (await db.entries.where('date').equals('2026-11-12').toArray())[0]
    expect(copy).toMatchObject({ amount: 200, kcal: 260, protein: 5.4, source: 'kopia' })
  })
  it('standardmåltid registrerar alla ingredienser utan att mallen ändras', async () => {
    const id = await saveMealTemplate({ name: 'Frukost', items: [
      { id: '1', name: 'Bröd', amount: 2, unit: 'skiva', kcal: 175, protein: 5.6 },
      { id: '2', name: 'Skinka', amount: 8, unit: 'skiva', kcal: 76, protein: 13.7 },
    ] })
    const t = (await db.mealTemplates.get(id))!
    await addTemplateToDay(t, '2026-11-10', 'frukost', '08:00', 1.5)
    const rows = await db.entries.where('date').equals('2026-11-10').toArray()
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.groupId)).size).toBe(1)
    expect((await dayTotal('2026-11-10')).kcal).toBe(Math.round(175 * 1.5) + Math.round(76 * 1.5))
    const after = (await db.mealTemplates.get(id))!
    expect(after.items[0].amount).toBe(2)
    expect(after.useCount).toBe(1)
  })
})

describe('säkerhetskopiering', () => {
  it('export → rensa → import återställer data', async () => {
    await addEntries([{ ...base, date: '2026-11-10', name: 'A', kcal: 500, protein: 30 }])
    const backup = JSON.parse(JSON.stringify(await exportAll()))
    expect(validateBackup(backup).ok).toBe(true)
    await clearAll()
    expect(await db.entries.count()).toBe(0)
    await importBackup(backup)
    expect((await dayTotal('2026-11-10')).kcal).toBe(500)
  })
  it('avvisar ogiltig fil utan att röra befintlig data', async () => {
    await addEntries([{ ...base, date: '2026-11-10', name: 'A', kcal: 500, protein: 30 }])
    const bad = { app: 'kost-traningsdagbok', schemaVersion: 1, exportedAt: '', data: { entries: [{ id: 'x', date: 'igår', kcal: 'mycket' }] } }
    const v = validateBackup(bad)
    expect(v.ok).toBe(false)
    await expect(importBackup(bad as never)).rejects.toThrow()
    expect(await db.entries.count()).toBe(1)
    expect(validateBackup({ foo: 1 }).ok).toBe(false)
  })
  it('CSV med semikolon och decimalkomma', async () => {
    await addEntries([{ ...base, date: '2026-11-10', name: 'Ost; riven', kcal: 114, protein: 7.8 }])
    const csv = await exportCsv('mat', '2026-11-01', '2026-11-30')
    expect(csv).toContain('"Ost; riven"')
    expect(csv).toContain(';7,8;')
  })
})

describe('AI-flöde', () => {
  const ctx = { today: '2026-11-13', now: '12:30', weightKg: 90 }
  it('lokal tolkning av omelett-exemplet', () => {
    const r = parseLocally('Till lunch åt jag en omelett på tre ägg, 30 gram riven ost, 30 gram keso, en halv tomat, två matskedar purjolök och lite smör.', ctx)
    const by = Object.fromEntries(r.foods.map((f) => [f.name, f]))
    expect(r.foods.every((f) => f.meal === 'lunch')).toBe(true)
    expect(by['Ägg']).toMatchObject({ amount: 3, unit: 'st', amountOrigin: 'angivet' })
    expect(by['Hårdost 28 %']).toMatchObject({ amount: 30, unit: 'g' })
    expect(by['Keso']).toMatchObject({ amount: 30, unit: 'g' })
    expect(by['Tomat']).toMatchObject({ amount: 0.5, unit: 'st' })
    expect(by['Purjolök']).toMatchObject({ amount: 2, unit: 'msk' })
    expect(by['Smör']).toMatchObject({ amountOrigin: 'osakert' })
    expect(r.foods).toHaveLength(6)
  })
  it('lokal tolkning av träningsexemplet', () => {
    const r = parseLocally('Idag körde jag 45 minuter crosstrainer och sedan 45 minuter gym med medelintensitet.', ctx)
    expect(r.foods).toHaveLength(0)
    expect(r.workouts).toHaveLength(2)
    expect(r.workouts[0]).toMatchObject({ activity: 'crosstrainer', durationMin: 45 })
    expect(r.workouts[1]).toMatchObject({ activity: 'gym', durationMin: 45, intensity: 'medel' })
    expect(r.workouts[0].kcal).toBeGreaterThan(0)
  })
  it('förslag sparas inte förrän användaren godkänner', async () => {
    const result = parseLocally('2 bananer och en proteinbar', ctx)
    const id = await saveInterpretation('2 bananer och en proteinbar', 'lokal', result)
    expect(await db.entries.count()).toBe(0)
    expect((await db.aiInterpretations.get(id))?.status).toBe('vantar')
    // Godkänn bara första posten
    await acceptInterpretation(id, [result.foods[0]], [], { date: '2026-11-13', time: '12:30' }, result.foods.length)
    expect(await db.entries.count()).toBe(1)
    const interp = await db.aiInterpretations.get(id)
    expect(interp?.status).toBe('delvis')
    expect(interp?.inputText).toBe('2 bananer och en proteinbar')
    expect((await db.entries.toArray())[0].aiInterpretationId).toBe(id)
  })
  it('normaliserar och rensar AI-svar', () => {
    const r = normalizeAiResult('Här är svaret:\n```json\n{"foods":[{"name":"Pizza","amount":"1","unit":"styck","kcal":"850","protein":35,"meal":"dinner"},{"amount":2}],"workouts":[{"activity":"running","durationMin":30,"intensity":"high"},{"activity":"gym"}],"evil":"x"}\n```')
    expect(r.foods).toHaveLength(1)
    expect(r.foods[0]).toMatchObject({ name: 'Pizza', amount: 1, unit: 'st', kcal: 850, meal: 'middag' })
    expect(r.workouts).toHaveLength(1)
    expect(r.workouts[0]).toMatchObject({ activity: 'lopning', intensity: 'hog' })
    expect(() => normalizeAiResult('inget json här')).toThrow()
  })
})

describe('migrering av inställningar', () => {
  it('byter från "visa separat" till 75 % och räknar om målet utan planerad träning', async () => {
    const { migrateSettings, getSettings, saveProfileAndGoal } = await import('./repo')
    const { calculateTargets } = await import('./calc')
    const profile = { id: 'me' as const, age: 45, sex: 'man' as const, heightCm: 182, startWeightKg: 95, goalWeightKg: 85, rateKgPerWeek: 0.5, activityLevel: 'latt' as const, trainingSessionsPerWeek: 3, mainGoals: [], healthNotes: '', trackedNutrients: ['kcal' as const, 'protein' as const], createdAt: '', updatedAt: '' }
    const old = calculateTargets({ ...profile, weightKg: 95, exerciseMode: 'separat' })
    await saveProfileAndGoal(profile, { mode: 'beraknat', kcal: old.kcal, protein: old.protein, calculation: old.calculation }, '2026-01-01')
    await db.settings.put({ ...(await getSettings()), exerciseCalorieMode: 'separat', settingsVersion: undefined })
    await migrateSettings()
    const s = await getSettings()
    expect(s).toMatchObject({ exerciseCalorieMode: 'andel', exerciseCaloriePercent: 75, settingsVersion: 2 })
    const goals = (await db.goals.toArray()).sort((a, b) => a.validFrom.localeCompare(b.validFrom))
    expect(goals).toHaveLength(2)
    expect(goals[1].kcal).toBeLessThan(goals[0].kcal)
    expect(goals[1].calculation?.plannedTrainingKcalPerDay).toBe(0)
    await migrateSettings() // körs bara en gång
    expect(await db.goals.count()).toBe(2)
  })
})
