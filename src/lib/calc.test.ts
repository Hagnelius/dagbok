import { describe, expect, it } from 'vitest'
import { bmrMifflin, calculateTargets, checkManualTargets } from './calc'
import { estimateWorkoutKcal } from './exercise'

const base = {
  age: 45, sex: 'man' as const, heightCm: 182, weightKg: 95, goalWeightKg: 85, rateKgPerWeek: 0.5,
  activityLevel: 'latt' as const, trainingSessionsPerWeek: 3, mainGoals: ['viktnedgang' as const], exerciseMode: 'separat' as const,
}

describe('Mifflin–St Jeor', () => {
  it('beräknar BMR för man och kvinna', () => {
    expect(bmrMifflin(95, 182, 45, 'man')).toBeCloseTo(10 * 95 + 6.25 * 182 - 5 * 45 + 5)
    expect(bmrMifflin(70, 165, 30, 'kvinna')).toBeCloseTo(700 + 1031.25 - 150 - 161)
  })
})

describe('calculateTargets', () => {
  it('ger transparent beräkning med underskott', () => {
    const r = calculateTargets(base)
    const bmr = bmrMifflin(95, 182, 45, 'man')
    expect(r.calculation.bmr).toBe(Math.round(bmr))
    expect(r.calculation.plannedTrainingKcalPerDay).toBe(Math.round((3 * 300) / 7))
    expect(r.calculation.appliedDeficit).toBe(550)
    expect(r.kcal).toBe(Math.round((bmr * 1.35 + (3 * 300) / 7 - 550) / 10) * 10)
    // protein 1,8 g/kg målvikt
    expect(r.protein).toBe(155)
    expect(r.calculation.warnings).toHaveLength(0)
  })
  it('räknar inte planerad träning dubbelt när träningskalorier läggs till budgeten', () => {
    const r = calculateTargets({ ...base, exerciseMode: 'alla' })
    expect(r.calculation.plannedTrainingKcalPerDay).toBe(0)
  })
  it('begränsar orimligt stort underskott och varnar neutralt', () => {
    const r = calculateTargets({ ...base, rateKgPerWeek: 2 })
    expect(r.calculation.appliedDeficit).toBeLessThan(r.calculation.requestedDeficit)
    expect(r.calculation.appliedDeficit).toBeLessThanOrEqual(Math.round(r.calculation.tdee * 0.25) + 1)
    expect(r.calculation.warnings.length).toBeGreaterThan(0)
    expect(r.saferRate).toBeGreaterThan(0)
    expect(r.saferRate).toBeLessThan(2)
    expect(r.kcal).toBeGreaterThanOrEqual(r.calculation.bmr - 10)
  })
  it('inget underskott när målvikten är nådd', () => {
    const r = calculateTargets({ ...base, goalWeightKg: 95 })
    expect(r.calculation.appliedDeficit).toBe(0)
  })
  it('högre protein när muskelmassa ska behållas', () => {
    const r = calculateTargets({ ...base, mainGoals: ['viktnedgang', 'behalla_muskler'] })
    expect(r.calculation.proteinPerKg).toBe(2)
    expect(r.protein).toBe(170)
  })
  it('varnar för låga manuella mål', () => {
    expect(checkManualTargets(1100, 150, 'man', 95).length).toBe(1)
    expect(checkManualTargets(2200, 160, 'man', 95)).toHaveLength(0)
  })
})

describe('träningsuppskattning', () => {
  it('nettoförbrukning (MET − 1) × vikt × tid', () => {
    // crosstrainer medel 6,8 MET, 90 kg, 45 min → 5,8 × 90 × 0,75 = 391,5 → 390
    expect(estimateWorkoutKcal('crosstrainer', 'medel', 45, 90)).toBe(390)
    expect(estimateWorkoutKcal('gym', 'medel', 0, 90)).toBe(0)
  })
})
