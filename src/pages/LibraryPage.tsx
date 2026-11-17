import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, Empty, NumberValueField, PageHeader, Segmented, Select, Sheet, TextInput, useConfirm, useToast } from '../components/ui'
import { db, uid } from '../lib/db'
import { searchFoodDb, nutritionFor } from '../lib/foodDb'
import { fmtDec, fmtInt } from '../lib/format'
import { ACTIVITY_ICON, ACTIVITY_LABEL, INTENSITY_LABEL, MEAL_LABEL, UNIT_LABEL, unitText } from '../lib/labels'
import { recipeNutrition, sumNutrition } from '../lib/nutrition'
import {
  deleteLibraryItem, duplicateLibraryItem, moveLibraryItem, saveFood, saveMealTemplate, saveRecipe, saveWorkoutTemplate, toggleFavorite, type LibraryTable,
} from '../lib/repo'
import { ACTIVITIES, MEALS, UNITS, type ActivityType, type Food, type Ingredient, type Intensity, type MealTemplate, type MealType, type Recipe, type Unit, type WorkoutTemplate } from '../lib/types'
import { navigate } from '../router'
import { rescale } from '../lib/units'

type Tab = 'livsmedel' | 'maltider' | 'recept' | 'traning'
const TABLE: Record<Tab, LibraryTable> = { livsmedel: 'foods', maltider: 'mealTemplates', recept: 'recipes', traning: 'workoutTemplates' }

