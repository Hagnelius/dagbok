import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, Empty, OriginBadge, Progress, SectionTitle, Sheet, TextInput, cx, useConfirm, useToast } from '../components/ui'
import EntryEditor from '../components/EntryEditor'
import WorkoutForm from '../components/WorkoutForm'
import InstallHint from '../components/InstallHint'
import { useDay, useLatestWeight, useProfile, useToday } from '../hooks'
import { addDays, capitalize, formatLong, formatShort, relativeDayLabel } from '../lib/dates'
import { db } from '../lib/db'
import { dailyFeedback } from '../lib/feedback'
import { fmtInt, fmtKg, fmtDec } from '../lib/format'
import { ACTIVITY_ICON, ACTIVITY_LABEL, INTENSITY_LABEL, MEAL_LABEL, unitText } from '../lib/labels'
import { calorieBars, sumNutrition } from '../lib/nutrition'
import { copyEntries, deleteEntry, saveDayNote, saveMealTemplate } from '../lib/repo'
import { periodStats } from '../lib/stats'
import { MEALS, type FoodEntry, type MealType, type Workout } from '../lib/types'
import { navigate } from '../router'

export default function DayPage({ date }: { date: string }) {
  const today = useToday()
  const day = useDay(date)
  const profile = useProfile()
  const latestWeight = useLatestWeight(date)
  const [editEntry, setEditEntry] = useState<FoodEntry | null>(null)
  const [editWorkout, setEditWorkout] = useState<Workout | null>(null)
  const [mealMenu, setMealMenu] = useState<MealType | null>(null)
  const isToday = date === today
  const q = isToday ? '' : `?datum=${date}`

  const week = useLiveQuery(async () => {
    const start = addDays(date, -7)
    const end = addDays(date, -1)
    const [e, w, g] = await Promise.all([db.entries.where('date').between(start, end, true, true).toArray(), db.workouts.where('date').between(start, end, true, true).toArray(), db.goals.toArray()])
    return periodStats(e, w, g, start, end)
  }, [date])

  if (!day) return <div aria-busy="true" className="min-h-dvh" />
  const { totals, budget, goal, entries, workouts, measurements, settings } = day
  const proteinGoal = goal?.protein ?? 0
  const feedback = dailyFeedback({ isToday, isPast: date < today, entryCount: entries.length, eaten: totals.kcal, budget: budget.budget, protein: totals.protein, proteinGoal, week, exerciseExtra: budget.adjustment })
  const tracked = profile?.trackedNutrients ?? ['kcal', 'protein']
  const bars = calorieBars(totals.kcal, budget.baseKcal, budget.adjustment)

  return (
    <div>
      <header className="pt-safe sticky top-0 z-20 bg-bg/90 backdrop-blur-md">
        <div className="flex items-center gap-1 px-2 min-h-14 max-w-2xl mx-auto">
          <button type="button" aria-label="Föregående dag" onClick={() => navigate(`/dag/${addDays(date, -1)}`)} className="min-h-11 min-w-11 rounded-xl text-brand active:bg-card-2 flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[22px] font-bold leading-tight">{relativeDayLabel(date, today)}</h1>
            <p className="text-sm text-muted">{capitalize(formatLong(date))}</p>
          </div>
          {isToday ? <span className="min-w-11" aria-hidden="true" /> : (
            <button type="button" aria-label="Nästa dag" onClick={() => navigate(addDays(date, 1) === today ? '/' : `/dag/${addDays(date, 1)}`)} className="min-h-11 min-w-11 rounded-xl text-brand active:bg-card-2 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 grid gap-3">
        {!isToday && <a href="#/" className="text-center text-brand font-semibold min-h-11 flex items-center justify-center">Gå till idag</a>}
        {isToday && <InstallHint />}

        <Card aria-label="Dagens status">
          {goal ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <p className="tabular"><span className="text-[34px] font-bold leading-none">{fmtInt(totals.kcal)}</span> <span className="text-muted">av {fmtInt(budget.baseKcal)} kcal</span></p>
                <p className="text-right text-[15px] font-semibold tabular">{totals.kcal <= budget.baseKcal ? `${fmtInt(budget.baseKcal - totals.kcal)} kvar` : bars.extraCap > 0 ? 'Mål nått' : `${fmtInt(totals.kcal - budget.baseKcal)} över`}</p>
              </div>
              <div className="mt-2"><Progress color="kcal" value={bars.baseUsed} max={budget.baseKcal} label="Kalorier" valueText={`${fmtInt(totals.kcal)} av ${fmtInt(budget.baseKcal)} kcal`} /></div>
              <div className="flex items-baseline justify-between gap-2 mt-4">
                <p className="tabular"><span className="text-xl font-bold">{fmtInt(totals.protein)}</span> <span className="text-muted">av {fmtInt(proteinGoal)} g protein</span></p>
                <p className="text-[15px] font-semibold tabular">{totals.protein >= proteinGoal ? 'Mål nått' : `${fmtInt(proteinGoal - totals.protein)} g kvar`}</p>
              </div>
              <div className="mt-2"><Progress color="protein" value={totals.protein} max={proteinGoal} label="Protein" valueText={`${fmtInt(totals.protein)} av ${fmtInt(proteinGoal)} gram`} /></div>
              {bars.extraCap > 0 && (
                <div className="mt-4" data-testid="traningsstapel">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="tabular"><span className="text-xl font-bold">{fmtInt(bars.extraUsed)}</span> <span className="text-muted">av ≈ {fmtInt(bars.extraCap)} kcal från träning</span></p>
                    <p className="text-[15px] font-semibold tabular text-right">
                      {bars.over > 0 ? `${fmtInt(bars.over)} över` : bars.extraUsed === 0 ? 'Oanvänt' : `${fmtInt(bars.extraCap - bars.extraUsed)} kvar`}
                    </p>
                  </div>
                  <div className="mt-2"><Progress color="train" value={bars.extraUsed} max={bars.extraCap} label="Extrakalorier från träning" valueText={`${fmtInt(bars.extraUsed)} av ${fmtInt(bars.extraCap)} kcal från träning använda`} /></div>
                  <p className="text-sm text-muted mt-1">{settings.exerciseCalorieMode === 'alla' ? 'All' : `${settings.exerciseCaloriePercent} % av`} dagens uppskattade träning ({fmtInt(budget.exerciseKcal)} kcal). Fylls när du ätit mer än grundmålet.</p>
                </div>
              )}
              {(tracked.includes('fat') || tracked.includes('carbs')) && (
                <p className="text-sm text-muted mt-3 tabular">
                  {tracked.includes('fat') && <>Fett {fmtInt(totals.fat)}{goal.fat ? ` / ${goal.fat}` : ''} g{totals.fatIncomplete && totals.count > 0 ? '*' : ''}</>}
                  {tracked.includes('fat') && tracked.includes('carbs') && ' · '}
                  {tracked.includes('carbs') && <>Kolhydrater {fmtInt(totals.carbs)}{goal.carbs ? ` / ${goal.carbs}` : ''} g{totals.carbsIncomplete && totals.count > 0 ? '*' : ''}</>}
                  {(totals.fatIncomplete || totals.carbsIncomplete) && totals.count > 0 && <span className="block text-xs">* vissa poster saknar värde</span>}
                </p>
              )}
              <details className="mt-3 text-[15px]">
                <summary className="cursor-pointer text-brand font-semibold min-h-11 flex items-center">Så räknas dagens budget</summary>
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular mt-1">
                  <dt className="text-muted">Grundmål</dt><dd className="text-right">{fmtInt(budget.baseKcal)} kcal</dd>
                  <dt className="text-muted">Uppskattad träningsförbrukning</dt><dd className="text-right">≈ {fmtInt(budget.exerciseKcal)} kcal</dd>
                  <dt className="text-muted">Justering av matbudget{settings.exerciseCalorieMode === 'andel' ? ` (${settings.exerciseCaloriePercent} %)` : settings.exerciseCalorieMode === 'separat' ? ' (visas separat)' : ' (allt)'}</dt><dd className="text-right">+{fmtInt(budget.adjustment)} kcal</dd>
                  <dt className="font-medium">Dagens matbudget</dt><dd className="text-right font-medium">{fmtInt(budget.budget)} kcal</dd>
                  <dt className="text-muted">Ätit</dt><dd className="text-right">{fmtInt(budget.eaten)} kcal</dd>
                </dl>
                <p className="text-sm text-muted mt-2">Träningsförbrukning är uppskattad och kan avvika betydligt från verkligheten. Ändra hanteringen under Inställningar.</p>
              </details>
            </>
          ) : <Empty>Inget mål är satt. <a className="text-brand underline" href="#/installningar/profil">Ange mål</a></Empty>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[15px]">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-train" aria-hidden="true" />
              {workouts.length ? `${workouts.length} pass · ${workouts.reduce((s, w) => s + w.durationMin, 0)} min · ≈ ${fmtInt(budget.exerciseKcal)} kcal` : 'Ingen träning registrerad'}
            </span>
            {latestWeight && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-weight" aria-hidden="true" />{fmtKg(latestWeight.weight)} <span className="text-muted">({latestWeight.date === date ? (isToday ? 'idag' : 'denna dag') : formatShort(latestWeight.date)})</span></span>}
          </div>
        </Card>

        <div className="px-1 text-[15px] leading-relaxed" aria-live="polite">
          {feedback.map((f) => <p key={f}>{f}</p>)}
          {week && week.loggedDays > 0 && week.avgKcal !== undefined && (
            <p className="text-muted mt-1 tabular">Senaste 7 dagarna: {fmtInt(week.avgKcal)} kcal och {fmtInt(week.avgProtein ?? 0)} g protein per dag ({week.loggedDays} dagar med data).</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2" aria-label="Snabbknappar">
          <a href={`#/mat/snabb${q}`} className="col-span-2 bg-brand text-brand-ink rounded-2xl min-h-14 flex items-center justify-center gap-2 font-semibold text-[17px] active:opacity-85">⚡ Snabbregistrera</a>
          <QuickLink href={`#/mat/sok${q}`} icon="🍽️" label="Lägg till mat" tone="bg-kcal-soft" />
          <QuickLink href={`#/traning${q}`} icon="🏃" label="Lägg till träning" tone="bg-train-soft" />
          <QuickLink href={`#/ai${q}`} icon="🎙️" label="Skriv eller prata in" tone="bg-protein-soft" />
          <QuickLink href={`#/ai?lage=foto${isToday ? '' : `&datum=${date}`}`} icon="📷" label="Fota maten" tone="bg-protein-soft" />
          <div className="col-span-2"><QuickLink href={`#/vikt${q}`} icon="⚖️" label="Registrera vikt" tone="bg-weight-soft" /></div>
        </div>

        {MEALS.map((meal) => {
          const list = entries.filter((e) => e.meal === meal)
          const t = sumNutrition(list)
          return (
            <section key={meal} aria-labelledby={`meal-${meal}`}>
              <div className="flex items-center justify-between mt-3 mb-1 px-1">
                <h2 id={`meal-${meal}`} className="font-bold text-[17px]">{MEAL_LABEL[meal]}</h2>
                <div className="flex items-center gap-1">
                  {list.length > 0 && <span className="text-sm text-muted tabular mr-1">{fmtInt(t.kcal)} kcal · {fmtInt(t.protein)} g</span>}
                  <button type="button" aria-label={`Fler val för ${MEAL_LABEL[meal].toLowerCase()}`} onClick={() => setMealMenu(meal)} className="min-h-11 min-w-11 rounded-full text-muted active:bg-card-2 text-xl">⋯</button>
                  <a href={`#/mat/snabb?maltid=${meal}${isToday ? '' : `&datum=${date}`}`} aria-label={`Lägg till i ${MEAL_LABEL[meal].toLowerCase()}`} className="min-h-11 min-w-11 rounded-full bg-card border border-line text-brand text-xl font-bold flex items-center justify-center active:bg-card-2">+</a>
                </div>
              </div>
              {list.length > 0 && (
                <Card className="!p-0 overflow-hidden" as="div">
                  <ul className="divide-y divide-line">
                    {list.map((e) => <EntryRow key={e.id} e={e} onOpen={() => setEditEntry(e)} />)}
                  </ul>
                </Card>
              )}
            </section>
          )
        })}

        <SectionTitle id="tr-h" right={<a href={`#/traning${q}`} className="text-brand font-semibold min-h-11 flex items-center px-2">+ Lägg till</a>}>Träning</SectionTitle>
        {workouts.length ? (
          <Card className="!p-0 overflow-hidden" as="div">
            <ul className="divide-y divide-line" aria-labelledby="tr-h">
              {workouts.map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => setEditWorkout(w)} className="w-full flex items-center gap-3 px-4 py-3 text-left min-h-14 active:bg-card-2">
                    <span className="text-2xl" aria-hidden="true">{ACTIVITY_ICON[w.activity]}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold truncate">{w.label || ACTIVITY_LABEL[w.activity]}</span>
                      <span className="block text-sm text-muted">{w.durationMin} min · {INTENSITY_LABEL[w.intensity].toLowerCase()} intensitet{w.distanceKm ? ` · ${fmtDec(w.distanceKm)} km` : ''}{w.time ? ` · ${w.time}` : ''}</span>
                    </span>
                    {w.kcal ? <span className="text-sm tabular text-right">{w.kcalEstimated ? '≈ ' : ''}{fmtInt(w.kcal)} kcal<span className="block text-xs text-muted">{w.kcalEstimated ? 'uppskattat' : 'angivet'}</span></span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : <Empty>Ingen träning registrerad.</Empty>}

        {measurements.length > 0 && (
          <>
            <SectionTitle>Vikt och mått</SectionTitle>
            <Card as="div">
              <ul className="grid gap-1">
                {measurements.map((m) => (
                  <li key={m.id} className="flex justify-between tabular">
                    <span>{m.time}{m.note ? ` · ${m.note}` : ''}</span>
                    <span>{[m.weightKg && fmtKg(m.weightKg), m.waistCm && `midja ${fmtDec(m.waistCm)} cm`, m.restingHr && `vilopuls ${m.restingHr}`].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
              <a href={`#/vikt${q}`} className="text-brand font-semibold text-sm mt-2 inline-block min-h-11 py-3">Visa vikt och trend</a>
            </Card>
          </>
        )}

        <DayNoteEditor key={`${date}:${day.note?.updatedAt ?? ''}`} date={date} note={day.note?.note ?? ''} />
      </div>

      <EntryEditor key={editEntry?.id ?? 'ingen'} entry={editEntry} onClose={() => setEditEntry(null)} />
      <Sheet open={!!editWorkout} onClose={() => setEditWorkout(null)} title="Redigera träning">
        {editWorkout && <WorkoutForm key={editWorkout.id} date={date} existing={editWorkout} weightKg={latestWeight?.weight} onDone={() => setEditWorkout(null)} />}
      </Sheet>
      <MealMenu key={mealMenu ?? 'ingen'} meal={mealMenu} date={date} entries={entries.filter((e) => e.meal === mealMenu)} onClose={() => setMealMenu(null)} />
    </div>
  )
}

function QuickLink({ href, icon, label, tone }: { href: string; icon: string; label: string; tone: string }) {
  return (
    <a href={href} className="bg-card border border-line rounded-2xl min-h-14 flex items-center gap-2 px-3 font-semibold active:bg-card-2">
      <span className={cx('h-9 w-9 rounded-xl flex items-center justify-center', tone)} aria-hidden="true">{icon}</span>
      <span className="text-[15px] leading-tight">{label}</span>
    </a>
  )
}

function EntryRow({ e, onOpen }: { e: FoodEntry; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="w-full flex items-center gap-3 px-4 py-3 text-left min-h-14 active:bg-card-2">
        <span className="flex-1 min-w-0">
          <span className="block font-semibold truncate">{e.name}</span>
          <span className="block text-sm text-muted truncate">
            {unitText(e.amount, e.unit)}{e.groupName ? ` · ${e.groupName}` : ''}{e.note ? ` · ${e.note}` : ''}
          </span>
          {(e.origin === 'osakert' || e.origin === 'uppskattat') && <span className="block mt-1"><OriginBadge origin={e.origin} /></span>}
        </span>
        <span className="text-right tabular shrink-0">
          <span className="block font-semibold">{fmtInt(e.kcal)} kcal</span>
          <span className="block text-sm text-muted">{fmtDec(e.protein)} g protein</span>
        </span>
      </button>
    </li>
  )
}

function DayNoteEditor({ date, note }: { date: string; note: string }) {
  const [v, setV] = useState(note)
  return (
    <div className="mt-4 mb-6">
      <label htmlFor="daynote" className="text-[13px] font-semibold uppercase tracking-wide text-muted px-1">Dagens anteckning</label>
      <textarea id="daynote" className="field min-h-20 mt-2" value={v} placeholder="Hur kändes dagen? Sömn, ork, matchdag …"
        onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== note) void saveDayNote(date, v) }} />
    </div>
  )
}

function MealMenu({ meal, date, entries, onClose }: { meal: MealType | null; date: string; entries: FoodEntry[]; onClose: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [target, setTarget] = useState('')
  const [name, setName] = useState(meal ? `Min ${MEAL_LABEL[meal].toLowerCase()}` : '')
  const yesterday = addDays(date, -1)
  const yCount = useLiveQuery(() => (meal ? db.entries.where('[date+meal]').equals([yesterday, meal]).count() : 0), [meal, yesterday])
  const label = meal ? MEAL_LABEL[meal] : ''
  const t = useMemo(() => sumNutrition(entries), [entries])
  if (!meal) return null
  return (
    <>
      <Sheet open onClose={onClose} title={label}>
        <div className="grid gap-3">
          <Button onClick={() => { onClose(); navigate(`/mat/snabb?maltid=${meal}&datum=${date}`) }}>Lägg till i {label.toLowerCase()}</Button>
          <Button disabled={!yCount} onClick={async () => { const n = await copyEntries(yesterday, date, meal); toast(`${n} poster kopierade från igår`); onClose() }}>
            Kopiera gårdagens {label.toLowerCase()}{yCount ? ` (${yCount})` : ' – inget registrerat'}
          </Button>
          {entries.length > 0 && (
            <>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><TextInput label={`Kopiera ${label.toLowerCase()} till dag`} type="date" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
                <Button disabled={!target} onClick={async () => { const n = await copyEntries(date, target, meal); toast(`${n} poster kopierade till ${formatShort(target)}`); onClose() }}>Kopiera</Button>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><TextInput label="Spara som standardmåltid" value={name} onChange={(e) => setName(e.target.value)} /></div>
                <Button disabled={!name.trim()} onClick={async () => {
                  await saveMealTemplate({ name: name.trim(), meal, items: entries.map((e) => ({ id: e.id, name: e.name, amount: e.amount, unit: e.unit, kcal: e.kcal, protein: e.protein, fat: e.fat, carbs: e.carbs })) })
                  toast('Standardmåltiden är sparad'); onClose()
                }}>Spara</Button>
              </div>
              <p className="text-sm text-muted tabular">{entries.length} poster · {fmtInt(t.kcal)} kcal · {fmtInt(t.protein)} g protein</p>
              <Button variant="danger" onClick={async () => {
                if (!(await confirm.ask(`Ta bort alla ${entries.length} poster i ${label.toLowerCase()}?`, 'Ta bort alla'))) return
                const backup = [...entries]
                for (const e of entries) await deleteEntry(e.id)
                toast('Måltiden togs bort', { label: 'Ångra', run: () => { void db.entries.bulkAdd(backup) } })
                onClose()
              }}>Ta bort hela måltiden</Button>
            </>
          )}
        </div>
      </Sheet>
      {confirm.node}
    </>
  )
}
