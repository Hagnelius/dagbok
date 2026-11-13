import { describe, expect, it } from 'vitest'
import { dailyWeights, goalForDate, periodStats, rollingAverage, weightSummary } from './stats'
import { dailyFeedback } from './feedback'
import type { FoodEntry, Goal, Measurement } from './types'

const entry = (date: string, kcal: number, protein: number): FoodEntry => ({
  id: date + kcal + Math.random(), date, time: '12:00', meal: 'lunch', name: 'x', amount: 1, unit: 'st', kcal, protein, source: 'manuell', createdAt: '', updatedAt: '',
})
const goal = (validFrom: string, kcal: number, protein: number): Goal => ({ id: validFrom, validFrom, mode: 'manuellt', kcal, protein, createdAt: validFrom })
const m = (date: string, time: string, weightKg: number): Measurement => ({ id: date + time, date, time, weightKg, createdAt: date + time, updatedAt: '' })

describe('periodStats', () => {
  it('räknar inte dagar utan data som nolldagar', () => {
    const entries = [entry('2026-11-09', 2000, 150), entry('2026-11-11', 2200, 170)]
    const s = periodStats(entries, [], [goal('2026-01-01', 2100, 160)], '2026-11-09', '2026-11-15')
    expect(s.totalDays).toBe(7)
    expect(s.loggedDays).toBe(2)
    expect(s.avgKcal).toBe(2100)
    expect(s.avgProtein).toBe(160)
    expect(s.proteinGoalHitDays).toBe(1)
    expect(s.kcalDiffFromGoal).toBe(0)
  })
  it('en dag med registreringar som summerar till 0 kcal räknas som registrerad', () => {
    const s = periodStats([entry('2026-11-09', 0, 0), entry('2026-11-10', 2000, 100)], [], [], '2026-11-09', '2026-11-10')
    expect(s.loggedDays).toBe(2)
    expect(s.avgKcal).toBe(1000)
  })
  it('kan utesluta pågående dag', () => {
    const s = periodStats([entry('2026-11-09', 2000, 100), entry('2026-11-10', 300, 20)], [], [], '2026-11-09', '2026-11-10', { excludeDates: ['2026-11-10'] })
    expect(s.avgKcal).toBe(2000)
  })
  it('använder målet som gällde respektive dag', () => {
    const goals = [goal('2026-11-01', 2000, 150), goal('2026-11-10', 1800, 160)]
    expect(goalForDate(goals, '2026-11-09')?.kcal).toBe(2000)
    expect(goalForDate(goals, '2026-11-10')?.kcal).toBe(1800)
    expect(goalForDate(goals, '2026-10-01')?.kcal).toBe(2000)
  })
  it('summerar träning per aktivitet', () => {
    const w = (date: string, activity: 'gym' | 'fotboll', durationMin: number) => ({ id: date + activity, date, activity, durationMin, intensity: 'medel' as const, kcal: 300, kcalEstimated: true, source: 'manuell' as const, createdAt: '', updatedAt: '' })
    const s = periodStats([], [w('2026-11-09', 'gym', 60), w('2026-11-10', 'fotboll', 90), w('2026-11-11', 'gym', 45)], [], '2026-11-09', '2026-11-15')
    expect(s.workoutCount).toBe(3)
    expect(s.workoutMinutes).toBe(195)
    expect(s.byActivity[0]).toEqual({ activity: 'gym', count: 2, minutes: 105 })
  })
})

describe('vikttrend', () => {
  const ms = [m('2026-11-01', '07:00', 90), m('2026-11-01', '20:00', 91.4), m('2026-11-03', '07:00', 89.6), m('2026-11-08', '07:00', 89.2), m('2026-11-10', '07:00', 88.8)]
  it('hanterar flera vägningar samma dag enligt inställning', () => {
    expect(dailyWeights(ms, 'forsta')[0].weight).toBe(90)
    expect(dailyWeights(ms, 'senaste')[0].weight).toBe(91.4)
    expect(dailyWeights(ms, 'medel')[0].weight).toBe(90.7)
    expect(dailyWeights(ms, 'forsta')).toHaveLength(4)
  })
  it('rullande 7-dagarssnitt', () => {
    const d = dailyWeights(ms, 'forsta')
    expect(rollingAverage(d, '2026-11-03')).toBe(89.8)
    // fönster 4–10 nov: 89,2 och 88,8
    expect(rollingAverage(d, '2026-11-10')).toBe(89)
  })
  it('sammanfattning baseras på snitt', () => {
    const d = dailyWeights(ms, 'forsta')
    const s = weightSummary(d, 92, 85)
    expect(s.latest?.weight).toBe(88.8)
    expect(s.avg7).toBe(89)
    expect(s.changeSinceStart).toBe(-3)
    expect(s.change7).toBe(-0.8) // 89,0 − 89,8
    expect(s.change30).toBeUndefined()
    expect(s.toGoal).toBe(4)
  })
})

describe('daglig återkoppling', () => {
  it('neutral text med kvarvarande värden', () => {
    const f = dailyFeedback({ isToday: true, isPast: false, entryCount: 4, eaten: 1750, budget: 2100, protein: 138, proteinGoal: 160 })
    const nb = (x: string) => x.replace(/\u00a0|\u202f/g, ' ')
    expect(nb(f[0])).toBe('Du har registrerat 1 750 av 2 100 kcal och 138 av 160 g protein.')
    expect(nb(f[1])).toBe('Utifrån dagens mål har du ungefär 350 kcal och 22 g protein kvar.')
  })
  it('lugn formulering vid överskridet mål med veckosnitt nära planen', () => {
    const week = periodStats([entry('2026-11-05', 2100, 160), entry('2026-11-06', 2080, 160)], [], [goal('2026-01-01', 2100, 160)], '2026-11-05', '2026-11-11')
    const f = dailyFeedback({ isToday: true, isPast: false, entryCount: 5, eaten: 2250, budget: 2100, protein: 160, proteinGoal: 160, week })
    expect(f.join(' ')).toContain('något över dagens kalorimål')
    expect(f.join(' ')).toContain('Veckosnittet ligger fortfarande nära planen')
    expect(f.join(' ')).not.toMatch(/misslyck|dålig|förbjud/)
  })
})
