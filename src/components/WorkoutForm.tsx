import { useMemo, useState } from 'react'
import { Button, Chip, NumberField, Segmented, TextInput, useConfirm, useToast } from './ui'
import { ACTIVITY_ICON, ACTIVITY_LABEL, INTENSITY_LABEL } from '../lib/labels'
import { ACTIVITIES, type ActivityType, type Intensity, type Workout } from '../lib/types'
import { estimateWorkoutKcal } from '../lib/exercise'
import { parseNum } from '../lib/format'
import { addWorkouts, deleteWorkout, duplicateWorkout, saveWorkoutTemplate, updateWorkout } from '../lib/repo'
import { formatShort } from '../lib/dates'
import { db } from '../lib/db'

const DURATIONS = [20, 30, 45, 60, 90]
const s = (n?: number) => (n === undefined ? '' : String(n).replace('.', ','))

export interface WorkoutPreset { activity: ActivityType; durationMin: number; intensity: Intensity; label?: string }

/** Formulär för att registrera eller redigera ett träningspass. */
export default function WorkoutForm({ date, weightKg, existing, preset, onDone }: {
  date: string; weightKg?: number; existing?: Workout; preset?: WorkoutPreset | null; onDone: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const [activity, setActivity] = useState<ActivityType>(existing?.activity ?? preset?.activity ?? 'crosstrainer')
  const [label, setLabel] = useState(existing?.label ?? preset?.label ?? '')
  const [duration, setDuration] = useState(s(existing?.durationMin ?? preset?.durationMin ?? 45))
  const [intensity, setIntensity] = useState<Intensity>(existing?.intensity ?? preset?.intensity ?? 'medel')
  const [kcal, setKcal] = useState(existing && !existing.kcalEstimated ? s(existing.kcal) : '')
  const [day, setDay] = useState(existing?.date ?? date)
  const [time, setTime] = useState(existing?.time ?? '')
  const [distance, setDistance] = useState(s(existing?.distanceKm))
  const [avgHr, setAvgHr] = useState(s(existing?.avgHr))
  const [maxHr, setMaxHr] = useState(s(existing?.maxHr))
  const [rpe, setRpe] = useState(s(existing?.rpe))
  const [note, setNote] = useState(existing?.note ?? '')
  const [more, setMore] = useState(!!(existing?.distanceKm || existing?.avgHr || existing?.rpe || existing?.time))
  const [asTemplate, setAsTemplate] = useState(false)
  const [error, setError] = useState<string>()
  const [copyDate, setCopyDate] = useState('')


  const dur = parseNum(duration)
  const estimate = useMemo(() => (weightKg && dur ? estimateWorkoutKcal(activity, intensity, dur, weightKg) : undefined), [activity, intensity, dur, weightKg])

  const save = async () => {
    if (!dur || dur <= 0 || dur > 1440) { setError('Ange varaktighet i minuter.'); return }
    const userKcal = parseNum(kcal)
    const rpeN = parseNum(rpe)
    if (rpeN !== undefined && (rpeN < 1 || rpeN > 10)) { setError('Upplevd ansträngning anges från 1 till 10.'); return }
    const data = {
      date: day, time: time || undefined, activity, label: label.trim() || undefined, durationMin: Math.round(dur), intensity,
      kcal: userKcal ?? estimate, kcalEstimated: userKcal === undefined, distanceKm: parseNum(distance), avgHr: parseNum(avgHr),
      maxHr: parseNum(maxHr), rpe: rpeN, note: note.trim() || undefined,
    }
    if (existing) await updateWorkout(existing.id, data)
    else await addWorkouts([{ ...data, source: preset ? 'mall' : 'manuell' }])
    if (asTemplate) await saveWorkoutTemplate({ name: label.trim() || `${dur} min ${ACTIVITY_LABEL[activity].toLowerCase()}`, activity, label: label.trim() || undefined, durationMin: Math.round(dur), intensity })
    toast(existing ? 'Passet är uppdaterat' : 'Träningen är sparad')
    onDone()
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-[15px] font-medium mb-2">Aktivitet</p>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Aktivitet">
          {ACTIVITIES.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={activity === a} onClick={() => setActivity(a)}
              className={`rounded-2xl border min-h-16 flex flex-col items-center justify-center text-xs font-semibold gap-0.5 ${activity === a ? 'border-train bg-train-soft' : 'border-line bg-card'}`}>
              <span className="text-xl" aria-hidden="true">{ACTIVITY_ICON[a]}</span>{a === 'annat' ? 'Annat' : ACTIVITY_LABEL[a]}
            </button>
          ))}
        </div>
      </div>
      {(activity === 'annat' || activity === 'fotboll' || label) && (
        <TextInput label={activity === 'annat' ? 'Vad gjorde du?' : 'Beskrivning (valfritt)'} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={activity === 'fotboll' ? 'T.ex. Fotbollsträning, Match' : 'T.ex. Padel'} />
      )}
      <div>
        <NumberField label="Varaktighet" value={duration} onChange={setDuration} suffix="min" integer />
        <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
          {DURATIONS.map((d) => <Chip key={d} selected={dur === d} onClick={() => setDuration(String(d))}>{d} min</Chip>)}
        </div>
      </div>
      <div>
        <p className="text-[15px] font-medium mb-1.5">Intensitet</p>
        <Segmented label="Intensitet" value={intensity} onChange={setIntensity} options={(['lag', 'medel', 'hog'] as Intensity[]).map((v) => ({ value: v, label: INTENSITY_LABEL[v] }))} />
      </div>
      <NumberField label="Kaloriförbrukning (valfritt)" value={kcal} onChange={setKcal} suffix="kcal" integer
        placeholder={estimate ? `≈ ${estimate}` : undefined}
        hint={estimate ? `Lämnas fältet tomt används en uppskattning på ca ${estimate} kcal (nettoförbrukning utifrån din vikt, aktivitet, tid och intensitet). Ange eget värde om du har ett från klocka eller maskin.` : 'Registrera vikt för att få en uppskattning.'} />
      <TextInput label="Datum" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      <button type="button" className="text-brand font-semibold text-left min-h-11" aria-expanded={more} onClick={() => setMore(!more)}>
        {more ? '− Färre uppgifter' : '+ Tid, distans, puls och ansträngning'}
      </button>
      {more && (
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Starttid" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <NumberField label="Distans" value={distance} onChange={setDistance} suffix="km" />
          <NumberField label="Snittpuls" value={avgHr} onChange={setAvgHr} suffix="bpm" integer />
          <NumberField label="Maxpuls" value={maxHr} onChange={setMaxHr} suffix="bpm" integer />
          <div className="col-span-2"><NumberField label="Upplevd ansträngning (1–10)" value={rpe} onChange={setRpe} integer /></div>
        </div>
      )}
      <TextInput label="Anteckning (valfritt)" value={note} onChange={(e) => setNote(e.target.value)} />
      {!existing && (
        <label className="flex items-center gap-2 min-h-11">
          <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={asTemplate} onChange={(e) => setAsTemplate(e.target.checked)} />
          Spara även som träningsmall
        </label>
      )}
      {error && <p className="text-danger text-sm" role="alert">{error}</p>}
      <Button variant="primary" block onClick={save}>{existing ? 'Spara ändringar' : 'Spara träning'}</Button>
      {existing && (
        <div className="grid gap-2 border-t border-line pt-3">
          <Button onClick={async () => { await duplicateWorkout(existing.id); toast('Passet duplicerades'); onDone() }}>Duplicera</Button>
          <div className="flex gap-2 items-end">
            <div className="flex-1"><TextInput label="Kopiera till dag" type="date" value={copyDate} onChange={(e) => setCopyDate(e.target.value)} /></div>
            <Button disabled={!copyDate} onClick={async () => { await duplicateWorkout(existing.id, copyDate); toast(`Kopierat till ${formatShort(copyDate)}`); onDone() }}>Kopiera</Button>
          </div>
          <Button variant="danger" onClick={async () => {
            if (!(await confirm.ask('Ta bort träningspasset?'))) return
            const b = await db.workouts.get(existing.id)
            await deleteWorkout(existing.id)
            toast('Passet togs bort', b ? { label: 'Ångra', run: () => { void db.workouts.add(b) } } : undefined)
            onDone()
          }}>Ta bort</Button>
        </div>
      )}
      {confirm.node}
    </div>
  )
}
