import { db, ALL_TABLES, type TableName, nowIso } from './db'
import { isDateKey } from './dates'
import type { Backup } from './types'
import { saveSettings } from './repo'

export const SCHEMA_VERSION = 1

export async function exportAll(): Promise<Backup> {
  const data = {} as Backup['data']
  for (const t of ALL_TABLES) {
    ;(data as Record<string, unknown[]>)[t] = await (db[t] as unknown as { toArray(): Promise<unknown[]> }).toArray()
  }
  return { app: 'kost-traningsdagbok', schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), data }
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  counts: Partial<Record<TableName, number>>
  backup?: Backup
}

/** Validerar en säkerhetskopia innan något i databasen ändras. */
export function validateBackup(raw: unknown): ValidationResult {
  const errors: string[] = []
  const counts: Partial<Record<TableName, number>> = {}
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['Filen innehåller inte giltig JSON-data.'], counts }
  const b = raw as Partial<Backup>
  if (b.app !== 'kost-traningsdagbok') errors.push('Filen verkar inte vara en säkerhetskopia från den här appen.')
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > SCHEMA_VERSION) errors.push('Säkerhetskopian har en okänd eller nyare version.')
  if (!b.data || typeof b.data !== 'object') {
    errors.push('Säkerhetskopian saknar data.')
    return { ok: false, errors, counts }
  }
  for (const t of ALL_TABLES) {
    const rows = (b.data as Record<string, unknown>)[t]
    if (rows === undefined) { counts[t] = 0; continue }
    if (!Array.isArray(rows)) { errors.push(`Tabellen "${t}" har fel format.`); continue }
    counts[t] = rows.length
    rows.forEach((r, i) => {
      if (!r || typeof r !== 'object') { errors.push(`${t}[${i}] är inte ett objekt.`); return }
      const o = r as Record<string, unknown>
      const key = t === 'dayNotes' ? 'date' : 'id'
      if (typeof o[key] !== 'string') errors.push(`${t}[${i}] saknar ${key}.`)
      if (['entries', 'workouts', 'measurements', 'dayNotes'].includes(t) && !isDateKey(o.date)) errors.push(`${t}[${i}] har ogiltigt datum.`)
      if (t === 'entries' && (typeof o.kcal !== 'number' || typeof o.protein !== 'number')) errors.push(`entries[${i}] saknar kcal eller protein.`)
      if (t === 'workouts' && typeof o.durationMin !== 'number') errors.push(`workouts[${i}] saknar varaktighet.`)
    })
    if (errors.length > 20) break
  }
  return { ok: errors.length === 0, errors: errors.slice(0, 20), counts, backup: errors.length === 0 ? (b as Backup) : undefined }
}

/** Ersätter all data med innehållet i säkerhetskopian (i en transaktion – allt eller inget). */
export async function importBackup(backup: Backup): Promise<void> {
  const v = validateBackup(backup)
  if (!v.ok) throw new Error(v.errors.join('\n'))
  await db.transaction('rw', ALL_TABLES.map((t) => db[t]), async () => {
    for (const t of ALL_TABLES) {
      const tbl = db[t] as unknown as { clear(): Promise<void>; bulkPut(r: unknown[]): Promise<unknown> }
      await tbl.clear()
      const rows = (backup.data as Record<string, unknown[]>)[t] ?? []
      if (rows.length) await tbl.bulkPut(rows)
    }
  })
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', ALL_TABLES.map((t) => db[t]), async () => {
    for (const t of ALL_TABLES) await (db[t] as unknown as { clear(): Promise<void> }).clear()
  })
}

export async function markBackupDone() {
  await saveSettings({ lastBackupAt: nowIso() })
}

// ---------- CSV ----------

function csvCell(v: unknown): string {
  if (v === undefined || v === null) return ''
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function toCsv(header: string[], rows: unknown[][]): string {
  // Semikolon som avgränsare och BOM så att svenska Excel öppnar filen korrekt.
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
}

export async function exportCsv(kind: 'mat' | 'traning' | 'vikt', start: string, end: string): Promise<string> {
  if (kind === 'mat') {
    const rows = (await db.entries.where('date').between(start, end, true, true).toArray())
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    return toCsv(['Datum', 'Tid', 'Måltid', 'Livsmedel', 'Mängd', 'Enhet', 'kcal', 'Protein (g)', 'Fett (g)', 'Kolhydrater (g)', 'Grupp', 'Källa', 'Anteckning'],
      rows.map((e) => [e.date, e.time, e.meal, e.name, e.amount, e.unit, e.kcal, e.protein, e.fat, e.carbs, e.groupName, e.source, e.note]))
  }
  if (kind === 'traning') {
    const rows = (await db.workouts.where('date').between(start, end, true, true).toArray()).sort((a, b) => a.date.localeCompare(b.date))
    return toCsv(['Datum', 'Tid', 'Aktivitet', 'Beskrivning', 'Minuter', 'Intensitet', 'kcal', 'kcal uppskattad', 'Distans (km)', 'Snittpuls', 'Maxpuls', 'Ansträngning', 'Anteckning'],
      rows.map((w) => [w.date, w.time, w.activity, w.label, w.durationMin, w.intensity, w.kcal, w.kcalEstimated ? 'ja' : 'nej', w.distanceKm, w.avgHr, w.maxHr, w.rpe, w.note]))
  }
  const rows = (await db.measurements.where('date').between(start, end, true, true).toArray()).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  return toCsv(['Datum', 'Tid', 'Vikt (kg)', 'Midja (cm)', 'Vilopuls', 'Anteckning'], rows.map((m) => [m.date, m.time, m.weightKg, m.waistCm, m.restingHr, m.note]))
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
