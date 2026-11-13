import { describe, expect, it } from 'vitest'
import { rescale } from './units'
import { nutritionFor, findDbFood } from './foodDb'

describe('omräkning vid byte av mängd och enhet', () => {
  const mjolk = { name: 'Mellanmjölk', amount: 2, unit: 'dl' as const, kcal: 92, protein: 7, fat: 3, carbs: 9.6 }
  it('2 dl mellanmjölk → 2 msk räknas om (buggen)', () => {
    const r = rescale(mjolk, 2, 'msk')!
    expect(r).toBeDefined()
    expect(r.nutrition.kcal).toBe(14) // 30 ml av 200 ml
    expect(r.nutrition.protein).toBe(1.1)
  })
  it('livsmedelslistan har sked-mått för mjölk', () => {
    expect(nutritionFor(findDbFood('Mellanmjölk')!, 2, 'msk')!.kcal).toBe(14)
  })
  it('samma enhet skalas proportionellt och behåller egna värden', () => {
    expect(rescale({ name: 'Egen gröt', amount: 1, unit: 'portion', kcal: 300, protein: 12 }, 1.5, 'portion')!.nutrition).toMatchObject({ kcal: 450, protein: 18 })
  })
  it('st → g via livsmedelslistan', () => {
    const r = rescale({ name: 'Ägg', amount: 2, unit: 'st', kcal: 154, protein: 13.8 }, 55, 'g')!
    expect(r.method).toBe('livsmedelslista')
    expect(r.nutrition.kcal).toBe(77)
  })
  it('okänt livsmedel mellan st och g går inte', () => {
    expect(rescale({ name: 'Mormors bulle', amount: 1, unit: 'st', kcal: 300, protein: 6 }, 100, 'g')).toBeUndefined()
  })
  it('fasta livsmedel med dl får msk', () => {
    expect(nutritionFor(findDbFood('Havregryn')!, 2, 'msk')).toBeDefined()
  })
})
