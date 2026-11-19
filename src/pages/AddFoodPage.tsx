import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, Chip, Empty, NumberField, PageHeader, Segmented, Select, Stepper, TextInput, cx, useToast } from '../components/ui'
import { useToday } from '../hooks'
import { addDays, formatShort, mealForTime, nowTime, relativeDayLabel, todayKey } from '../lib/dates'
import { db } from '../lib/db'
import { nutritionFor, searchFoodDb, type DbFood } from '../lib/foodDb'
import { LV_SOURCE, loadLv, lvToDbFood, searchLv, type LvFood } from '../lib/livsmedelsverket'
import { fmtDec, fmtInt, parseNum } from '../lib/format'
import { MEAL_LABEL, UNIT_LABEL, unitText } from '../lib/labels'
import { recipeNutrition, scale, sumNutrition } from '../lib/nutrition'
import { addEntries, addFoodToDay, addRecipeToDay, addTemplateToDay, copyEntries, saveFood } from '../lib/repo'
import { MEALS, UNITS, type Food, type FoodEntry, type MealTemplate, type MealType, type Nutrition, type Recipe, type Unit } from '../lib/types'
import { finishTo, navigate } from '../router'

type Tab = 'snabb' | 'sok' | 'manuell' | 'kopiera'
const DEFAULT_TIME: Record<MealType, string> = { frukost: '08:00', lunch: '12:00', middag: '18:00', mellanmal: '15:00', dryck: '10:00' }

export default function AddFoodPage({ date, initialTab, meal: mealParam }: { date: string; initialTab?: string; meal?: string | null }) {
  const today = useToday()
  const isToday = date === today
  const [tab, setTab] = useState<Tab>((['snabb', 'sok', 'manuell', 'kopiera'] as Tab[]).includes(initialTab as Tab) ? (initialTab as Tab) : 'snabb')
  const [meal, setMeal] = useState<MealType>(MEALS.includes(mealParam as MealType) ? (mealParam as MealType) : mealForTime(nowTime()))
  const time = isToday ? nowTime() : DEFAULT_TIME[meal]
  const ctx = { date, meal, time }

  return (
    <div>
      <PageHeader title="Lägg till mat" back="/" subtitle={relativeDayLabel(date, today)} right={<a href="#/favoriter" className="text-brand font-semibold min-h-11 flex items-center px-2 text-[15px]">Mallar</a>} />
      <div className="max-w-2xl mx-auto px-4 grid gap-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" role="radiogroup" aria-label="Måltid">
          {MEALS.map((m) => <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</Chip>)}
        </div>
        <Segmented label="Sätt att lägga till" size="sm" value={tab} onChange={setTab}
          options={[{ value: 'snabb', label: 'Snabbval' }, { value: 'sok', label: 'Sök' }, { value: 'manuell', label: 'Manuellt' }, { value: 'kopiera', label: 'Kopiera' }]} />
        {tab === 'snabb' && <QuickTab {...ctx} />}
        {tab === 'sok' && <SearchTab {...ctx} />}
        {tab === 'manuell' && <ManualTab {...ctx} />}
        {tab === 'kopiera' && <CopyTab {...ctx} />}
      </div>
    </div>
  )
}

interface Ctx { date: string; meal: MealType; time: string }

// ---------------- Snabbval ----------------

type QuickItem =
  | { key: string; kind: 'food'; name: string; sub: string; per: Nutrition; step: number; item: Food; score: number; favorite: boolean }
  | { key: string; kind: 'template'; name: string; sub: string; per: Nutrition; step: number; item: MealTemplate; score: number; favorite: boolean }
  | { key: string; kind: 'recipe'; name: string; sub: string; per: Nutrition; step: number; item: Recipe; score: number; favorite: boolean }
  | { key: string; kind: 'history'; name: string; sub: string; per: Nutrition; step: number; item: FoodEntry; score: number; favorite: boolean }

/** Poäng för "mest använda": antal användningar, med extra vikt för det som använts nyligen. */
function usageScore(useCount: number, lastUsedAt?: string): number {
  if (!useCount) return 0
  const days = lastUsedAt ? (Date.now() - Date.parse(lastUsedAt)) / 86400000 : 60
  return useCount * (1 + 2 / (1 + Math.max(0, days) / 7))
}

