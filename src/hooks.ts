import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db'
import { todayKey } from './lib/dates'
import { dayBudget, sumNutrition } from './lib/nutrition'
import { dailyWeights, goalForDate } from './lib/stats'
import { DEFAULT_SETTINGS, type Settings } from './lib/types'

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('settings'), [])
  return { ...DEFAULT_SETTINGS, ...s }
}

export function useProfile() {
  return useLiveQuery(() => db.profile.get('me').then((p) => p ?? null), [])
}

export function useGoals() {
  return useLiveQuery(() => db.goals.toArray(), []) ?? []
}

/** Dagens datum som uppdateras vid midnatt och när appen kommer tillbaka i förgrunden. */
export function useToday(): string {
  const [t, setT] = useState(todayKey)
  useEffect(() => {
    const tick = () => setT(todayKey())
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [])
  return t
}

export function useDay(date: string) {
  const settings = useSettings()
  const data = useLiveQuery(async () => {
    const [entries, workouts, measurements, note, goals] = await Promise.all([
      db.entries.where('date').equals(date).toArray(),
      db.workouts.where('date').equals(date).toArray(),
      db.measurements.where('date').equals(date).toArray(),
      db.dayNotes.get(date),
      db.goals.toArray(),
    ])
    entries.sort((a, b) => a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt))
    workouts.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.createdAt.localeCompare(b.createdAt))
    measurements.sort((a, b) => a.time.localeCompare(b.time))
    return { entries, workouts, measurements, note, goal: goalForDate(goals, date) }
  }, [date])
  if (!data) return undefined
  const totals = sumNutrition(data.entries)
  const budget = dayBudget(data.entries, data.workouts, data.goal?.kcal ?? 0, settings.exerciseCalorieMode, settings.exerciseCaloriePercent)
  return { ...data, totals, budget, settings }
}

/** Senaste vikten (dagsvärde enligt inställning) fram till och med datum. */
export function useLatestWeight(upTo?: string) {
  const settings = useSettings()
  const ms = useLiveQuery(() => db.measurements.toArray(), []) ?? []
  const daily = dailyWeights(upTo ? ms.filter((m) => m.date <= upTo) : ms, settings.weighInPolicy)
  return daily.at(-1)
}

export function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true)
    const b = () => setOn(false)
    window.addEventListener('online', a)
    window.addEventListener('offline', b)
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b) }
  }, [])
  return on
}

/** Ett utkast som överlever att användaren lämnar vyn eller appen stängs. */
export function usePersistentDraft(key: string): [string, (v: string) => void] {
  const [v, setV] = useState(() => {
    try { return localStorage.getItem(key) ?? '' } catch { return '' }
  })
  const set = (nv: string) => {
    setV(nv)
    try { if (nv) localStorage.setItem(key, nv); else localStorage.removeItem(key) } catch { /* privat läge */ }
  }
  return [v, set]
}
