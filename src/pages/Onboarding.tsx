import { useMemo, useState } from 'react'
import { Button, Card, Chip, HideNav, Notice, NumberField, PageHeader, Segmented, Stepper, cx, useToast } from '../components/ui'
import { calculateTargets, checkManualTargets, bmi } from '../lib/calc'
import { nowTime, todayKey } from '../lib/dates'
import { fmtDec, fmtInt, parseNum } from '../lib/format'
import { ACTIVITY_LEVEL_LABEL, GOAL_LABEL, NUTRIENT_LABEL, SEX_LABEL } from '../lib/labels'
import { addMeasurement, getSettings, saveProfileAndGoal } from '../lib/repo'
import { seedStarterLibrary } from '../lib/demo'
import { nowIso } from '../lib/db'
import { navigate } from '../router'
import type { ActivityLevel, ExerciseCalorieMode, Goal, MainGoal, NutrientKey, Profile, Sex } from '../lib/types'

const RATES = [0, 0.25, 0.5, 0.75, 1]

interface Props { existing?: Profile; currentGoal?: Goal; latestWeight?: number; exerciseMode?: ExerciseCalorieMode; onDone?: () => void }

export default function Onboarding(props: Props) {
  const { existing, currentGoal, latestWeight } = props
  const editing = !!existing
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [age, setAge] = useState(existing ? String(existing.age) : '')
  const [sex, setSex] = useState<Sex>(existing?.sex ?? 'man')
  const [height, setHeight] = useState(existing ? String(existing.heightCm) : '')
  const [weight, setWeight] = useState(latestWeight ? String(latestWeight).replace('.', ',') : existing ? String(existing.startWeightKg).replace('.', ',') : '')
  const [goalWeight, setGoalWeight] = useState(existing ? String(existing.goalWeightKg).replace('.', ',') : '')
  const [rate, setRate] = useState(existing?.rateKgPerWeek ?? 0.5)
  const [activity, setActivity] = useState<ActivityLevel>(existing?.activityLevel ?? 'stillasittande')
  const [sessions, setSessions] = useState(existing?.trainingSessionsPerWeek ?? 3)
  const [goals, setGoals] = useState<MainGoal[]>(existing?.mainGoals ?? ['viktnedgang', 'behalla_muskler', 'fotbollskondition'])
  const [notes, setNotes] = useState(existing?.healthNotes ?? '')
  const [tracked, setTracked] = useState<NutrientKey[]>(existing?.trackedNutrients ?? ['kcal', 'protein'])
  const [manual, setManual] = useState(currentGoal?.mode === 'manuellt')
  const [mKcal, setMKcal] = useState(currentGoal ? String(currentGoal.kcal) : '')
  const [mProtein, setMProtein] = useState(currentGoal ? String(currentGoal.protein) : '')
  const [exerciseMode] = useState<ExerciseCalorieMode>(props.exerciseMode ?? 'separat')
  const [showErrors, setShowErrors] = useState(false)

  const n = { age: parseNum(age), height: parseNum(height), weight: parseNum(weight), goal: parseNum(goalWeight) }
  const errors = {
    age: n.age === undefined || n.age < 15 || n.age > 100 ? 'Ange en ålder mellan 15 och 100 år.' : undefined,
    height: n.height === undefined || n.height < 120 || n.height > 230 ? 'Ange längd i centimeter, t.ex. 180.' : undefined,
    weight: n.weight === undefined || n.weight < 35 || n.weight > 300 ? 'Ange vikt i kilo, t.ex. 92,5.' : undefined,
    goal: n.goal === undefined || n.goal < 35 || n.goal > 300 ? 'Ange målvikt i kilo.' : undefined,
  }
  const stepValid = [!errors.age && !errors.height && !errors.weight, !errors.goal, true, true, true]

  const result = useMemo(() => {
    if (errors.age || errors.height || errors.weight || errors.goal) return undefined
    return calculateTargets({
      age: n.age!, sex, heightCm: n.height!, weightKg: n.weight!, goalWeightKg: n.goal!, rateKgPerWeek: rate,
      activityLevel: activity, trainingSessionsPerWeek: sessions, mainGoals: goals, exerciseMode,
    })
  }, [n.age, n.height, n.weight, n.goal, sex, rate, activity, sessions, goals, exerciseMode, errors.age, errors.height, errors.weight, errors.goal])

  const manualWarnings = manual && parseNum(mKcal) && parseNum(mProtein) ? checkManualTargets(parseNum(mKcal)!, parseNum(mProtein)!, sex, n.weight) : []
  const manualError = manual && (!(parseNum(mKcal)! >= 800) || !(parseNum(mProtein)! > 0)) ? 'Ange kalorimål (minst 800) och proteinmål.' : undefined

  const next = () => {
    if (!stepValid[step]) { setShowErrors(true); return }
    setShowErrors(false)
    setStep((s) => Math.min(4, s + 1))
    window.scrollTo({ top: 0 })
  }

  const save = async () => {
    if (!result || manualError) { setShowErrors(true); return }
    const t = nowIso()
    const profile: Profile = {
      id: 'me', age: n.age!, sex, heightCm: n.height!, startWeightKg: existing?.startWeightKg ?? n.weight!, goalWeightKg: n.goal!,
      rateKgPerWeek: rate, activityLevel: activity, trainingSessionsPerWeek: sessions, mainGoals: goals, healthNotes: notes,
      trackedNutrients: tracked, createdAt: existing?.createdAt ?? t, updatedAt: t,
    }
    const goal = manual
      ? { mode: 'manuellt' as const, kcal: Math.round(parseNum(mKcal)!), protein: Math.round(parseNum(mProtein)!), fat: result.fat, carbs: result.carbs }
      : { mode: 'beraknat' as const, kcal: result.kcal, protein: result.protein, fat: result.fat, carbs: result.carbs, calculation: result.calculation }
    await saveProfileAndGoal(profile, goal)
    if (!editing) {
      await addMeasurement({ date: todayKey(), time: nowTime(), weightKg: n.weight!, note: 'Startvikt' })
      await seedStarterLibrary()
      await getSettings()
      navigate('/', { replace: true })
    } else {
      toast('Profil och mål sparade')
      props.onDone?.()
    }
  }

  const steps = ['Om dig', 'Mål', 'Aktivitet', 'Uppföljning', 'Dina mål']
  return (
    <div className="pb-safe">
      <HideNav />
      <PageHeader title={editing ? 'Profil och mål' : 'Välkommen'} back={editing ? '/installningar' : undefined}
        subtitle={`Steg ${step + 1} av 5 · ${steps[step]}`} />
      <div className="max-w-2xl mx-auto px-4 pb-40">
        <ol className="flex gap-1.5 mb-4" aria-label="Steg">
          {steps.map((s, i) => (
            <li key={s} className="flex-1">
              <button type="button" disabled={!editing && i > step} onClick={() => setStep(i)} aria-label={`${s}${i === step ? ' (aktuellt steg)' : ''}`}
                className={cx('h-1.5 w-full rounded-full block', i <= step ? 'bg-brand' : 'bg-line')} />
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="grid gap-4 anim-pop">
            {!editing && <p className="text-muted">Några uppgifter behövs för att föreslå rimliga dagliga mål. Allt sparas bara på den här enheten.</p>}
            <NumberField label="Ålder" value={age} onChange={setAge} suffix="år" integer error={showErrors ? errors.age : undefined} />
            <div>
              <p className="text-[15px] font-medium mb-1.5" id="sex-label">Kön <span className="text-muted font-normal">(används i beräkningen av basalomsättning)</span></p>
              <Segmented label="Kön" value={sex} onChange={setSex} size="sm" options={(['man', 'kvinna', 'ej_angivet'] as Sex[]).map((v) => ({ value: v, label: SEX_LABEL[v] }))} />
            </div>
            <NumberField label="Längd" value={height} onChange={setHeight} suffix="cm" integer error={showErrors ? errors.height : undefined} />
            <NumberField label="Nuvarande vikt" value={weight} onChange={setWeight} suffix="kg" error={showErrors ? errors.weight : undefined} />
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5 anim-pop">
            <div>
              <p className="text-[15px] font-medium mb-2">Vad vill du uppnå? <span className="text-muted font-normal">Välj en eller flera.</span></p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(GOAL_LABEL) as MainGoal[]).map((g) => (
                  <Chip key={g} selected={goals.includes(g)} onClick={() => setGoals((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g]))}>{GOAL_LABEL[g]}</Chip>
                ))}
              </div>
            </div>
            <NumberField label="Målvikt" value={goalWeight} onChange={setGoalWeight} suffix="kg" error={showErrors ? errors.goal : undefined}
              hint={n.goal && n.height ? `BMI vid målvikt: ${fmtDec(bmi(n.goal, n.height))}` : undefined} />
            <div>
              <p className="text-[15px] font-medium mb-1.5">Önskad takt</p>
              <Segmented label="Önskad takt för viktnedgång" size="sm" value={String(rate)} onChange={(v) => setRate(Number(v))}
                options={RATES.map((r) => ({ value: String(r), label: r === 0 ? 'Behåll' : `${fmtDec(r)} kg` }))} />
              <p className="text-sm text-muted mt-1.5">Kilo per vecka. 0,25–0,5 kg/vecka brukar vara lättare att hålla och skonsamt för muskelmassan.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5 anim-pop">
            <fieldset>
              <legend className="text-[15px] font-medium mb-2">Vardagsaktivitet <span className="text-muted font-normal">(utan träning)</span></legend>
              <div className="grid gap-2">
                {(Object.keys(ACTIVITY_LEVEL_LABEL) as ActivityLevel[]).map((a) => (
                  <label key={a} className={cx('flex items-center gap-3 rounded-2xl border p-3 min-h-14 cursor-pointer', activity === a ? 'border-brand bg-brand-soft' : 'border-line bg-card')}>
                    <input type="radio" name="activity" className="h-5 w-5 accent-[var(--brand)]" checked={activity === a} onChange={() => setActivity(a)} />
                    <span><span className="block font-semibold">{ACTIVITY_LEVEL_LABEL[a].label}</span><span className="block text-sm text-muted">{ACTIVITY_LEVEL_LABEL[a].help}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-medium">Träningspass per vecka</p><p className="text-sm text-muted">Inklusive fotboll</p></div>
              <Stepper label="träningspass per vecka" value={sessions} onChange={(v) => setSessions(Math.max(0, Math.min(14, v)))} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-5 anim-pop">
            <fieldset>
              <legend className="text-[15px] font-medium mb-2">Vilka värden vill du följa?</legend>
              <div className="grid gap-2">
                {(['kcal', 'protein', 'fat', 'carbs'] as NutrientKey[]).map((k) => {
                  const locked = k === 'kcal' || k === 'protein'
                  return (
                    <label key={k} className="flex items-center gap-3 bg-card border border-line rounded-2xl p-3 min-h-12">
                      <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={tracked.includes(k)} disabled={locked}
                        onChange={() => setTracked((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))} />
                      <span>{NUTRIENT_LABEL[k]}{locked && <span className="text-sm text-muted"> · alltid</span>}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="notes" className="text-[15px] font-medium">Särskilda kost- eller hälsouppgifter <span className="text-muted font-normal">(valfritt)</span></label>
              <textarea id="notes" className="field min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="T.ex. laktosintolerans, knäskada, mediciner som påverkar aptiten" />
              <p className="text-sm text-muted">Sparas bara lokalt som en påminnelse för dig. Används inte i beräkningen och skickas aldrig till AI.</p>
            </div>
          </div>
        )}

        {step === 4 && !result && <Notice tone="warn">Fyll i ålder, längd, vikt och målvikt i steg 1 och 2 först.</Notice>}
        {step === 4 && result && (
          <div className="grid gap-4 anim-pop">
            <Card>
              <h2 className="font-bold text-lg mb-3">Förslag på dagligt mål</h2>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl bg-kcal-soft p-3"><div className="text-sm">Energi</div><div className="text-2xl font-bold tabular">{fmtInt(result.kcal)} <span className="text-base font-semibold">kcal</span></div></div>
                <div className="rounded-xl bg-protein-soft p-3"><div className="text-sm">Protein</div><div className="text-2xl font-bold tabular">{result.protein} <span className="text-base font-semibold">g</span></div></div>
                <div className="rounded-xl bg-card-2 p-3"><div className="text-sm">Fett (ca)</div><div className="text-lg font-semibold tabular">{result.fat} g</div></div>
                <div className="rounded-xl bg-card-2 p-3"><div className="text-sm">Kolhydrater (ca)</div><div className="text-lg font-semibold tabular">{result.carbs} g</div></div>
              </div>
              <h3 className="font-semibold mb-1">Så har målet beräknats</h3>
              <p className="text-sm text-muted mb-2">Metod: {result.calculation.method}</p>
              <dl className="text-[15px] grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular">
                <dt className="text-muted">Basalomsättning (BMR)</dt><dd className="text-right">{fmtInt(result.calculation.bmr)} kcal</dd>
                <dt className="text-muted">× aktivitetsfaktor {fmtDec(result.calculation.pal)}</dt><dd className="text-right">{fmtInt(result.calculation.dailyLifeKcal)} kcal</dd>
                <dt className="text-muted">+ planerad träning i snitt</dt><dd className="text-right">{fmtInt(result.calculation.plannedTrainingKcalPerDay)} kcal</dd>
                <dt className="font-medium">Beräknat energibehov</dt><dd className="text-right font-medium">{fmtInt(result.calculation.tdee)} kcal</dd>
                <dt className="text-muted">− kaloriunderskott</dt><dd className="text-right">{fmtInt(result.calculation.appliedDeficit)} kcal</dd>
                <dt className="font-medium">Dagligt kalorimål</dt><dd className="text-right font-medium">{fmtInt(result.kcal)} kcal</dd>
                <dt className="text-muted">Protein</dt><dd className="text-right">{result.calculation.proteinPerKg.toFixed(1).replace('.', ',')} g/kg × {fmtDec(result.calculation.proteinReferenceWeightKg)} kg</dd>
              </dl>
              <p className="text-sm text-muted mt-3">
                Proteinet räknas på {result.calculation.proteinReferenceWeightKg === n.goal ? 'målvikten' : 'nuvarande vikt'}. Planerad träning räknas med som {sessions} pass × 300 kcal per vecka
                {result.calculation.plannedTrainingKcalPerDay === 0 ? ' – men inte nu, eftersom registrerade träningskalorier läggs till dagens budget.' : '. Registrerade träningskalorier läggs därför inte till dagens budget som standard.'}
                {' '}Underskott: {fmtDec(rate)} kg × 7 700 kcal ÷ 7 dagar, högst 25 % av energibehovet.
              </p>
            </Card>
            {result.calculation.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
            {result.saferRate !== undefined && result.saferRate !== rate && (
              <Button variant="soft" onClick={() => setRate(result.saferRate!)}>Använd säkrare takt: {fmtDec(result.saferRate)} kg/vecka</Button>
            )}
            <Card>
              <label className="flex items-center gap-3 min-h-11">
                <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={manual} onChange={(e) => { setManual(e.target.checked); if (!mKcal) { setMKcal(String(result.kcal)); setMProtein(String(result.protein)) } }} />
                <span className="font-medium">Jag vill ange egna mål i stället</span>
              </label>
              {manual && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <NumberField label="Kalorier" value={mKcal} onChange={setMKcal} suffix="kcal" integer />
                  <NumberField label="Protein" value={mProtein} onChange={setMProtein} suffix="g" integer />
                  {showErrors && manualError && <p className="col-span-2 text-sm text-danger" role="alert">{manualError}</p>}
                  {manualWarnings.map((w) => <div key={w} className="col-span-2"><Notice tone="warn">{w}</Notice></div>)}
                </div>
              )}
            </Card>
            <p className="text-sm text-muted">Resultatet är en uppskattning baserad på generella formler och inte medicinsk rådgivning. Följ hur vikten utvecklas över några veckor och justera vid behov.</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 z-50 bg-bg/95 backdrop-blur border-t border-line px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto flex gap-2">
          {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>Tillbaka</Button>}
          {step < 4
            ? <Button variant="primary" block onClick={next}>Fortsätt</Button>
            : <Button variant="primary" block onClick={save}>{editing ? 'Spara mål' : 'Börja använda appen'}</Button>}
        </div>
      </div>
    </div>
  )
}
