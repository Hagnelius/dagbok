import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, PageHeader, useToast } from '../components/ui'
import WorkoutForm, { type WorkoutPreset } from '../components/WorkoutForm'
import { useLatestWeight, useToday } from '../hooks'
import { db } from '../lib/db'
import { estimateWorkoutKcal } from '../lib/exercise'
import { ACTIVITY_ICON, INTENSITY_LABEL } from '../lib/labels'
import { relativeDayLabel } from '../lib/dates'
import { addWorkouts, bumpWorkoutTemplate } from '../lib/repo'
import { finishTo } from '../router'
import type { WorkoutTemplate } from '../lib/types'

export default function WorkoutPage({ date }: { date: string }) {
  const today = useToday()
  const toast = useToast()
  const weight = useLatestWeight(date)
  const templates = (useLiveQuery(() => db.workoutTemplates.toArray(), []) ?? [])
    .sort((a, b) => b.useCount - a.useCount || a.sortOrder - b.sortOrder)
  const [preset, setPreset] = useState<(WorkoutPreset & { n: number }) | null>(null)

  const quickAdd = async (t: WorkoutTemplate) => {
    await addWorkouts([{
      date, activity: t.activity, label: t.label ?? (t.activity === 'annat' ? t.name : undefined), durationMin: t.durationMin, intensity: t.intensity,
      kcal: weight ? estimateWorkoutKcal(t.activity, t.intensity, t.durationMin, weight.weight) : undefined, kcalEstimated: true, source: 'mall',
    }])
    await bumpWorkoutTemplate(t.id)
    toast(`${t.name} sparad`)
    finishTo(date, today)
  }

  return (
    <div>
      <PageHeader title="Lägg till träning" back="/" subtitle={relativeDayLabel(date, today)} />
      <div className="max-w-2xl mx-auto px-4 grid gap-4 pb-6">
        {templates.length > 0 && (
          <section aria-labelledby="wt-h">
            <h2 id="wt-h" className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-2 px-1">Snabbval – ett tryck sparar</h2>
            <div className="grid grid-cols-2 gap-2">
              {templates.slice(0, 8).map((t) => (
                <div key={t.id} className="bg-card border border-line rounded-2xl flex items-stretch overflow-hidden">
                  <button type="button" onClick={() => quickAdd(t)} className="flex-1 text-left p-3 min-h-16 active:bg-card-2" aria-label={`Spara ${t.name}`}>
                    <span className="text-xl" aria-hidden="true">{ACTIVITY_ICON[t.activity]}</span>
                    <span className="block font-semibold leading-tight">{t.name}</span>
                    <span className="block text-sm text-muted">{t.durationMin} min · {INTENSITY_LABEL[t.intensity].toLowerCase()}</span>
                  </button>
                  <button type="button" onClick={() => { setPreset({ activity: t.activity, durationMin: t.durationMin, intensity: t.intensity, label: t.label, n: (preset?.n ?? 0) + 1 }); void bumpWorkoutTemplate(t.id) }}
                    aria-label={`Justera ${t.name} innan du sparar`} className="px-2 min-w-11 text-muted border-l border-line active:bg-card-2">✎</button>
                </div>
              ))}
            </div>
            <a href="#/favoriter/traning" className="text-brand font-semibold text-sm inline-block min-h-11 py-3">Hantera träningsmallar</a>
          </section>
        )}
        <Card>
          <h2 className="font-bold text-lg mb-3">{preset ? 'Justera och spara' : 'Nytt pass'}</h2>
          <WorkoutForm key={preset?.n ?? 0} date={date} weightKg={weight?.weight} preset={preset} onDone={() => finishTo(date, today)} />
        </Card>
      </div>
    </div>
  )
}
