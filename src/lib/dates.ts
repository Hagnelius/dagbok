// Datumhjälpare. Alla datumnycklar är lokala svenska datum (Europe/Stockholm).
// Aritmetik görs i UTC på datumnycklar så att sommartid inte påverkar resultatet.

export const TZ = 'Europe/Stockholm'

const partsFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function parts(d: Date) {
  const p: Record<string, string> = {}
  for (const x of partsFmt.formatToParts(d)) p[x.type] = x.value
  return p
}

/** Dagens datumnyckel i svensk tid. */
export function todayKey(now = new Date()): string {
  const p = parts(now)
  return `${p.year}-${p.month}-${p.day}`
}

/** Aktuell tid "HH:mm" i svensk tid. */
export function nowTime(now = new Date()): string {
  const p = parts(now)
  return `${p.hour}:${p.minute}`
}

function toUtc(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(key: string, n: number): string {
  const d = toUtc(key)
  d.setUTCDate(d.getUTCDate() + n)
  return fromUtc(d)
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / 86400000)
}

/** Alla datumnycklar från start till och med slut. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = []
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k)
  return out
}

/** Veckodag 0 = måndag … 6 = söndag. */
export function weekday(key: string): number {
  return (toUtc(key).getUTCDay() + 6) % 7
}

export function startOfWeek(key: string): string {
  return addDays(key, -weekday(key))
}
export function endOfWeek(key: string): string {
  return addDays(startOfWeek(key), 6)
}
export function startOfMonth(key: string): string {
  return key.slice(0, 8) + '01'
}
export function endOfMonth(key: string): string {
  const d = toUtc(startOfMonth(key))
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0)
  return fromUtc(d)
}

/** ISO-veckonummer. */
export function isoWeek(key: string): number {
  const d = toUtc(key)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
}

const longFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
const shortFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const monthFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', month: 'long', year: 'numeric' })

/** "fredag 13 november" */
export function formatLong(key: string): string {
  return longFmt.format(toUtc(key))
}
/** "13 nov." */
export function formatShort(key: string): string {
  return shortFmt.format(toUtc(key))
}
export function formatMonth(key: string): string {
  return monthFmt.format(toUtc(key))
}
/** "2026-11-13" -> "13/11" */
export function formatDayMonth(key: string): string {
  return `${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}`
}

export function relativeDayLabel(key: string, today = todayKey()): string {
  const d = diffDays(key, today)
  if (d === 0) return 'Idag'
  if (d === -1) return 'Igår'
  if (d === 1) return 'Imorgon'
  return capitalize(formatLong(key))
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function isDateKey(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}
export function isTime(s: unknown): s is string {
  return typeof s === 'string' && /^\d{2}:\d{2}$/.test(s)
}

/** Föreslagen måltid utifrån klockslag. */
export function mealForTime(time: string): 'frukost' | 'lunch' | 'middag' | 'mellanmal' {
  const h = Number(time.slice(0, 2))
  if (h >= 5 && h < 10) return 'frukost'
  if (h >= 11 && h < 14) return 'lunch'
  if (h >= 17 && h < 21) return 'middag'
  return 'mellanmal'
}
