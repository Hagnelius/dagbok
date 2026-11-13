import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, Empty, NumberField, PageHeader, Segmented, SectionTitle, Sheet, TextInput, useConfirm, useToast } from '../components/ui'
import { WeightChart } from '../components/Charts'
import { useProfile, useSettings, useToday } from '../hooks'
import { db } from '../lib/db'
import { addDays, formatShort, nowTime } from '../lib/dates'
import { fmtDec, fmtKg, fmtSigned, parseNum } from '../lib/format'
import { addMeasurement, deleteMeasurement, updateMeasurement } from '../lib/repo'
import { dailyWeights, weightSeries, weightSummary } from '../lib/stats'
import type { Measurement } from '../lib/types'

const POLICY_TEXT = { forsta: 'dagens första vägning', senaste: 'dagens senaste vägning', medel: 'medelvärdet av dagens vägningar' }

export default function WeightPage({ date }: { date: string }) {
  const today = useToday()
  const toast = useToast()
  const settings = useSettings()
  const profile = useProfile()
  const all = useLiveQuery(() => db.measurements.toArray(), []) ?? []
  const [range, setRange] = useState<'30' | '90' | 'alla'>('90')
  const [edit, setEdit] = useState<Measurement | null>(null)
  const [f, setF] = useState({ weight: '', waist: '', hr: '', note: '', date, time: date === today ? nowTime() : '07:00' })
  const [error, setError] = useState<string>()

  const daily = dailyWeights(all, settings.weighInPolicy)
  const summary = weightSummary(daily, profile?.startWeightKg, profile?.goalWeightKg)
  const series = weightSeries(daily, range === 'alla' ? undefined : addDays(today, -Number(range)))

  const save = async () => {
    const weightKg = parseNum(f.weight), waistCm = parseNum(f.waist), restingHr = parseNum(f.hr)
    if (weightKg === undefined && waistCm === undefined && restingHr === undefined) { setError('Ange vikt eller något av måtten.'); return }
    if (weightKg !== undefined && (weightKg < 30 || weightKg > 300)) { setError('Vikten ska anges i kilo, t.ex. 91,4.'); return }
    if (waistCm !== undefined && (waistCm < 40 || waistCm > 250)) { setError('Midjemåttet ska anges i centimeter.'); return }
    setError(undefined)
    await addMeasurement({ date: f.date, time: f.time || '07:00', weightKg, waistCm, restingHr, note: f.note.trim() || undefined })
    toast('Mätningen är sparad')
    setF({ ...f, weight: '', waist: '', hr: '', note: '' })
  }

  const sorted = [...all].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
  const lastWaist = sorted.find((m) => m.waistCm)
  const lastHr = sorted.find((m) => m.restingHr)

  return (
    <div>
      <PageHeader title="Vikt och mått" back="/" />
      <div className="max-w-2xl mx-auto px-4 grid gap-3 pb-6">
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><NumberField label="Vikt" value={f.weight} onChange={(v) => setF({ ...f, weight: v })} suffix="kg" placeholder={summary.latest ? fmtDec(summary.latest.weight) : undefined} autoFocus /></div>
            <TextInput label="Datum" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <TextInput label="Tid" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-brand font-semibold min-h-11 flex items-center">Midjemått, vilopuls och anteckning</summary>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <NumberField label="Midjemått" value={f.waist} onChange={(v) => setF({ ...f, waist: v })} suffix="cm" />
              <NumberField label="Vilopuls" value={f.hr} onChange={(v) => setF({ ...f, hr: v })} suffix="bpm" integer />
              <div className="col-span-2"><TextInput label="Anteckning" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            </div>
          </details>
          {error && <p className="text-danger text-sm mt-2" role="alert">{error}</p>}
          <Button variant="primary" block className="mt-3" onClick={save}>Spara</Button>
        </Card>

        {summary.latest ? (
          <Card aria-label="Viktsammanfattning">
            <div className="grid grid-cols-2 gap-3 tabular">
              <Stat label="Senaste vikt" value={fmtKg(summary.latest.weight)} sub={formatShort(summary.latest.date)} />
              <Stat label="7-dagarssnitt" value={summary.avg7 !== undefined ? fmtKg(summary.avg7) : '–'} sub="trend" />
              <Stat label="Sedan start" value={summary.changeSinceStart !== undefined ? `${fmtSigned(summary.changeSinceStart)} kg` : '–'} sub={summary.start ? `start ${fmtDec(summary.start)} kg` : undefined} />
              <Stat label="Kvar till målvikt" value={summary.toGoal !== undefined ? (summary.toGoal > 0 ? `${fmtDec(summary.toGoal)} kg` : 'Målvikt nådd') : '–'} sub={profile ? `mål ${fmtDec(profile.goalWeightKg)} kg` : undefined} />
              <Stat label="Senaste 7 dagarna" value={summary.change7 !== undefined ? `${fmtSigned(summary.change7)} kg` : 'För lite data'} />
              <Stat label="Senaste 30 dagarna" value={summary.change30 !== undefined ? `${fmtSigned(summary.change30)} kg` : 'För lite data'} />
            </div>
            <p className="text-sm text-muted mt-3">Förändringar jämför 7-dagarssnitt för att dämpa dagliga svängningar (vätska, salt, mage). Vid flera vägningar samma dag används {POLICY_TEXT[settings.weighInPolicy]}.</p>
            {(lastWaist || lastHr) && <p className="text-sm mt-2">{lastWaist && <>Midja {fmtDec(lastWaist.waistCm!)} cm ({formatShort(lastWaist.date)}) </>}{lastHr && <>· Vilopuls {lastHr.restingHr} ({formatShort(lastHr.date)})</>}</p>}
          </Card>
        ) : <Card><Empty>Ingen vikt registrerad ännu.</Empty></Card>}

        {series.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-2 gap-2">
              <h2 className="font-bold">Utveckling</h2>
              <div className="w-48"><Segmented label="Tidsperiod" size="sm" value={range} onChange={setRange} options={[{ value: '30', label: '30 d' }, { value: '90', label: '90 d' }, { value: 'alla', label: 'Allt' }]} /></div>
            </div>
            <WeightChart data={series} goal={profile?.goalWeightKg} />
          </Card>
        )}

        {sorted.length > 0 && (
          <>
            <SectionTitle>Alla mätningar</SectionTitle>
            <Card className="!p-0 overflow-hidden" as="div">
              <ul className="divide-y divide-line">
                {sorted.slice(0, 60).map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => setEdit(m)} className="w-full flex justify-between items-center px-4 py-3 min-h-12 text-left active:bg-card-2 tabular">
                      <span>{formatShort(m.date)} <span className="text-muted">{m.time}</span>{m.note && <span className="text-muted"> · {m.note}</span>}</span>
                      <span className="font-semibold">{[m.weightKg && fmtKg(m.weightKg), m.waistCm && `${fmtDec(m.waistCm)} cm`, m.restingHr && `${m.restingHr} bpm`].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>
      <MeasurementEditor m={edit} onClose={() => setEdit(null)} />
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-card-2 p-3">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

function MeasurementEditor({ m, onClose }: { m: Measurement | null; onClose: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const s = (n?: number) => (n === undefined ? '' : String(n).replace('.', ','))
  const [f, setF] = useState({ weight: '', waist: '', hr: '', note: '', date: '', time: '' })
  const [loadedId, setLoadedId] = useState<string>()
  if (m && m.id !== loadedId) {
    setLoadedId(m.id)
    setF({ weight: s(m.weightKg), waist: s(m.waistCm), hr: s(m.restingHr), note: m.note ?? '', date: m.date, time: m.time })
  }
  if (!m) return null
  return (
    <>
      <Sheet open onClose={onClose} title="Redigera mätning" footer={<div className="flex gap-2">
        <Button variant="danger" onClick={async () => { if (await confirm.ask('Ta bort mätningen?')) { await deleteMeasurement(m.id); toast('Mätningen togs bort'); onClose() } }}>Ta bort</Button>
        <Button variant="primary" block onClick={async () => {
          await updateMeasurement(m.id, { weightKg: parseNum(f.weight), waistCm: parseNum(f.waist), restingHr: parseNum(f.hr), note: f.note.trim() || undefined, date: f.date, time: f.time })
          toast('Ändringen är sparad'); onClose()
        }}>Spara</Button>
      </div>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><NumberField label="Vikt" value={f.weight} onChange={(v) => setF({ ...f, weight: v })} suffix="kg" /></div>
          <TextInput label="Datum" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <TextInput label="Tid" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          <NumberField label="Midjemått" value={f.waist} onChange={(v) => setF({ ...f, waist: v })} suffix="cm" />
          <NumberField label="Vilopuls" value={f.hr} onChange={(v) => setF({ ...f, hr: v })} suffix="bpm" />
          <div className="col-span-2"><TextInput label="Anteckning" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        </div>
      </Sheet>
      {confirm.node}
    </>
  )
}