function QuickTab({ date, meal, time }: Ctx) {
  const toast = useToast()
  const [sel, setSel] = useState<Record<string, number>>({})
  const data = useLiveQuery(async () => {
    const since = addDays(date, -21)
    const [foods, templates, recipes, recent] = await Promise.all([
      db.foods.toArray(), db.mealTemplates.toArray(), db.recipes.toArray(),
      db.entries.where('date').between(since, addDays(date, 1), true, false).toArray(),
    ])
    return { foods, templates, recipes, recent }
  }, [date])

  const items = useMemo<QuickItem[]>(() => {
    if (!data) return []
    const out: QuickItem[] = []
    for (const f of data.foods) out.push({ key: 'f:' + f.id, kind: 'food', name: f.name, sub: unitText(f.amount, f.unit), per: f, step: 1, item: f, score: usageScore(f.useCount, f.lastUsedAt), favorite: f.favorite })
    for (const t of data.templates) out.push({ key: 't:' + t.id, kind: 'template', name: t.name, sub: `${t.items.length} ingredienser`, per: sumNutrition(t.items), step: 0.5, item: t, score: usageScore(t.useCount, t.lastUsedAt), favorite: t.favorite })
    for (const r of data.recipes) out.push({ key: 'r:' + r.id, kind: 'recipe', name: r.name, sub: 'per portion', per: recipeNutrition(r.items, r.portions).perPortion, step: 0.5, item: r, score: usageScore(r.useCount, r.lastUsedAt), favorite: r.favorite })
    // Senast registrerade som inte kommer från biblioteket
    const seen = new Set(out.map((o) => o.name.toLowerCase()))
    const recent = [...data.recent].filter((e) => !['livsmedel', 'standardmaltid', 'recept'].includes(e.source)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const counts = new Map<string, number>()
    for (const e of data.recent) counts.set(e.name.toLowerCase(), (counts.get(e.name.toLowerCase()) ?? 0) + 1)
    for (const e of recent) {
      const k = e.name.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ key: 'h:' + e.id, kind: 'history', name: e.name, sub: `${unitText(e.amount, e.unit)} · senast ${formatShort(e.date)}`, per: e, step: 1, item: e, score: (counts.get(k) ?? 1) * 0.8, favorite: false })
      if (out.filter((o) => o.kind === 'history').length >= 12) break
    }
    return out
  }, [data])

  const top = [...items].filter((i) => i.score > 0).sort((a, b) => b.score - a.score).slice(0, 8)
  const topKeys = new Set(top.map((t) => t.key))
  const byOrder = (a: QuickItem, b: QuickItem) => (('sortOrder' in a.item ? a.item.sortOrder : 0) - ('sortOrder' in b.item ? b.item.sortOrder : 0))
  const groups: Array<[string, QuickItem[]]> = [
    ['Mest använda', top],
    ['Standardmåltider', items.filter((i) => i.kind === 'template' && !topKeys.has(i.key)).sort(byOrder)],
    ['Favoritlivsmedel', items.filter((i) => i.kind === 'food' && !topKeys.has(i.key)).sort((a, b) => Number(b.favorite) - Number(a.favorite) || byOrder(a, b))],
    ['Recept', items.filter((i) => i.kind === 'recipe' && !topKeys.has(i.key)).sort(byOrder)],
    ['Senast registrerade', items.filter((i) => i.kind === 'history' && !topKeys.has(i.key))],
  ]

  const add = async (i: QuickItem, qty: number) => {
    if (i.kind === 'food') await addFoodToDay(i.item, date, meal, time, qty)
    else if (i.kind === 'template') await addTemplateToDay(i.item, date, meal, time, qty)
    else if (i.kind === 'recipe') await addRecipeToDay(i.item, date, meal, time, qty)
    else {
      const e = i.item
      await addEntries([{ date, time, meal, name: e.name, amount: Math.round(e.amount * qty * 100) / 100, unit: e.unit, ...scale(e, qty), source: 'kopia', sourceId: e.id, origin: e.origin }])
    }
  }
  const selected = items.filter((i) => sel[i.key])
  const selTotal = selected.reduce((s, i) => s + scale(i.per, sel[i.key]).kcal, 0)
  const addSelected = async () => {
    for (const i of selected) await add(i, sel[i.key])
    toast(`${selected.length} ${selected.length === 1 ? 'val' : 'val'} tillagda i ${MEAL_LABEL[meal].toLowerCase()}`)
    setSel({})
    finishTo(date, todayKey())
  }

  if (!data) return null
  if (items.length === 0) return (
    <Card><Empty>Här samlas dina favoriter, standardmåltider och det du registrerat nyligen. <a href="#/favoriter" className="text-brand underline">Skapa en favorit</a> eller lägg till mat via Sök.</Empty></Card>
  )
  return (
    <div className="pb-24">
      {groups.filter(([, l]) => l.length).map(([title, list]) => (
        <section key={title} aria-label={title}>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted mt-4 mb-2 px-1">{title}</h2>
          <Card className="!p-0 overflow-hidden" as="div">
            <ul className="divide-y divide-line">
              {list.map((i) => {
                const q = sel[i.key] ?? 0
                const n = scale(i.per, q || 1)
                return (
                  <li key={i.key} className={cx('flex items-center gap-2 pl-3 pr-2 py-2 min-h-16', q > 0 && 'bg-brand-soft/60')}>
                    <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer min-h-12">
                      <input type="checkbox" className="h-6 w-6 accent-[var(--brand)] shrink-0" checked={q > 0}
                        onChange={(e) => setSel((s) => { const c = { ...s }; if (e.target.checked) c[i.key] = 1; else delete c[i.key]; return c })} />
                      <span className="min-w-0">
                        <span className="block font-semibold truncate">{i.favorite && <span aria-label="Favorit">★ </span>}{i.name}</span>
                        <span className="block text-sm text-muted truncate tabular">{fmtInt(n.kcal)} kcal · {fmtDec(n.protein)} g protein · {i.sub}</span>
                      </span>
                    </label>
                    {q > 0
                      ? <Stepper label={`antal ${i.name}`} value={q} step={i.step} min={i.step} onChange={(v) => setSel((s) => ({ ...s, [i.key]: v }))} />
                      : <button type="button" aria-label={`Lägg till ${i.name} direkt`} onClick={async () => { await add(i, 1); toast(`${i.name} tillagd`) }}
                          className="min-h-11 min-w-11 rounded-full bg-brand text-brand-ink text-2xl font-bold flex items-center justify-center active:opacity-80">+</button>}
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      ))}
      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-nav-offset z-30 px-4 anim-pop">
          <div className="max-w-2xl mx-auto">
            <Button variant="primary" block className="min-h-14 shadow-lg text-[17px]" onClick={addSelected}>
              Lägg till {selected.length} {selected.length === 1 ? 'val' : 'val'} · {fmtInt(selTotal)} kcal
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------- Sök ----------------

function SearchTab({ date, meal, time }: Ctx) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<(DbFood & { lvNr?: number }) | null>(null)
  const [lv, setLv] = useState<LvFood[]>([])
  useEffect(() => { let on = true; void loadLv().then((f) => on && setLv(f)); return () => { on = false } }, [])
  const own = useLiveQuery(() => db.foods.toArray(), []) ?? []
  const history = useLiveQuery(async () => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    const rows = await db.entries.filter((e) => e.name.toLowerCase().includes(s)).toArray()
    const seen = new Map<string, FoodEntry>()
    for (const e of rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) if (!seen.has(e.name.toLowerCase() + e.amount + e.unit)) seen.set(e.name.toLowerCase() + e.amount + e.unit, e)
    return [...seen.values()].slice(0, 8)
  }, [q]) ?? []
  const toast = useToast()
  const s = q.trim().toLowerCase()
  const ownHits = s ? own.filter((f) => f.name.toLowerCase().includes(s)).slice(0, 8) : []
  const dbHits = s ? searchFoodDb(s) : []
  const lvHits = s.length >= 2 ? searchLv(s, lv) : []

  if (picked) return <DbFoodForm food={picked} ctx={{ date, meal, time }} onCancel={() => setPicked(null)} />
  return (
    <div className="grid gap-3">
      <input className="field" type="search" placeholder="Sök livsmedel, t.ex. ägg, kvarg, pasta" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sök livsmedel" autoFocus enterKeyHint="search" />
      {!s && (
        <>
          <p className="text-sm text-muted px-1">Sök bland dina livsmedel, tidigare registreringar och {lv.length ? `${fmtInt(lv.length)} livsmedel från Livsmedelsverket` : 'vanliga livsmedel'}.</p>
        </>
      )}
      {ownHits.length > 0 && <ResultGroup title="Mina livsmedel">{ownHits.map((f) => (
        <ResultRow key={f.id} name={f.name} sub={`${unitText(f.amount, f.unit)} · ${fmtInt(f.kcal)} kcal · ${fmtDec(f.protein)} g protein`}
          onClick={async () => { await addFoodToDay(f, date, meal, time, 1); toast(`${f.name} tillagd`); finishTo(date, todayKey()) }} />
      ))}</ResultGroup>}
      {history.length > 0 && <ResultGroup title="Tidigare registrerat">{history.map((e) => (
        <ResultRow key={e.id} name={e.name} sub={`${unitText(e.amount, e.unit)} · ${fmtInt(e.kcal)} kcal · ${fmtDec(e.protein)} g · ${formatShort(e.date)}`}
          onClick={async () => { await addEntries([{ date, time, meal, name: e.name, amount: e.amount, unit: e.unit, kcal: e.kcal, protein: e.protein, fat: e.fat, carbs: e.carbs, source: 'kopia', sourceId: e.id, origin: e.origin }]); toast(`${e.name} tillagd`); finishTo(date, todayKey()) }} />
      ))}</ResultGroup>}
      {dbHits.length > 0 && <ResultGroup title="Livsmedelslista (typvärden)">{dbHits.map((f) => (
        <ResultRow key={f.name} name={f.name} sub={`${fmtInt(f.per100.kcal)} kcal · ${fmtDec(f.per100.protein)} g protein per 100 ${f.liquid ? 'ml' : 'g'}`} onClick={() => setPicked(f)} chevron />
      ))}</ResultGroup>}
      {lvHits.length > 0 && <ResultGroup title="Livsmedelsverket">{lvHits.map((f) => (
        <ResultRow key={f.nr} name={f.name} sub={`${fmtInt(f.per100.kcal)} kcal · ${fmtDec(f.per100.protein)} g protein per 100 g`} onClick={() => setPicked(lvToDbFood(f))} chevron />
      ))}</ResultGroup>}
      {lv.length > 0 && <p className="text-xs text-muted px-1">Källa: {LV_SOURCE}.</p>}
      {s && !ownHits.length && !history.length && !dbHits.length && !lvHits.length && (
        <Card><Empty>Inga träffar på "{q}". <button type="button" className="text-brand underline" onClick={() => navigate('/mat/manuell')}>Ange manuellt</button></Empty></Card>
      )}
    </div>
  )
}

function ResultGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted mt-2 mb-2 px-1">{title}</h2>
      <Card className="!p-0 overflow-hidden" as="div"><ul className="divide-y divide-line">{children}</ul></Card>
    </section>
  )
}
function ResultRow({ name, sub, onClick, chevron }: { name: string; sub: string; onClick: () => void; chevron?: boolean }) {
  return (
    <li><button type="button" onClick={onClick} className="w-full text-left px-4 py-3 min-h-14 flex items-center gap-2 active:bg-card-2">
      <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{name}</span><span className="block text-sm text-muted truncate tabular">{sub}</span></span>
      <span aria-hidden="true" className="text-brand text-xl font-bold">{chevron ? '›' : '+'}</span>
    </button></li>
  )
}

function DbFoodForm({ food, ctx, onCancel }: { food: DbFood & { lvNr?: number }; ctx: Ctx; onCancel: () => void }) {
  const toast = useToast()
  const units = (Object.keys(food.units) as Unit[])
  const [unit, setUnit] = useState<Unit>(food.defaultUnit)
  const [amount, setAmount] = useState(String(food.defaultAmount).replace('.', ','))
  const [fav, setFav] = useState(false)
  const a = parseNum(amount) ?? 0
  const n = nutritionFor(food, a, unit)
  const add = async () => {
    if (!n || a <= 0) return
    await addEntries([{ ...ctx, name: food.name, amount: a, unit, ...n, source: 'manuell', origin: food.lvNr ? 'beraknat' : 'uppskattat' }])
    if (fav) await saveFood({ name: food.name, amount: a, unit, ...n })
    toast(`${food.name} tillagd`)
    finishTo(ctx.date, todayKey())
  }
  return (
    <Card>
      <h2 className="text-lg font-bold">{food.name}</h2>
      <p className="text-sm text-muted mb-3">{food.lvNr ? 'Livsmedelsverket, per 100 g' : `Typvärden per 100 ${food.liquid ? 'ml' : 'g'}`}: {food.per100.kcal} kcal, {fmtDec(food.per100.protein)} g protein, {fmtDec(food.per100.fat)} g fett, {fmtDec(food.per100.carbs)} g kolhydrater.</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Mängd" value={amount} onChange={setAmount} autoFocus />
        <Select label="Enhet" value={unit} onChange={setUnit} options={units.map((u) => ({ value: u, label: `${UNIT_LABEL[u]}${u !== 'g' && u !== 'ml' ? ` (${fmtDec(food.units[u]!)} g)` : ''}` }))} />
      </div>
      <div className="flex gap-2 my-3 overflow-x-auto no-scrollbar">
        {[0.5, 1, 2, 3].map((x) => <Chip key={x} selected={a === x} onClick={() => setAmount(String(x).replace('.', ','))}>{fmtDec(x)}</Chip>)}
      </div>
      {n && (
        <div className="grid grid-cols-2 gap-2 mb-3 tabular">
          <div className="rounded-xl bg-kcal-soft p-3"><span className="text-sm block">Energi</span><b className="text-xl">{fmtInt(n.kcal)} kcal</b></div>
          <div className="rounded-xl bg-protein-soft p-3"><span className="text-sm block">Protein</span><b className="text-xl">{fmtDec(n.protein)} g</b></div>
        </div>
      )}
      <label className="flex items-center gap-2 min-h-11 mb-2"><input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={fav} onChange={(e) => setFav(e.target.checked)} />Spara även som favorit</label>
      <div className="flex gap-2"><Button onClick={onCancel}>Tillbaka</Button><Button variant="primary" block onClick={add} disabled={!n || a <= 0}>Lägg till i {MEAL_LABEL[ctx.meal].toLowerCase()}</Button></div>
    </Card>
  )
}

// ---------------- Manuellt ----------------

function ManualTab({ date, meal, time: defaultTime }: Ctx) {
  const toast = useToast()
  const [f, setF] = useState({ name: '', amount: '1', unit: 'portion' as Unit, kcal: '', protein: '', fat: '', carbs: '', time: '', note: '' })
  const [fav, setFav] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = async () => {
    const e: Record<string, string> = {}
    if (!f.name.trim()) e.name = 'Ange vad du åt eller drack.'
    const kcal = parseNum(f.kcal)
    const protein = parseNum(f.protein)
    if (kcal === undefined || kcal < 0) e.kcal = 'Ange kalorier – 0 går bra.'
    if (protein === undefined || protein < 0) e.protein = 'Ange protein i gram – 0 går bra.'
    setErrors(e)
    if (Object.keys(e).length) return
    const amount = parseNum(f.amount) ?? 1
    await addEntries([{ date, time: f.time || defaultTime, meal, name: f.name.trim(), amount, unit: f.unit, kcal: Math.round(kcal!), protein: protein!, fat: parseNum(f.fat), carbs: parseNum(f.carbs), note: f.note.trim() || undefined, source: 'manuell', origin: 'angivet' }])
    if (fav) await saveFood({ name: f.name.trim(), amount, unit: f.unit, kcal: Math.round(kcal!), protein: protein!, fat: parseNum(f.fat), carbs: parseNum(f.carbs) })
    toast('Sparad')
    finishTo(date, todayKey())
  }
  return (
    <Card>
      <div className="grid gap-3">
        <TextInput label="Livsmedel eller maträtt" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errors.name} autoComplete="off" />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Mängd" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
          <Select label="Enhet" value={f.unit} onChange={(u: Unit) => setF({ ...f, unit: u })} options={UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] }))} />
          <NumberField label="Kalorier" value={f.kcal} onChange={(v) => setF({ ...f, kcal: v })} suffix="kcal" error={errors.kcal} />
          <NumberField label="Protein" value={f.protein} onChange={(v) => setF({ ...f, protein: v })} suffix="g" error={errors.protein} />
        </div>
        <details>
          <summary className="cursor-pointer text-brand font-semibold min-h-11 flex items-center">Fler värden (valfritt)</summary>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <NumberField label="Fett" value={f.fat} onChange={(v) => setF({ ...f, fat: v })} suffix="g" />
            <NumberField label="Kolhydrater" value={f.carbs} onChange={(v) => setF({ ...f, carbs: v })} suffix="g" />
            <TextInput label="Tid" type="time" value={f.time || defaultTime} onChange={(e) => setF({ ...f, time: e.target.value })} />
            <TextInput label="Anteckning" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </div>
        </details>
        <label className="flex items-center gap-2 min-h-11"><input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={fav} onChange={(e) => setFav(e.target.checked)} />Spara även som favorit</label>
        <Button variant="primary" block onClick={save}>Lägg till i {MEAL_LABEL[meal].toLowerCase()}</Button>
      </div>
    </Card>
  )
}

