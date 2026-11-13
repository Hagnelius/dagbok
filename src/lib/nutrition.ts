import type { FoodEntry, Ingredient, Nutrition, Workout, ExerciseCalorieMode } from './types'

export interface Totals {
  kcal: number
  protein: number
  fat: number
  carbs: number
  /** true om minst en post saknar fett- respektive kolhydratvärde. */
  fatIncomplete: boolean
  carbsIncomplete: boolean
  count: number
}

export function sumNutrition(items: Array<Nutrition>): Totals {
  const t: Totals = { kcal: 0, protein: 0, fat: 0, carbs: 0, fatIncomplete: false, carbsIncomplete: false, count: items.length }
  for (const i of items) {
    t.kcal += i.kcal || 0
    t.protein += i.protein || 0
    if (i.fat === undefined || i.fat === null) t.fatIncomplete = true
    else t.fat += i.fat
    if (i.carbs === undefined || i.carbs === null) t.carbsIncomplete = true
    else t.carbs += i.carbs
  }
  t.kcal = Math.round(t.kcal)
  t.protein = Math.round(t.protein * 10) / 10
  t.fat = Math.round(t.fat * 10) / 10
  t.carbs = Math.round(t.carbs * 10) / 10
  return t
}

/** Skalar näringsvärden med en faktor (t.ex. 1,5 portioner). */
export function scale<T extends Nutrition>(n: T, factor: number): Nutrition {
  const r = (x: number) => Math.round(x * factor * 10) / 10
  return {
    kcal: Math.round(n.kcal * factor),
    protein: r(n.protein),
    fat: n.fat === undefined ? undefined : r(n.fat),
    carbs: n.carbs === undefined ? undefined : r(n.carbs),
  }
}

export interface RecipeNutrition {
  total: Totals
  perPortion: Nutrition
}

export function recipeNutrition(items: Ingredient[], portions: number): RecipeNutrition {
  const total = sumNutrition(items)
  const p = portions > 0 ? portions : 1
  const perPortion: Nutrition = {
    kcal: Math.round(total.kcal / p),
    protein: Math.round((total.protein / p) * 10) / 10,
    fat: total.fatIncomplete && total.fat === 0 ? undefined : Math.round((total.fat / p) * 10) / 10,
    carbs: total.carbsIncomplete && total.carbs === 0 ? undefined : Math.round((total.carbs / p) * 10) / 10,
  }
  return { total, perPortion }
}

export function workoutKcal(workouts: Workout[]): { total: number; estimated: boolean; minutes: number } {
  let total = 0
  let minutes = 0
  let estimated = false
  for (const w of workouts) {
    total += w.kcal ?? 0
    minutes += w.durationMin
    if (w.kcalEstimated && w.kcal) estimated = true
  }
  return { total, estimated, minutes }
}

/** Hur mycket av träningsförbrukningen som läggs till dagens matbudget. */
export function exerciseAdjustment(exerciseKcal: number, mode: ExerciseCalorieMode, percent: number): number {
  if (mode === 'separat') return 0
  if (mode === 'alla') return Math.round(exerciseKcal)
  return Math.round((exerciseKcal * Math.min(100, Math.max(0, percent))) / 100)
}

export interface DayBudget {
  baseKcal: number
  exerciseKcal: number
  adjustment: number
  budget: number
  eaten: number
  remaining: number
}

export function dayBudget(entries: FoodEntry[], workouts: Workout[], baseKcal: number, mode: ExerciseCalorieMode, percent: number): DayBudget {
  const eaten = sumNutrition(entries).kcal
  const ex = workoutKcal(workouts).total
  const adjustment = exerciseAdjustment(ex, mode, percent)
  const budget = baseKcal + adjustment
  return { baseKcal, exerciseKcal: ex, adjustment, budget, eaten, remaining: budget - eaten }
}
