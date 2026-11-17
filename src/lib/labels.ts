import type { ActivityLevel, ActivityType, Intensity, MainGoal, MealType, NutrientKey, Sex, Unit, ValueOrigin } from './types'

export const MEAL_LABEL: Record<MealType, string> = {
  frukost: 'Frukost', lunch: 'Lunch', middag: 'Middag', mellanmal: 'Mellanmål', dryck: 'Dryck',
}
export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  promenad: 'Promenad', lopning: 'Löpning', cykling: 'Cykling', crosstrainer: 'Crosstrainer',
  gym: 'Gym', fotboll: 'Fotboll', simning: 'Simning', annat: 'Annan aktivitet',
}
export const ACTIVITY_ICON: Record<ActivityType, string> = {
  promenad: '🚶', lopning: '🏃', cykling: '🚴', crosstrainer: '⛷️', gym: '🏋️', fotboll: '⚽', simning: '🏊', annat: '✳️',
}
export const INTENSITY_LABEL: Record<Intensity, string> = { lag: 'Låg', medel: 'Medel', hog: 'Hög' }
export const SEX_LABEL: Record<Sex, string> = { man: 'Man', kvinna: 'Kvinna', ej_angivet: 'Vill inte ange' }
export const ACTIVITY_LEVEL_LABEL: Record<ActivityLevel, { label: string; help: string }> = {
  stillasittande: { label: 'Stillasittande', help: 'Kontorsarbete, lite rörelse i vardagen' },
  latt: { label: 'Lätt aktiv', help: 'Går en del, cyklar till jobbet ibland' },
  mattlig: { label: 'Måttligt aktiv', help: 'Står och rör dig mycket i jobbet' },
  hog: { label: 'Mycket aktiv', help: 'Fysiskt arbete större delen av dagen' },
}
export const GOAL_LABEL: Record<MainGoal, string> = {
  viktnedgang: 'Gå ner i vikt',
  behalla_vikt: 'Behålla vikten',
  behalla_muskler: 'Behålla muskelmassa',
  bygga_muskler: 'Bygga muskler',
  kondition: 'Förbättra konditionen',
  battre_matvanor: 'Bättre matvanor',
  mer_energi: 'Mer energi i vardagen',
}
export const NUTRIENT_LABEL: Record<NutrientKey, string> = { kcal: 'Energi (kcal)', protein: 'Protein', fat: 'Fett', carbs: 'Kolhydrater' }
export const UNIT_LABEL: Record<Unit, string> = {
  g: 'g', ml: 'ml', dl: 'dl', st: 'st', portion: 'portion', skiva: 'skiva', msk: 'msk', tsk: 'tsk', krm: 'krm',
}
export const ORIGIN_LABEL: Record<ValueOrigin, string> = {
  angivet: 'Angivet', beraknat: 'Beräknat', uppskattat: 'Uppskattat', osakert: 'Osäkert',
}

export function unitText(amount: number, unit: Unit): string {
  const a = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(amount)
  if (unit === 'skiva') return `${a} ${amount === 1 ? 'skiva' : 'skivor'}`
  if (unit === 'portion') return `${a} ${amount === 1 ? 'portion' : 'portioner'}`
  return `${a} ${unit}`
}
