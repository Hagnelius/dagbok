import { findDbFood, gramsFor } from './foodDb'
import type { Nutrition, Unit } from './types'

/** Volymenheter i milliliter. */
const ML: Partial<Record<Unit, number>> = { ml: 1, krm: 1, tsk: 5, msk: 15, dl: 100 }

export interface Scalable extends Nutrition {
  name: string
  amount: number
  unit: Unit
}

export interface Rescaled {
  nutrition: Nutrition
  /** Hur omräkningen gjordes – visas för användaren. */
  method: 'proportionellt' | 'volym' | 'livsmedelslista'
}

/**
 * Räknar om näringsvärden när mängd och/eller enhet ändras. Befintliga värden skalas alltid
 * proportionellt (så att egna justeringar behålls); enheten översätts via volym (dl/msk/tsk/krm/ml)
 * eller via livsmedelslistans gramvikter. Returnerar undefined när omräkning inte är möjlig,
 * t.ex. från "st" till "g" för ett okänt livsmedel.
 */
export function rescale(item: Scalable, newAmount: number, newUnit: Unit): Rescaled | undefined {
  if (!(newAmount > 0) || !(item.amount > 0)) return undefined
  let factor: number | undefined
  let method: Rescaled['method'] = 'proportionellt'
  if (newUnit === item.unit) factor = newAmount / item.amount
  else if (ML[newUnit] !== undefined && ML[item.unit] !== undefined) {
    factor = (newAmount * ML[newUnit]!) / (item.amount * ML[item.unit]!)
    method = 'volym'
  } else {
    const db = findDbFood(item.name)
    const oldG = db ? gramsFor(db, item.amount, item.unit) : undefined
    const newG = db ? gramsFor(db, newAmount, newUnit) : undefined
    if (oldG && newG) { factor = newG / oldG; method = 'livsmedelslista' }
  }
  if (factor === undefined || !Number.isFinite(factor)) return undefined
  const r1 = (x: number) => Math.round(x * factor! * 10) / 10
  return {
    method,
    nutrition: {
      kcal: Math.round(item.kcal * factor),
      protein: r1(item.protein),
      fat: item.fat === undefined ? undefined : r1(item.fat),
      carbs: item.carbs === undefined ? undefined : r1(item.carbs),
    },
  }
}