export default function LibraryPage({ tab: tabParam }: { tab?: string }) {
  const tab: Tab = (['livsmedel', 'maltider', 'recept', 'traning'] as Tab[]).includes(tabParam as Tab) ? (tabParam as Tab) : 'livsmedel'
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<{ tab: Tab; item?: Food | MealTemplate | Recipe | WorkoutTemplate } | null>(null)
  const rows = useLiveQuery(async () => {
    const t = db[TABLE[tab]] as unknown as { toArray(): Promise<Array<Food | MealTemplate | Recipe | WorkoutTemplate>> }
    return (await t.toArray()).sort((a, b) => a.sortOrder - b.sortOrder)
  }, [tab]) ?? []

  const describe = (r: Food | MealTemplate | Recipe | WorkoutTemplate): string => {
    if (tab === 'livsmedel') { const f = r as Food; return `${unitText(f.amount, f.unit)} · ${fmtInt(f.kcal)} kcal · ${fmtDec(f.protein)} g protein` }
    if (tab === 'maltider') { const m = r as MealTemplate; const t = sumNutrition(m.items); return `${m.items.length} ingredienser · ${fmtInt(t.kcal)} kcal · ${fmtInt(t.protein)} g protein` }
    if (tab === 'recept') { const x = r as Recipe; const n = recipeNutrition(x.items, x.portions); return `${fmtDec(x.portions)} portioner · ${fmtInt(n.perPortion.kcal)} kcal · ${fmtDec(n.perPortion.protein)} g protein per portion` }
    const w = r as WorkoutTemplate
    return `${ACTIVITY_LABEL[w.activity]} · ${w.durationMin} min · ${INTENSITY_LABEL[w.intensity].toLowerCase()}`
  }

  return (
    <div>
      <PageHeader title="Favoriter och mallar" back="/" right={<Button variant="primary" className="mr-2" onClick={() => setEditing({ tab })}>+ Ny</Button>} />
      <div className="max-w-2xl mx-auto px-4 grid gap-3 pb-6">
        <Segmented label="Typ" size="sm" value={tab} onChange={(t) => navigate(`/favoriter/${t}`, { replace: true })}
          options={[{ value: 'livsmedel', label: 'Livsmedel' }, { value: 'maltider', label: 'Måltider' }, { value: 'recept', label: 'Recept' }, { value: 'traning', label: 'Träning' }]} />
        <p className="text-sm text-muted px-1">
          {tab === 'livsmedel' && 'Enskilda livsmedel du äter ofta. Visas under Snabbval.'}
          {tab === 'maltider' && 'Standardmåltider med flera ingredienser, t.ex. din vanliga frukost. Alla ingredienser registreras på en gång – mallen ändras inte när du justerar en enskild dag.'}
          {tab === 'recept' && 'Recept räknas om per portion. Registrera t.ex. 0,5, 1 eller 1,5 portioner.'}
          {tab === 'traning' && 'Vanliga träningspass. Ett tryck under Lägg till träning sparar passet.'}
          {' '}De mest använda visas först vid registrering.
        </p>
        {rows.length === 0 ? <Card><Empty>Inget här ännu. Tryck på <b>+ Ny</b> för att skapa.</Empty></Card> : (
          <Card className="!p-0 overflow-hidden" as="div">
            <ul className="divide-y divide-line">
              {rows.map((r, i) => (
                <li key={r.id} className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button type="button" aria-pressed={r.favorite} aria-label={r.favorite ? `Ta bort ${r.name} från favoriter` : `Markera ${r.name} som favorit`}
                      onClick={() => toggleFavorite(TABLE[tab], r.id)} className={`min-h-11 min-w-11 rounded-full text-xl ${r.favorite ? 'text-kcal' : 'text-muted'}`}>{r.favorite ? '★' : '☆'}</button>
                    <button type="button" className="flex-1 min-w-0 text-left min-h-12" onClick={() => setEditing({ tab, item: r })}>
                      <span className="block font-semibold truncate">{tab === 'traning' && <span aria-hidden="true">{ACTIVITY_ICON[(r as WorkoutTemplate).activity]} </span>}{r.name}</span>
                      <span className="block text-sm text-muted truncate tabular">{describe(r)}{r.useCount ? ` · använd ${r.useCount} ggr` : ''}</span>
                    </button>
                  </div>
                  <div className="flex gap-1 justify-end -mt-1">
                    <Button variant="ghost" className="!px-2 text-sm" aria-label={`Flytta upp ${r.name}`} disabled={i === 0} onClick={() => moveLibraryItem(TABLE[tab], r.id, -1)}>↑</Button>
                    <Button variant="ghost" className="!px-2 text-sm" aria-label={`Flytta ned ${r.name}`} disabled={i === rows.length - 1} onClick={() => moveLibraryItem(TABLE[tab], r.id, 1)}>↓</Button>
                    <Button variant="ghost" className="!px-2 text-sm" onClick={async () => { await duplicateLibraryItem(TABLE[tab], r.id); toast('Kopia skapad') }}>Duplicera</Button>
                    <Button variant="ghost" className="!px-2 text-sm text-danger" onClick={async () => { if (await confirm.ask(`Ta bort "${r.name}"? Redan registrerade poster påverkas inte.`)) { await deleteLibraryItem(TABLE[tab], r.id); toast('Borttagen') } }}>Ta bort</Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.item ? 'Redigera' : 'Ny'}>
        {editing?.tab === 'livsmedel' && <FoodEditor item={editing.item as Food | undefined} onDone={() => setEditing(null)} />}
        {editing?.tab === 'maltider' && <TemplateEditor item={editing.item as MealTemplate | undefined} onDone={() => setEditing(null)} />}
        {editing?.tab === 'recept' && <RecipeEditor item={editing.item as Recipe | undefined} onDone={() => setEditing(null)} />}
        {editing?.tab === 'traning' && <WorkoutTemplateEditor item={editing.item as WorkoutTemplate | undefined} onDone={() => setEditing(null)} />}
      </Sheet>
      {confirm.node}
    </div>
  )
}

function FoodEditor({ item, onDone }: { item?: Food; onDone: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({ name: item?.name ?? '', amount: item?.amount ?? 1, unit: item?.unit ?? ('portion' as Unit), kcal: item?.kcal, protein: item?.protein, fat: item?.fat, carbs: item?.carbs })
  const [err, setErr] = useState<string>()
  return (
    <div className="grid gap-3">
      <TextInput label="Namn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="T.ex. Proteinshake" />
      <div className="grid grid-cols-2 gap-3">
        <NumberValueField label="Mängd" value={f.amount} onValue={(v) => setF({ ...f, amount: v ?? 1 })} />
        <Select label="Enhet" value={f.unit} onChange={(u: Unit) => setF({ ...f, unit: u })} options={UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] }))} />
        <NumberValueField label="Kalorier" value={f.kcal} onValue={(v) => setF({ ...f, kcal: v })} suffix="kcal" />
        <NumberValueField label="Protein" value={f.protein} onValue={(v) => setF({ ...f, protein: v })} suffix="g" />
        <NumberValueField label="Fett (valfritt)" value={f.fat} onValue={(v) => setF({ ...f, fat: v })} suffix="g" />
        <NumberValueField label="Kolhydrater (valfritt)" value={f.carbs} onValue={(v) => setF({ ...f, carbs: v })} suffix="g" />
      </div>
      <p className="text-sm text-muted">Näringsvärdena avser den angivna mängden.</p>
      {err && <p className="text-danger text-sm" role="alert">{err}</p>}
      <Button variant="primary" onClick={async () => {
        if (!f.name.trim() || f.kcal === undefined || f.protein === undefined) { setErr('Ange namn, kalorier och protein.'); return }
        await saveFood({ ...(item ?? {}), name: f.name.trim(), amount: f.amount, unit: f.unit, kcal: Math.round(f.kcal), protein: f.protein, fat: f.fat, carbs: f.carbs })
        toast('Sparat'); onDone()
      }}>Spara</Button>
    </div>
  )
}

/** Redigering av ingredienslista med sökning i livsmedelslistan och egna livsmedel. */
function IngredientsEditor({ items, setItems }: { items: Ingredient[]; setItems: (i: Ingredient[]) => void }) {
  const [q, setQ] = useState('')
  const own = useLiveQuery(() => db.foods.toArray(), []) ?? []
  const s = q.trim().toLowerCase()
  const ownHits = s ? own.filter((f) => f.name.toLowerCase().includes(s)).slice(0, 4) : []
  const dbHits = s ? searchFoodDb(s, 6) : []
  const upd = (i: number, p: Partial<Ingredient>) => setItems(items.map((x, k) => (k === i ? { ...x, ...p } : x)))
  const t = sumNutrition(items)
  return (
    <div className="grid gap-2">
      <p className="font-semibold">Ingredienser</p>
      {items.map((it, i) => (
        <div key={it.id} className="bg-card border border-line rounded-2xl p-3 grid gap-2">
          <div className="flex gap-2 items-end">
            <div className="flex-1"><TextInput label="Ingrediens" value={it.name} onChange={(e) => upd(i, { name: e.target.value })} /></div>
            <Button variant="ghost" className="text-danger" aria-label={`Ta bort ${it.name}`} onClick={() => setItems(items.filter((_, k) => k !== i))}>✕</Button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <NumberValueField label="Mängd" value={it.amount} onValue={(a) => {
              const r = a !== undefined ? rescale(it, a, it.unit) : undefined
              if (r) upd(i, { amount: a, ...r.nutrition })
              else if (a !== undefined) upd(i, { amount: a })
            }} />
            <Select label="Enhet" value={it.unit} onChange={(u: Unit) => { const r = rescale(it, it.amount, u); upd(i, r ? { unit: u, ...r.nutrition } : { unit: u }) }} options={UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] }))} />
            <NumberValueField label="kcal" value={it.kcal} onValue={(v) => upd(i, { kcal: Math.round(v ?? 0) })} />
            <NumberValueField label="Protein" value={it.protein} onValue={(v) => upd(i, { protein: v ?? 0 })} />
          </div>
        </div>
      ))}
      <input type="search" className="field" placeholder="Lägg till ingrediens – sök, t.ex. ägg" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sök ingrediens" />
      {(ownHits.length > 0 || dbHits.length > 0) && (
        <ul className="bg-card border border-line rounded-2xl divide-y divide-line overflow-hidden">
          {ownHits.map((f) => (
            <li key={f.id}><button type="button" className="w-full text-left px-3 py-2 min-h-12 active:bg-card-2" onClick={() => { setItems([...items, { id: uid(), name: f.name, amount: f.amount, unit: f.unit, kcal: f.kcal, protein: f.protein, fat: f.fat, carbs: f.carbs }]); setQ('') }}>
              <b>{f.name}</b> <span className="text-sm text-muted">· {unitText(f.amount, f.unit)} · {fmtInt(f.kcal)} kcal</span></button></li>
          ))}
          {dbHits.map((f) => (
            <li key={f.name}><button type="button" className="w-full text-left px-3 py-2 min-h-12 active:bg-card-2" onClick={() => { const n = nutritionFor(f, f.defaultAmount, f.defaultUnit)!; setItems([...items, { id: uid(), name: f.name, amount: f.defaultAmount, unit: f.defaultUnit, ...n }]); setQ('') }}>
              <b>{f.name}</b> <span className="text-sm text-muted">· {unitText(f.defaultAmount, f.defaultUnit)} · typvärde</span></button></li>
          ))}
        </ul>
      )}
      <Button variant="ghost" className="text-brand" onClick={() => setItems([...items, { id: uid(), name: '', amount: 1, unit: 'st', kcal: 0, protein: 0 }])}>+ Tom rad (ange själv)</Button>
      <p className="text-[15px] tabular">Totalt: <b>{fmtInt(t.kcal)} kcal</b> · {fmtDec(t.protein)} g protein</p>
    </div>
  )
}