// ---------------- Kopiera ----------------

function CopyTab({ date, meal: targetMeal }: Ctx) {
  const toast = useToast()
  const [from, setFrom] = useState(addDays(date, -1))
  const entries = useLiveQuery(() => db.entries.where('date').equals(from).toArray(), [from]) ?? []
  const [keepMeal, setKeepMeal] = useState(true)
  return (
    <div className="grid gap-3">
      <Card>
        <TextInput label="Kopiera från dag" type="date" value={from} max={date} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <div className="flex gap-2 mt-2">
          <Chip selected={from === addDays(date, -1)} onClick={() => setFrom(addDays(date, -1))}>Dagen innan</Chip>
          <Chip selected={from === addDays(date, -7)} onClick={() => setFrom(addDays(date, -7))}>Samma dag förra veckan</Chip>
        </div>
        <label className="flex items-center gap-2 min-h-11 mt-2 text-[15px]"><input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={keepMeal} onChange={(e) => setKeepMeal(e.target.checked)} />Behåll ursprunglig måltid (annars läggs allt i {MEAL_LABEL[targetMeal].toLowerCase()})</label>
      </Card>
      {entries.length === 0 ? <Card><Empty>Ingen mat registrerad {formatShort(from)}.</Empty></Card> : (
        <>
          {MEALS.map((m) => {
            const list = entries.filter((e) => e.meal === m)
            if (!list.length) return null
            const t = sumNutrition(list)
            return (
              <Card key={m}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0"><h3 className="font-bold">{MEAL_LABEL[m]}</h3><p className="text-sm text-muted truncate">{list.map((e) => e.name).join(', ')}</p><p className="text-sm tabular">{fmtInt(t.kcal)} kcal · {fmtInt(t.protein)} g protein</p></div>
                  <Button variant="soft" onClick={async () => { const n = await copyEntries(from, date, m, keepMeal ? undefined : targetMeal); toast(`${n} poster kopierade`) }}>Kopiera</Button>
                </div>
              </Card>
            )
          })}
          <Button variant="primary" block onClick={async () => { const n = await copyEntries(from, date, undefined, keepMeal ? undefined : targetMeal); toast(`Hela dagen kopierad (${n} poster)`); finishTo(date, todayKey()) }}>
            Kopiera hela dagens mat ({entries.length} poster)
          </Button>
        </>
      )}
    </div>
  )
}
