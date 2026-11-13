import { describe, expect, it } from 'vitest'
import { dayBudget, exerciseAdjustment, recipeNutrition, scale, sumNutrition } from './nutrition'
import type { FoodEntry, Workout } from './types'

const e = (kcal: number, protein: number, fat?: number): FoodEntry => ({
  id: String(Math.random()), date: '2026-11-10', time: '12:00', meal: 'lunch', name: 'x', amount: 1, unit: 'st',
  kcal, protein, fat, source: 'manuell', createdAt: '', updatedAt: '',
})

describe('summering', () => {
  it('summerar kalorier och protein korrekt', () => {
    const t = sumNutrition([e(450, 30.5, 10), e(320, 22.3), e(880, 79.2, 5)])
    expect(t.kcal).toBe(1650)
    expect(t.protein).toBe(132)
    expect(t.fat).toBe(15)
    expect(t.fatIncomplete).toBe(true)
  })
  it('tom lista ger noll', () => {
    expect(sumNutrition([]).kcal).toBe(0)
  })
  it('skalar portioner', () => {
    expect(scale({ kcal: 200, protein: 10, fat: 5 }, 1.5)).toEqual({ kcal: 300, protein: 15, fat: 7.5, carbs: undefined })
  })
})

describe('recept', () => {
  it('beräknar total och per portion', () => {
    const r = recipeNutrition([
      { id: '1', name: 'Pasta', amount: 400, unit: 'g', kcal: 1400, protein: 50, fat: 6, carbs: 280 },
      { id: '2', name: 'Färs', amount: 500, unit: 'g', kcal: 1000, protein: 95, fat: 65, carbs: 0 },
    ], 4)
    expect(r.total.kcal).toBe(2400)
    expect(r.perPortion.kcal).toBe(600)
    expect(r.perPortion.protein).toBe(36.3)
    expect(scale(r.perPortion, 0.5).kcal).toBe(300)
  })
})

describe('träningskalorier i budgeten', () => {
  const w: Workout = { id: 'w', date: '2026-11-10', activity: 'gym', durationMin: 60, intensity: 'medel', kcal: 400, kcalEstimated: true, source: 'manuell', createdAt: '', updatedAt: '' }
  it('separat lägger inte till något', () => {
    expect(exerciseAdjustment(400, 'separat', 50)).toBe(0)
    expect(exerciseAdjustment(400, 'andel', 50)).toBe(200)
    expect(exerciseAdjustment(400, 'alla', 50)).toBe(400)
  })
  it('budget = grundmål + justering', () => {
    const b = dayBudget([e(1650, 132)], [w], 2100, 'andel', 50)
    expect(b).toMatchObject({ baseKcal: 2100, exerciseKcal: 400, adjustment: 200, budget: 2300, eaten: 1650, remaining: 650 })
  })
})