function TemplateEditor({ item, onDone }: { item?: MealTemplate; onDone: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(item?.name ?? '')
  const [meal, setMeal] = useState<MealType>(item?.meal ?? 'frukost')
  const [items, setItems] = useState<Ingredient[]>(item?.items ?? [])
  const [err, setErr] = useState<string>()
  return (
    <div className="grid gap-3">
      <TextInput label="Namn" value={name} onChange={(e) => setName(e.target.value)} placeholder="T.ex. Min vanliga frukost" />
      <Select label="Vanlig måltid" value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} />
      <IngredientsEditor items={items} setItems={setItems} />
      {err && <p className="text-danger text-sm" role="alert">{err}</p>}
      <Button variant="primary" onClick={async () => {
        if (!name.trim() || items.length === 0) { setErr('Ange namn och minst en ingrediens.'); return }
        await saveMealTemplate({ ...(item ?? {}), name: name.trim(), meal, items }); toast('Standardmåltiden är sparad'); onDone()
      }}>Spara</Button>
    </div>
  )
}

function RecipeEditor({ item, onDone }: { item?: Recipe; onDone: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(item?.name ?? '')
  const [portions, setPortions] = useState<number | undefined>(item?.portions ?? 4)
  const [items, setItems] = useState<Ingredient[]>(item?.items ?? [])
  const [note, setNote] = useState(item?.note ?? '')
  const [err, setErr] = useState<string>()
  const n = recipeNutrition(items, portions ?? 1)
  return (
    <div className="grid gap-3">
      <TextInput label="Receptets namn" value={name} onChange={(e) => setName(e.target.value)} />
      <NumberValueField label="Antal portioner receptet ger" value={portions} onValue={setPortions} />
      <IngredientsEditor items={items} setItems={setItems} />
      <div className="rounded-xl bg-card-2 p-3 tabular">Per portion: <b>{fmtInt(n.perPortion.kcal)} kcal</b> · {fmtDec(n.perPortion.protein)} g protein</div>
      <TextInput label="Anteckning (valfritt)" value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <p className="text-danger text-sm" role="alert">{err}</p>}
      <Button variant="primary" onClick={async () => {
        if (!name.trim() || items.length === 0 || !portions || portions <= 0) { setErr('Ange namn, antal portioner och minst en ingrediens.'); return }
        await saveRecipe({ ...(item ?? {}), name: name.trim(), portions, items, note: note.trim() || undefined }); toast('Receptet är sparat'); onDone()
      }}>Spara</Button>
    </div>
  )
}

