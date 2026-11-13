import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, Empty, PageHeader, Segmented, TextInput } from '../components/ui'
import { ActivityBars, DailyBarChart, WeightChart } from '../components/Charts'
import { useProfile, useSettings, useToday } from '../hooks'
import { db } from '../lib/db'
import { addDays, capitalize, diffDays, endOfMonth, endOfWeek, formatLong, formatMonth, formatShort, isoWeek, startOfMonth, startOfWeek } from '../lib/dates'
import { fmtDec, fmtInt, fmtSigned } from '../lib/format'
import { ACTIVITY_LABEL } from '../lib/labels'
import { dailyWeights, periodStats, rollingAverage, weightSeries } from '../lib/stats'

type Mode = 'dag' | 'vecka' | 'manad' | 'eget'

export default function AnalysisPage() {
  const today = useToday()
  const settings = useSettings()
  const profile = useProfile()
  const [mode, setMode] = useState<Mode>('vecka')
  const [anchor, setAnchor] = useState(today)
  const [custom, setCustom] = useState({ start: addDays(today, -27), end: today })
  const [includeToday, setIncludeToday] = useState(false)

  let start: string, end: string, title: string
  if (mode === 'dag') { start = end = anchor; title = capitalize(formatLong(anchor)) }
  else if (mode === 'vecka') { start = startOfWeek(anchor); end = endOfWeek(anchor); title = `Vecka ${isoWeek(anchor)} · ${formatShort(start)}–${formatShort(end)}` }
  else if (mode === 'manad') { start = startOfMonth(anchor); end = endOfMonth(anchor); title = capitalize(formatMonth(anchor)) }
  else { start = custom.start <= custom.end ? custom.start : custom.end; end = custom.start <= custom.end ? custom.end : custom.start; title = `${formatShort(start)}–${formatShort(end)}` }
  const shownEnd = end > today ? today : end

  const data = useLiveQuery(async () => {
    const [entries, workouts, goals, ms] = await Promise.all([
      db.entries.where('date').between(start, end, true, true).toArray(),
      db.workouts.where('date').between(start, end, true, true).toArray(),
      db.goals.toArray(),
      db.measurements.toArray(),
    ])
    return { entries, workouts, goals, ms }
  }, [start, end])

  const step = (dir: -1 | 1) => {
    if (mode === 'dag') setAnchor(addDays(anchor, dir))
    else if (mode === 'vecka') setAnchor(addDays(anchor, 7 * dir))
    else if (mode === 'manad') setAnchor(dir < 0 ? addDays(startOfMonth(anchor), -1) : addDays(endOfMonth(anchor), 1))
  }
  const includesToday = start <= today && end >= today
  const s = data ? periodStats(data.entries, data.workouts, data.goals, start, shownEnd < start ? start : shownEnd, { excludeDates: includesToday && !includeToday && mode !== 'dag' ? [today] : [] }) : undefined
  const daily = data ? dailyWeights(data.ms, settings.weighInPolicy) : []
  const wSeries = weightSeries(daily, start, end)
  const wStart = rollingAverage(daily, addDays(start, -1)) ?? wSeries[0]?.avg7
  const wEnd = wSeries.length ? wSeries[wSeries.length - 1].avg7 : undefined
  const periodLabel = mode === 'vecka' ? 'Veckans' : mode === 'manad' ? 'Månadens' : 'Periodens'

  return (
    <div>
      <PageHeader title="Analys" />
      <div className="max-w-2xl mx-auto px-4 grid gap-3 pb-6">
        <Segmented label="Period" value={mode} onChange={(m) => { setMode(m); setAnchor(today) }} size="sm"
          options={[{ value: 'dag', label: 'Dag' }, { value: 'vecka', label: 'Vecka' }, { value: 'manad', label: 'Månad' }, { value: 'eget', label: 'Eget' }]} />
        {mode === 'eget' ? (
          <div className="grid grid-cols-2 gap-2">
            <TextInput label="Från" type="date" value={custom.start} max={today} onChange={(e) => e.target.value && setCustom({ ...custom, start: e.target.value })} />
            <TextInput label="Till" type="date" value={custom.end} max={today} onChange={(e) => e.target.value && setCustom({ ...custom, end: e.target.value })} />
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <button type="button" aria-label="Föregående period" onClick={() => step(-1)} className="min-h-11 min-w-11 rounded-xl text-brand text-2xl active:bg-card-2">‹</button>
            <h2 className="font-bold text-center" aria-live="polite">{title}</h2>
            <button type="button" aria-label="Nästa period" disabled={end >= today} onClick={() => step(1)} className="min-h-11 min-w-11 rounded-xl text-brand text-2xl active:bg-card-2 disabled:opacity-30">›</button>
          </div>
        )}
        {includesToday && mode !== 'dag' && (
          <label className="flex items-center gap-2 text-[15px] min-h-11 px-1">
            <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={includeToday} onChange={(e) => setIncludeToday(e.target.checked)} />
            Räkna med idag i snitten (dagen pågår)
          </label>
        )}

        {s && (
          <>
            <Card aria-label="Sammanfattning">
              {s.loggedDays === 0 ? <Empty>Ingen mat registrerad under perioden.</Empty> : (
                <div className="grid gap-1 text-[17px] tabular">
                  {mode === 'dag' ? (
                    <>
                      <p><b>{fmtInt(s.avgKcal!)} kcal</b> av {fmtInt(s.avgKcalGoal ?? 0)} kcal</p>
                      <p><b>{fmtInt(s.avgProtein!)} g protein</b> av {fmtInt(s.avgProteinGoal ?? 0)} g</p>
                      <a className="text-brand font-semibold text-[15px] min-h-11 flex items-center" href={anchor === today ? '#/' : `#/dag/${anchor}`}>Öppna dagen</a>
                    </>
                  ) : (
                    <>
                      <p>{periodLabel} genomsnitt: <b>{fmtInt(s.avgKcal!)} kcal</b> per dag</p>
                      <p>{periodLabel} genomsnitt: <b>{fmtInt(s.avgProtein!)} g protein</b> per dag</p>
                    </>
                  )}
                  <p>Träning: <b>{s.workoutCount} pass</b>, totalt {s.workoutMinutes} minuter{s.workoutKcal ? ` · ≈ ${fmtInt(s.workoutKcal)} kcal${s.workoutKcalEstimated ? ' (uppskattat)' : ''}` : ''}</p>
                </div>
              )}
            </Card>

            {mode !== 'dag' && s.loggedDays > 0 && (
              <div className="grid grid-cols-2 gap-2 tabular">
                <Tile label="Dagar med registrering" value={`${s.loggedDays} av ${s.days.filter((d) => d.date <= today).length}`} />
                <Tile label="Proteinmålet nått" value={`${s.proteinGoalHitDays} av ${s.loggedDays} dagar`} />
                <Tile label="Kalorier mot målet" value={s.kcalDiffFromGoal !== undefined ? `${s.kcalDiffFromGoal > 0 ? '+' : s.kcalDiffFromGoal < 0 ? '−' : '±'}${fmtInt(Math.abs(s.kcalDiffFromGoal))} kcal/dag` : '–'}
                  sub={s.avgKcalGoal ? `mål i snitt ${fmtInt(s.avgKcalGoal)}` : undefined} />
                <Tile label="Vikt (7-dagarssnitt)" value={wEnd !== undefined ? `${fmtDec(wEnd)} kg` : '–'} sub={wEnd !== undefined && wStart !== undefined ? `${fmtSigned(Math.round((wEnd - wStart) * 10) / 10)} kg under perioden` : undefined} />
              </div>
            )}

            {mode !== 'dag' && s.loggedDays > 0 && (
              <>
                <Card>
                  <h2 className="font-bold mb-1">Kalorier per dag</h2>
                  <p className="text-sm text-muted mb-2">Tomma dagar saknar registrering och räknas inte som noll.</p>
                  <DailyBarChart title="Kalorier" unit="kcal" color="kcal" goal={s.avgKcalGoal}
                    data={s.days.filter((d) => d.date <= today).map((d) => ({ date: d.date, value: d.hasData ? d.kcal : null }))} />
                </Card>
                <Card>
                  <h2 className="font-bold mb-2">Protein per dag</h2>
                  <DailyBarChart title="Protein" unit="g" color="protein" goal={s.avgProteinGoal}
                    data={s.days.filter((d) => d.date <= today).map((d) => ({ date: d.date, value: d.hasData ? d.protein : null }))} />
                </Card>
              </>
            )}

            {wSeries.length > 1 && (
              <Card>
                <h2 className="font-bold mb-2">Viktutveckling</h2>
                <WeightChart data={wSeries} goal={profile?.goalWeightKg} />
              </Card>
            )}

            {s.workoutCount > 0 && (
              <Card>
                <h2 className="font-bold mb-3">Träning per aktivitet</h2>
                <ActivityBars data={s.byActivity.map((a) => ({ label: ACTIVITY_LABEL[a.activity], minutes: a.minutes, count: a.count }))} />
                {mode !== 'dag' && diffDays(shownEnd, start) >= 6 && (
                  <p className="text-sm text-muted mt-3">I snitt {fmtDec(s.workoutCount / ((diffDays(shownEnd, start) + 1) / 7))} pass och {fmtInt(s.workoutMinutes / ((diffDays(shownEnd, start) + 1) / 7))} minuter per vecka.</p>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-line/70 rounded-2xl p-3">
      <div className="text-sm text-muted">{label}</div>
      <div className="font-bold text-[17px]">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}
