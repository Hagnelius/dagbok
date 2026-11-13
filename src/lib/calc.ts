import type { ActivityLevel, ExerciseCalorieMode, GoalCalculation, MainGoal, Sex } from './types'

/**
 * Beräkning av energi- och proteinmål.
 *
 * Metod:
 * 1. Basalomsättning (BMR) enligt Mifflin–St Jeor:
 *      10 × vikt(kg) + 6,25 × längd(cm) − 5 × ålder + s, där s = +5 (man), −161 (kvinna), −78 (ej angivet, medelvärde).
 * 2. Vardagsförbrukning = BMR × PAL för vardagsaktivitet UTAN planerad träning.
 * 3. Planerad träning: antal pass/vecka × 300 kcal ÷ 7. Räknas bara in i grundmålet om träningskalorier
 *    INTE läggs till dagens budget (läge "separat"). Annars skulle träningen räknas två gånger.
 * 4. Underskott = takt (kg/vecka) × 7 700 kcal ÷ 7, begränsat till max 25 % av energibehovet och så att
 *    målet inte understiger ett golv (max av BMR och 1 500 kcal män / 1 200 kcal kvinnor).
 * 5. Protein = 1,8 g/kg referensvikt (2,0 g/kg om "behålla muskelmassa" valts och underskott finns).
 *    Referensvikt = målvikten om den är lägre än nuvarande vikt, annars nuvarande vikt.
 * 6. Fett ≈ 30 % av energin, kolhydrater = resten.
 */

export const PAL: Record<ActivityLevel, number> = { stillasittande: 1.2, latt: 1.35, mattlig: 1.5, hog: 1.65 }
export const KCAL_PER_KG = 7700
export const KCAL_PER_SESSION = 300
export const MAX_DEFICIT_SHARE = 0.25

export interface TargetInput {
  age: number
  sex: Sex
  heightCm: number
  weightKg: number
  goalWeightKg: number
  rateKgPerWeek: number
  activityLevel: ActivityLevel
  trainingSessionsPerWeek: number
  mainGoals: MainGoal[]
  exerciseMode: ExerciseCalorieMode
}

export interface TargetResult {
  kcal: number
  protein: number
  fat: number
  carbs: number
  calculation: GoalCalculation
  /** Säkrare takt att föreslå om önskad takt bedöms orimlig. */
  saferRate?: number
}

export function bmrMifflin(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const s = sex === 'man' ? 5 : sex === 'kvinna' ? -161 : -78
  return 10 * weightKg + 6.25 * heightCm - 5 * age + s
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return weightKg / (m * m)
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step

export function calculateTargets(i: TargetInput): TargetResult {
  const warnings: string[] = []
  const bmr = bmrMifflin(i.weightKg, i.heightCm, i.age, i.sex)
  const pal = PAL[i.activityLevel]
  const dailyLife = bmr * pal
  const plannedTraining = i.exerciseMode === 'separat' ? (i.trainingSessionsPerWeek * KCAL_PER_SESSION) / 7 : 0
  const tdee = dailyLife + plannedTraining

  const losing = i.goalWeightKg < i.weightKg && i.rateKgPerWeek > 0
  const requestedDeficit = losing ? (i.rateKgPerWeek * KCAL_PER_KG) / 7 : 0
  const floor = Math.max(bmr, i.sex === 'kvinna' ? 1200 : i.sex === 'man' ? 1500 : 1350)
  const maxDeficit = Math.max(0, Math.min(tdee * MAX_DEFICIT_SHARE, tdee - floor))
  const appliedDeficit = Math.min(requestedDeficit, maxDeficit)

  let saferRate: number | undefined
  const pctPerWeek = (i.rateKgPerWeek / i.weightKg) * 100
  if (losing && pctPerWeek > 1) {
    warnings.push(`Önskad takt motsvarar ${pctPerWeek.toFixed(2).replace('.', ',')} % av kroppsvikten per vecka. En takt på högst 0,5–1 % per vecka brukar vara lättare att hålla och skonsammare för muskelmassan.`)
    saferRate = Math.floor(((i.weightKg * 0.0075) / 0.25)) * 0.25 || 0.25
  }
  if (appliedDeficit < requestedDeficit - 1) {
    warnings.push(`Underskottet har begränsats från ${Math.round(requestedDeficit)} till ${Math.round(appliedDeficit)} kcal/dag så att målet inte blir för lågt. Det motsvarar ungefär ${((appliedDeficit * 7) / KCAL_PER_KG).toFixed(2).replace('.', ',')} kg per vecka.`)
    saferRate ??= Math.max(0.25, Math.floor(((appliedDeficit * 7) / KCAL_PER_KG) / 0.25) * 0.25)
  }
  const goalBmi = bmi(i.goalWeightKg, i.heightCm)
  if (goalBmi < 18.5) warnings.push('Målvikten motsvarar ett BMI under 18,5. Överväg att diskutera målet med vårdpersonal.')
  if (i.age < 18) warnings.push('Beräkningen är framtagen för vuxna. För personer under 18 år bör målen sättas tillsammans med vårdpersonal.')

  const kcal = roundTo(tdee - appliedDeficit, 10)

  const refWeight = i.goalWeightKg > 0 && i.goalWeightKg < i.weightKg ? i.goalWeightKg : i.weightKg
  const proteinPerKg = i.mainGoals.includes('behalla_muskler') && appliedDeficit > 0 ? 2.0 : 1.8
  const protein = roundTo(refWeight * proteinPerKg, 5)
  const fat = roundTo((kcal * 0.3) / 9, 5)
  const carbs = Math.max(0, roundTo((kcal - protein * 4 - fat * 9) / 4, 5))

  return {
    kcal, protein, fat, carbs, saferRate,
    calculation: {
      method: 'Mifflin–St Jeor + aktivitetsfaktor (PAL)',
      bmr: Math.round(bmr),
      pal,
      dailyLifeKcal: Math.round(dailyLife),
      plannedTrainingKcalPerDay: Math.round(plannedTraining),
      tdee: Math.round(tdee),
      requestedDeficit: Math.round(requestedDeficit),
      appliedDeficit: Math.round(appliedDeficit),
      proteinPerKg,
      proteinReferenceWeightKg: refWeight,
      warnings,
    },
  }
}

/** Kontroll av manuellt angivna mål. Returnerar neutrala varningar. */
export function checkManualTargets(kcal: number, protein: number, sex: Sex, weightKg?: number): string[] {
  const w: string[] = []
  const floor = sex === 'kvinna' ? 1200 : sex === 'man' ? 1500 : 1350
  if (kcal < floor) w.push(`Ett dagligt mål under ${floor} kcal är lågt och bör helst sättas i samråd med vårdpersonal.`)
  if (weightKg && protein > weightKg * 3) w.push('Proteinmålet är ovanligt högt i förhållande till kroppsvikten.')
  if (weightKg && protein < weightKg * 0.8) w.push('Proteinmålet är lägre än det generella rekommenderade intaget (0,8 g/kg).')
  return w
}