function WorkoutTemplateEditor({ item, onDone }: { item?: WorkoutTemplate; onDone: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(item?.name ?? '')
  const [activity, setActivity] = useState<ActivityType>(item?.activity ?? 'gym')
  const [label, setLabel] = useState(item?.label ?? '')
  const [duration, setDuration] = useState<number | undefined>(item?.durationMin ?? 45)
  const [intensity, setIntensity] = useState<Intensity>(item?.intensity ?? 'medel')
  const [err, setErr] = useState<string>()
  return (
    <div className="grid gap-3">
      <TextInput label="Namn" value={name} onChange={(e) => setName(e.target.value)} placeholder="T.ex. Morgonpass" />
      <Select label="Aktivitet" value={activity} onChange={setActivity} options={ACTIVITIES.map((a) => ({ value: a, label: ACTIVITY_LABEL[a] }))} />
      <TextInput label="Beskrivning (valfritt)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <NumberValueField label="Varaktighet" value={duration} onValue={setDuration} suffix="min" integer />
      <Segmented label="Intensitet" value={intensity} onChange={setIntensity} options={(['lag', 'medel', 'hog'] as Intensity[]).map((v) => ({ value: v, label: INTENSITY_LABEL[v] }))} />
      {err && <p className="text-danger text-sm" role="alert">{err}</p>}
      <Button variant="primary" onClick={async () => {
        if (!name.trim() || !duration) { setErr('Ange namn och varaktighet.'); return }
        await saveWorkoutTemplate({ ...(item ?? {}), name: name.trim(), activity, label: label.trim() || undefined, durationMin: Math.round(duration), intensity }); toast('Mallen är sparad'); onDone()
      }}>Spara</Button>
    </div>
  )
}
