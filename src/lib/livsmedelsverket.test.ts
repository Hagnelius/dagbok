import { describe, expect, it } from 'vitest'
import { enrichWithLv, lvToDbFood, matchLv, searchLv, toLvFoods } from './livsmedelsverket'
import type { AiFoodItem, AiResult } from './types'

// Utdrag ur Livsmedelsverkets databas (nummer, namn, kcal, protein, fett, kolhydrater per 100 g).
const foods = toLvFoods([
  [1, 'Potatis höst rå', 81, 2, 0.1, 17],
  [2, 'Potatis höst kokt m. salt', 85, 2, 0.1, 18],
  [3, 'Potatispalt', 150, 4, 3, 26],
  [4, 'Mjölkchoklad m. hackade hasselnötter', 545, 8, 34, 50],
  [5, 'Mellanmjölk fett 1,5% berikad', 47, 3.5, 1.5, 4.8],
  [6, 'Kanel', 247, 4, 1.2, 50],
  [7, 'Sött vetebröd kanelbulle hembakad', 324, 7, 12, 46],
  [8, 'Ägg kokt', 136, 12.5, 9.6, 0.3],
  [9, 'Äggröra', 160, 10, 12, 2],
  [10, 'Ägg rått', 136, 12.5, 9.6, 0.3],
  [11, 'Ost hårdost fett 28%', 358, 26, 28, 0],
  [12, 'Ostron rå', 80, 9, 2, 5],
  [13, 'Kyckling lever stekt', 149, 24, 6, 1],
  [14, 'Kyckling bröstfilé färsk stekt u. skinn', 116, 26, 1.5, 0],
  [15, 'Laxpaté', 250, 12, 21, 3],
  [16, 'Lax stekt m. salt', 221, 22, 14.5, 0],
  [17, 'Banan', 95, 1.1, 0.3, 21],
  [18, 'Köttbullar nöt stekta', 171, 15, 10, 5],
  [19, 'Apelsinjuice drickf.', 39, 0.6, 0.1, 8.5],
  [20, 'Apelsin', 47, 1, 0.1, 10],
])
const name = (n: string) => matchLv(n, foods)?.name

describe('matchLv', () => {
  it('hittar vanliga livsmedel, även böjda och i omvänd ordning', () => {
    expect(name('Kokt potatis')).toBe('Potatis höst kokt m. salt')
    expect(name('Kokta potatisar')).toBe('Potatis höst kokt m. salt')
    expect(name('Banan')).toBe('Banan')
    expect(name('Köttbullar')).toBe('Köttbullar nöt stekta')
    expect(name('Apelsinjuice')).toBe('Apelsinjuice drickf.')
    expect(name('Kycklingfilé stekt')).toBe('Kyckling bröstfilé färsk stekt u. skinn')
    expect(name('Stekt lax')).toBe('Lax stekt m. salt')
  })
  it('väljer hellre tillagat än rått', () => {
    expect(name('Ägg')).toBe('Ägg kokt')
  })
  it('använder vardagsnamn', () => {
    expect(name('Mjölk')).toBe('Mellanmjölk fett 1,5% berikad')
    expect(name('Ost')).toBe('Ost hårdost fett 28%')
    expect(name('Kanelbulle')).toBe('Sött vetebröd kanelbulle hembakad')
  })
  it('matchar inte sammansättningar eller andra delar av djuret', () => {
    expect(name('Potatispalt kokt')).toBeUndefined()
    expect(name('Äggröra')).toBe('Äggröra')
    expect(name('Kyckling stekt')).not.toBe('Kyckling lever stekt')
    expect(name('Laxbit')).toBeUndefined()
    expect(name('Choklad')).toBeUndefined()
    expect(name('Proteinbar')).toBeUndefined()
  })
})

describe('searchLv', () => {
  it('hittar på början av ord och sorterar exakta namn först', () => {
    expect(searchLv('potatis', foods).map((f) => f.name).slice(0, 2)).toEqual(['Potatis höst rå', 'Potatis höst kokt m. salt'])
    expect(searchLv('kanelb', foods).map((f) => f.name)).toEqual(['Sött vetebröd kanelbulle hembakad'])
    expect(searchLv('', foods)).toEqual([])
  })
})

describe('lvToDbFood', () => {
  it('ger portioner för vanliga livsmedel', () => {
    const egg = lvToDbFood(foods.find((f) => f.name === 'Ägg kokt')!)
    expect(egg.units.st).toBe(55)
    expect(egg.defaultUnit).toBe('st')
    const milk = lvToDbFood(foods.find((f) => f.name.startsWith('Mellanmjölk'))!)
    expect(milk.liquid).toBe(true)
    expect(milk.units.dl).toBe(100)
  })
})

const item = (p: Partial<AiFoodItem>): AiFoodItem => ({
  name: 'X', amount: 1, unit: 'portion', kcal: 100, protein: 1, meal: 'lunch', amountOrigin: 'uppskattat', nutritionOrigin: 'uppskattat', ...p,
})
const result = (...f: AiFoodItem[]): AiResult => ({ foods: f, workouts: [], assumptions: [], uncertainties: [] })

describe('enrichWithLv', () => {
  it('räknar fram näring ur gram och markerar källan', () => {
    const r = enrichWithLv(result(item({ name: 'Kokt potatis', amount: 3, unit: 'st', grams: 200, kcal: 160 })), foods)
    expect(r.foods[0]).toMatchObject({ kcal: 170, protein: 4, nutritionOrigin: 'beraknat', amount: 3, unit: 'st' })
    expect(r.foods[0].note).toContain('Livsmedelsverket: Potatis höst kokt m. salt')
  })
  it('räknar om enheter när gram saknas', () => {
    const r = enrichWithLv(result(item({ name: 'Mellanmjölk', amount: 2, unit: 'dl', kcal: 90 })), foods)
    expect(r.foods[0].kcal).toBe(94)
  })
  it('behåller AI:ns värde vid okänd vikt, ingen träff eller orimlig skillnad', () => {
    const unknown = item({ name: 'Kokt potatis', unit: 'portion' })
    const none = item({ name: 'Proteinbar', grams: 60 })
    const odd = item({ name: 'Banan', grams: 2000, kcal: 100 })
    expect(enrichWithLv(result(unknown, none, odd), foods).foods).toEqual([unknown, none, odd])
  })
  it('behåller osäker mängd som osäker', () => {
    const r = enrichWithLv(result(item({ name: 'Banan', unit: 'st', amount: 1, amountOrigin: 'osakert', kcal: 110 })), foods)
    expect(r.foods[0]).toMatchObject({ kcal: 114, nutritionOrigin: 'osakert' })
  })
})
