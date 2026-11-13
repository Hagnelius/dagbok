import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, Empty, PageHeader, SectionTitle, cx } from '../components/ui'
import { useToday } from '../hooks'
import { db } from '../lib/db'
import { addDays, capitalize, dateRange, endOfMonth, formatMonth, formatShort, isoWeek, startOfMonth, startOfWeek } from '../lib/dates'
import { fmtDec, fmtInt } from '../lib/format'
import { ACTIVITY_LABEL, unitText } from '../lib/labels'
import { searchHistory } from '../lib/repo'
import { goalForDate, periodStats } from '../lib/stats'
import { navigate } from '../router'

const WD = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön']

export default function HistoryPage() {
  const today = useToday()
  const [month, setMonth] = useState(startOfMonth(today))
  const [q, setQ] = useState('')
  const start = startOfWeek(month)
  const end = addDays(startOfWeek(endOfMonth(month)), 6)

  const data = useLiveQuery(async () => {
    const [entries, workouts, ms, notes, goals] = await Promise.all([
      db.entries.where('date').between(start, end, true, true).toArray(),
      db.workouts.where('date').between(start, end, true, true).toArray(),
      db.measurements.where('date').between(start, end, true, true).toArray(),
      db.dayNotes.where('date').between(start, end, true, true).toArray(),
      db.goals.toArray(),
    ])
    return { entries, workouts, ms, notes, goals }
  }, [start, end])
  const results = useLiveQuery(() => searchHistory(q), [q])

  const stats = data ? periodStats(data.entries, data.workouts, data.goals, start, end) : undefined
  const byDate = new Map(stats?.days.map((d) => [d.date, d]))
  const weights = new Set(data?.ms.filter((m) => m.weightKg).map((m) => m.date))
  const notes = new Set(data?.notes.map((n) => n.date))
  const weeks: string[][] = []
  const days = dateRange(start, end)
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

  return (
    <div>
      <PageHeader title="Historik" />
      <div className="max-w-2xl mx-auto px-4 grid gap-3 pb-6">
        <input type="search" className="field" placeholder="Sök i historiken, t.ex. pizza eller fotboll" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sök i historiken" enterKeyHint="search" />

        {q.trim() ? (
          <Card className="!p-0 overflow-hidden" as="div">
            {results && results.entries.length + results.workouts.length === 0 && <div className="p-4"><Empty>Inga träffar.</Empty></div>}
            <ul className="divide-y divide-line">
              {results?.workouts.map((w) => (
                <li key={w.id}><a href={`#/dag/${w.date}`} className="flex justify-between px-4 py-3 min-h-12 active:bg-card-2">
                  <span><b>{w.label || ACTIVITY_LABEL[w.activity]}</b> <span className="text-muted">· {w.durationMin} min</span></span><span className="text-muted">{formatShort(w.date)}</span></a></li>
              ))}
              {results?.entries.map((e) => (
                <li key={e.id}><a href={`#/dag/${e.date}`} className="flex justify-between gap-2 px-4 py-3 min-h-12 active:bg-card-2">
                  <span className="min-w-0 truncate"><b>{e.name}</b> <span className="text-muted">· {unitText(e.amount, e.unit)} · {fmtInt(e.kcal)} kcal</span></span><span className="text-muted shrink-0">{formatShort(e.date)}</span></a></li>
              ))}
            </ul>
          </Card>
        ) : (
          <>
            <Card>
              <div className="flex items-center justify-between mb-2">
                <button type="button" aria-label="Föregående månad" onClick={() => setMonth(startOfMonth(addDays(month, -1)))} className="min-h-11 min-w-11 rounded-xl text-brand text-2xl active:bg-card-2">‹</button>
                <h2 className="font-bold text-lg" aria-live="polite">{capitalize(formatMonth(month))}</h2>
                <button type="button" aria-label="Nästa månad" disabled={month >= startOfMonth(today)} onClick={() => setMonth(addDays(endOfMonth(month), 1))} className="min-h-11 min-w-11 rounded-xl text-brand text-2xl active:bg-card-2 disabled:opacity-30">›</button>
              </div>
              <table className="w-full table-fixed" role="grid" aria-label={`Kalender ${formatMonth(month)}`}>
                <thead><tr>{WD.map((d) => <th key={d} scope="col" className="text-xs text-muted font-semibold pb-1">{d}</th>)}</tr></thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w[0]}>
                      {w.map((d) => {
                        const s = byDate.get(d)
                        const inMonth = d.slice(0, 7) === month.slice(0, 7)
                        const future = d > today
                        const g = data ? goalForDate(data.goals, d) : undefined
                        const parts = [s?.hasData ? `mat ${fmtInt(s.kcal)} kcal` : 'ingen mat registrerad', s?.workoutMin ? `träning ${s.workoutMin} min` : '', weights.has(d) ? 'vikt' : '', notes.has(d) ? 'anteckning' : ''].filter(Boolean)
                        return (
                          <td key={d} className="p-0.5">
                            <button type="button" disabled={future} onClick={() => navigate(d === today ? '/' : `/dag/${d}`)}
                              aria-label={`${formatShort(d)}: ${parts.join(', ')}`}
                              className={cx('w-full aspect-square max-h-16 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[15px] tabular active:bg-card-2 disabled:opacity-30',
                                d === today && 'ring-2 ring-brand', !inMonth && 'opacity-40', s?.hasData && 'bg-card-2')}>
                              <span className={cx(d === today && 'font-bold text-brand')}>{Number(d.slice(8))}</span>
                              <span className="flex gap-0.5 h-1.5" aria-hidden="true">
                                {s?.hasData && <span className="h-1.5 w-1.5 rounded-full bg-kcal" />}
                                {!!s?.workoutMin && <span className="h-1.5 w-1.5 rounded-full bg-train" />}
                                {weights.has(d) && <span className="h-1.5 w-1.5 rounded-full bg-weight" />}
                              </span>
                              {s?.hasData && g && <span className="text-[10px] leading-none text-muted">{fmtDec(Math.round(s.kcal / 100) / 10)}k</span>}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted mt-2">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-kcal" />Mat</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-train" />Träning</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-weight" />Vikt</span>
                <span>Siffran = tusental kcal</span>
              </div>
            </Card>

            <SectionTitle>Veckor</SectionTitle>
            <div className="grid gap-2">
              {[...weeks].reverse().filter((w) => w[0] <= today).map((w) => {
                const s = data ? periodStats(data.entries, data.workouts, data.goals, w[0], w[6], { excludeDates: [today] }) : undefined
                if (!s) return null
                return (
                  <Card key={w[0]} as="div" className="!py-3">
                    <div className="flex justify-between items-baseline">
                      <h3 className="font-semibold">Vecka {isoWeek(w[0])} <span className="text-sm text-muted font-normal">{formatShort(w[0])}–{formatShort(w[6])}</span></h3>
                      <span className="text-sm text-muted">{s.loggedDays} av 7 dagar</span>
                    </div>
                    {s.loggedDays ? (
                      <p className="text-[15px] tabular">{fmtInt(s.avgKcal!)} kcal/dag · {fmtInt(s.avgProtein!)} g protein/dag · {s.workoutCount} pass ({s.workoutMinutes} min)</p>
                    ) : <p className="text-[15px] text-muted">Ingen mat registrerad{s.workoutCount ? ` · ${s.workoutCount} pass` : ''}</p>}
                  </Card>
                )
              })}
            </div>
            <p className="text-sm text-muted px-1">Veckosnitt räknas bara på dagar med registrerad mat. Dagens pågående dag räknas inte med.</p>
          </>
        )}
      </div>
    </div>
  )
}

