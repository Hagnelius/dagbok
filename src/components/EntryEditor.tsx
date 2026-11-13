import { useState } from 'react'
import { Button, NumberField, Select, Sheet, TextInput, OriginBadge, useConfirm, useToast } from './ui'
import { MEAL_LABEL, UNIT_LABEL } from '../lib/labels'
import { MEALS, UNITS, type FoodEntry, type MealType, type Unit } from '../lib/types'
import { parseNum } from '../lib/format'
import { deleteEntry, duplicateEntry, saveFood, updateEntry } from '../lib/repo'
import { db } from '../lib/db'
import { formatShort } from '../lib/dates'
import { rescale, type Scalable } from '../lib/units'

const str = (n?: number) => (n === undefined || n === null ? '' : String(n).replace('.', ','))

/** Redigera, duplicera, kopiera eller ta bort en matpost. */
export default function EntryEditor({ entry, onClose }: { entry: FoodEntry | null; onClose: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [f, setF] = useState(() => init(entry))
  const [scaleWithAmount, setScaleWithAmount] = useState(true)
  const [copyDate, setCopyDate] = useState('')
  const [error, setError] = useState<string>()
  // Utgångsläge för omräkning: senaste värden som användaren själv satt (eller postens ursprungliga).
  const [base, setBase] = useState<Scalable | null>(() => (entry ? { name: entry.name, amount: entry.amount, unit: entry.unit, kcal: entry.kcal, protein: entry.protein, fat: entry.fat, carbs: entry.carbs } : null))
  const [scaleNote, setScaleNote] = useState<string>()

  if (!entry) return null

  const recalc = (amount: string, unit: Unit) => {
    const n = parseNum(amount)
    if (!scaleWithAmount || !base || !n) { setF({ ...f, amount, unit }); return }
    const r = rescale(base, n, unit)
    if (!r) {
      setF({ ...f, amount, unit })
      setScaleNote(`Kan inte räkna om automatiskt från ${UNIT_LABEL[base.unit]} till ${UNIT_LABEL[unit]} – kontrollera kalorier och protein.`)
      return
    }
    setScaleNote(r.method === 'livsmedelslista' ? 'Omräknat med livsmedelslistans gramvikter.' : undefined)
    setF({ ...f, amount, unit, kcal: str(r.nutrition.kcal), protein: str(r.nutrition.protein), fat: str(r.nutrition.fat), carbs: str(r.nutrition.carbs), dirtyNutrition: false })
  }
  const onAmount = (v: string) => recalc(v, f.unit)
  const onUnit = (u: Unit) => recalc(f.amount, u)
  /** När användaren skriver in egna näringsvärden blir de nytt utgångsläge för omräkning. */
  const onNutrition = (k: 'kcal' | 'protein' | 'fat' | 'carbs', v: string) => {
    const next = { ...f, [k]: v, dirtyNutrition: true }
    setF(next)
    const a = parseNum(next.amount)
    if (a && a > 0) setBase({ name: next.name, amount: a, unit: next.unit, kcal: parseNum(next.kcal) ?? 0, protein: parseNum(next.protein) ?? 0, fat: parseNum(next.fat), carbs: parseNum(next.carbs) })
    setScaleNote(undefined)
  }

  const patch = (): Partial<FoodEntry> | undefined => {
    const kcal = parseNum(f.kcal)
    const protein = parseNum(f.protein)
    if (!f.name.trim()) { setError('Ange ett namn.'); return }
    if (kcal === undefined || kcal < 0) { setError('Ange kalorier (0 eller mer).'); return }
    if (protein === undefined || protein < 0) { setError('Ange protein (0 eller mer).'); return }
    return {
      name: f.name.trim(), amount: parseNum(f.amount) ?? 1, unit: f.unit, kcal: Math.round(kcal), protein,
      fat: parseNum(f.fat), carbs: parseNum(f.carbs), meal: f.meal, time: f.time || entry.time, note: f.note.trim() || undefined,
      origin: f.dirtyNutrition ? 'angivet' : entry.origin,
    }
  }

  const save = async () => {
    const p = patch()
    if (!p) return
    await updateEntry(entry.id, p)
    toast('Ändringen är sparad')
    onClose()
  }
  const remove = async () => {
    const backup = await db.entries.get(entry.id)
    await deleteEntry(entry.id)
    onClose()
    toast('Posten togs bort', backup ? { label: 'Ångra', run: () => { void db.entries.add(backup) } } : undefined)
  }
  const duplicate = async () => {
    await duplicateEntry(entry.id)
    toast('Posten duplicerades')
    onClose()
  }
  const copyTo = async () => {
    if (!copyDate) return
    await duplicateEntry(entry.id, copyDate)
    toast(`Kopierad till ${formatShort(copyDate)}`)
    onClose()
  }
  const asFavorite = async () => {
    const p = patch()
    if (!p) return
    await saveFood({ name: p.name!, amount: p.amount!, unit: p.unit!, kcal: p.kcal!, protein: p.protein!, fat: p.fat, carbs: p.carbs, favorite: true })
    toast('Sparad som favorit')
  }

  return (
    <>
      <Sheet open={!!entry} onClose={onClose} title="Redigera post"
        footer={<div className="flex gap-2"><Button block onClick={onClose}>Avbryt</Button><Button block variant="primary" onClick={save}>Spara</Button></div>}>
        <div className="grid gap-3">
          {(entry.groupName || entry.origin) && (
            <div className="flex flex-wrap gap-2 items-center text-sm text-muted">
              {entry.groupName && <span>Del av: <b className="text-ink">{entry.groupName}</b></span>}
              <OriginBadge origin={entry.origin} />
            </div>
          )}
          <TextInput label="Livsmedel eller maträtt" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Mängd" value={f.amount} onChange={onAmount} />
            <Select label="Enhet" value={f.unit} onChange={onUnit} options={UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] }))} />
          </div>
          <label className="flex items-center gap-2 text-sm min-h-11">
            <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={scaleWithAmount} onChange={(e) => setScaleWithAmount(e.target.checked)} />
            Räkna om näringsvärdena när mängd eller enhet ändras
          </label>
          {scaleNote && <p className="text-sm text-muted -mt-2" role="status">{scaleNote}</p>}
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Kalorier" value={f.kcal} onChange={(v) => onNutrition('kcal', v)} suffix="kcal" />
            <NumberField label="Protein" value={f.protein} onChange={(v) => onNutrition('protein', v)} suffix="g" />
            <NumberField label="Fett (valfritt)" value={f.fat} onChange={(v) => onNutrition('fat', v)} suffix="g" />
            <NumberField label="Kolhydrater (valfritt)" value={f.carbs} onChange={(v) => onNutrition('carbs', v)} suffix="g" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Måltid" value={f.meal} onChange={(m: MealType) => setF({ ...f, meal: m })} options={MEALS.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} />
            <TextInput label="Tid" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </div>
          <TextInput label="Anteckning (valfritt)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          {error && <p className="text-danger text-sm" role="alert">{error}</p>}

          <div className="border-t border-line pt-3 mt-1 grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={duplicate}>Duplicera</Button>
              <Button onClick={asFavorite}>Spara som favorit</Button>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1"><TextInput label="Kopiera till dag" type="date" value={copyDate} onChange={(e) => setCopyDate(e.target.value)} /></div>
              <Button onClick={copyTo} disabled={!copyDate}>Kopiera</Button>
            </div>
            <Button variant="danger" onClick={async () => { if (await confirm.ask(`Ta bort "${entry.name}"?`)) await remove() }}>Ta bort</Button>
          </div>
        </div>
      </Sheet>
      {confirm.node}
    </>
  )
}

function init(e: FoodEntry | null) {
  return {
    name: e?.name ?? '', amount: str(e?.amount ?? 1), unit: (e?.unit ?? 'portion') as Unit, kcal: str(e?.kcal), protein: str(e?.protein),
    fat: str(e?.fat), carbs: str(e?.carbs), meal: (e?.meal ?? 'lunch') as MealType, time: e?.time ?? '', note: e?.note ?? '', dirtyNutrition: false,
  }
}

