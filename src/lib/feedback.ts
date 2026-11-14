import { fmtInt } from './format'
import type { PeriodStats } from './stats'

export interface FeedbackInput {
  isToday: boolean
  isPast: boolean
  entryCount: number
  eaten: number
  budget: number
  protein: number
  proteinGoal: number
  /** Extrakalorier från träning som ingår i budgeten (visas som förklaring). */
  exerciseExtra?: number
  /** Senaste 7 dagarnas statistik (exklusive idag). */
  week?: PeriodStats
}

/**
 * Kort, neutral och regelbaserad återkoppling. Ingen AI, inga värderande ord om mat.
 * Fokus på helheten (veckosnittet) snarare än enskilda dagar.
 */
export function dailyFeedback(i: FeedbackInput): string[] {
  const out: string[] = []
  if (i.entryCount === 0) {
    out.push(i.isToday ? 'Inget registrerat ännu idag.' : 'Ingen mat registrerad den här dagen. Dagen räknas inte med i snitten.')
    return out
  }
  const remainingKcal = i.budget - i.eaten
  const remainingProtein = Math.max(0, Math.round(i.proteinGoal - i.protein))
  const base = `${i.isToday ? 'Du har registrerat' : 'Registrerat:'} ${fmtInt(i.eaten)} av ${fmtInt(i.budget)} kcal${i.exerciseExtra ? ` (inkl. ${fmtInt(i.exerciseExtra)} från träning)` : ''} och ${fmtInt(i.protein)} av ${fmtInt(i.proteinGoal)} g protein.`
  out.push(base)

  const weekNear = i.week?.kcalDiffFromGoal !== undefined && i.week.avgKcalGoal
    ? Math.abs(i.week.kcalDiffFromGoal) <= i.week.avgKcalGoal * 0.05
    : undefined

  if (remainingKcal >= 0) {
    if (i.isToday) {
      out.push(remainingProtein > 0
        ? `Utifrån dagens mål har du ungefär ${fmtInt(remainingKcal)} kcal och ${fmtInt(remainingProtein)} g protein kvar.`
        : `Utifrån dagens mål har du ungefär ${fmtInt(remainingKcal)} kcal kvar. Proteinmålet är nått.`)
    } else if (remainingProtein === 0) out.push('Proteinmålet nåddes.')
  } else {
    const over = -remainingKcal
    const slight = over <= i.budget * 0.1
    let s = slight ? `Du ligger något över dagens kalorimål (cirka ${fmtInt(over)} kcal).` : `Dagen ligger ungefär ${fmtInt(over)} kcal över kalorimålet.`
    if (weekNear === true) s += ' Veckosnittet ligger fortfarande nära planen.'
    else if (i.week?.avgKcal !== undefined) s += ` Veckosnittet är ${fmtInt(i.week.avgKcal)} kcal per dag.`
    out.push(s)
    if (remainingProtein === 0) out.push('Proteinmålet är nått.')
  }

  // Mönster över veckan – nämns lugnt och bara när det finns tillräckligt med data.
  if (i.week && i.week.loggedDays >= 4) {
    const missed = i.week.loggedDays - i.week.proteinGoalHitDays
    if (missed >= Math.ceil(i.week.loggedDays * 0.7)) {
      out.push(`Proteinet har legat under målet ${missed} av ${i.week.loggedDays} registrerade dagar den senaste veckan.`)
    }
    if (i.week.kcalDiffFromGoal !== undefined && i.week.avgKcalGoal && i.week.kcalDiffFromGoal < -i.week.avgKcalGoal * 0.2) {
      out.push('Veckosnittet ligger en bra bit under kalorimålet. Kontrollera gärna att allt har kommit med i registreringen.')
    }
  }
  return out
}
