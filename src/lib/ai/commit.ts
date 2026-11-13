import { db, nowIso, uid } from '../db'
import { addEntries, addWorkouts } from '../repo'
import type { AiFoodItem, AiInterpretation, AiResult, AiWorkoutItem } from '../types'

/** Sparar en tolkning med status "väntar" – inga mat- eller träningsposter skapas här. */
export async function saveInterpretation(inputText: string, provider: string, result: AiResult, photo?: { thumb: string }): Promise<string> {
  const row: AiInterpretation = {
    id: uid(), createdAt: nowIso(), inputText, provider, result, status: 'vantar',
    inputKind: photo ? 'foto' : 'text', imageThumb: photo?.thumb,
  }
  await db.aiInterpretations.add(row)
  return row.id
}

/**
 * Skapar poster av de förslag som användaren har godkänt i granskningsvyn. Detta är det ENDA
 * stället där AI-förslag blir dagboksposter.
 */
export async function acceptInterpretation(
  interpretationId: string,
  foods: AiFoodItem[],
  workouts: AiWorkoutItem[],
  defaults: { date: string; time: string },
  totalSuggested: number,
): Promise<{ foodIds: string[]; workoutIds: string[] }> {
  const interp = await db.aiInterpretations.get(interpretationId)
  if (!interp) throw new Error('Tolkningen hittades inte.')
  const source = interp.provider === 'lokal' ? 'lokal_tolkning' : 'ai'
  const groupId = foods.length > 1 ? uid() : undefined
  const foodIds = await addEntries(foods.map((f) => ({
    date: f.date ?? defaults.date, time: f.time ?? defaults.time, meal: f.meal, name: f.name, amount: f.amount, unit: f.unit,
    kcal: f.kcal, protein: f.protein, fat: f.fat, carbs: f.carbs, note: f.note, source, groupId,
    origin: f.nutritionOrigin === 'osakert' || f.amountOrigin === 'osakert' ? 'osakert' : f.nutritionOrigin,
    aiInterpretationId: interpretationId,
  })))
  const workoutIds = await addWorkouts(workouts.map((w) => ({
    date: w.date ?? defaults.date, time: w.time, activity: w.activity, label: w.label, durationMin: w.durationMin,
    intensity: w.intensity, kcal: w.kcal, kcalEstimated: w.kcalOrigin !== 'angivet', distanceKm: w.distanceKm, avgHr: w.avgHr, note: w.note,
    source, aiInterpretationId: interpretationId,
  })))
  const accepted = foods.length + workouts.length
  await db.aiInterpretations.update(interpretationId, {
    status: accepted === 0 ? 'avbruten' : accepted < totalSuggested ? 'delvis' : 'godkand',
    acceptedFoodIds: foodIds, acceptedWorkoutIds: workoutIds,
  })
  return { foodIds, workoutIds }
}

export async function cancelInterpretation(id: string) {
  await db.aiInterpretations.update(id, { status: 'avbruten' })
}
