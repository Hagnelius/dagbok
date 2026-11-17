import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, HideNav, Notice, NumberValueField, OriginBadge, PageHeader, Segmented, Select, Sheet, TextInput, cx, useToast } from '../components/ui'
import { useLatestWeight, usePersistentDraft, useSettings, useToday, useOnline } from '../hooks'
import { db } from '../lib/db'
import { formatShort, nowTime, relativeDayLabel } from '../lib/dates'
import { fmtDec, fmtInt } from '../lib/format'
import { ACTIVITY_LABEL, INTENSITY_LABEL, MEAL_LABEL, UNIT_LABEL } from '../lib/labels'
import { localProvider, parsePastedResponse, pasteModePrompt, serverProvider } from '../lib/ai/providers'
import { acceptInterpretation, cancelInterpretation, saveInterpretation } from '../lib/ai/commit'
import { saveSettings } from '../lib/repo'
import { ACTIVITIES, MEALS, UNITS, type AiFoodItem, type AiResult, type AiWorkoutItem, type ActivityType, type Intensity, type MealType, type Unit } from '../lib/types'
import { navigate } from '../router'
import { rescale } from '../lib/units'
import { prepareImage, type PreparedImage } from '../lib/ai/image'
import { focusAtEnd, primeKeyboard } from '../lib/keyboard'

const EXAMPLES = [
  'Till lunch åt jag en omelett på tre ägg, 30 gram riven ost, 30 gram keso, en halv tomat, två matskedar purjolök och lite smör.',
  'Idag körde jag 45 minuter crosstrainer och sedan 45 minuter gym med medelintensitet.',
  'Frukost: 2 skivor knäckebröd med skinka och en kaffe latte',
]

interface Review { id: string; provider: string; result: AiResult; foods: Array<AiFoodItem & { keep: boolean }>; workouts: Array<AiWorkoutItem & { keep: boolean }> }

type Mode = 'text' | 'foto'

export default function AiPage({ date, mode: modeParam }: { date: string; mode?: string | null }) {
  const today = useToday()
  const toast = useToast()
  const settings = useSettings()
  const online = useOnline()
  const weight = useLatestWeight()
  const [mode, setMode] = useState<Mode>(modeParam === 'foto' ? 'foto' : 'text')
  const [text, setText] = usePersistentDraft('dagbok.ai-utkast')
  const [photoNote, setPhotoNote] = usePersistentDraft('dagbok.foto-kommentar')
  const [photo, setPhoto] = useState<PreparedImage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [review, setReview] = useState<Review | null>(null)
  const [consent, setConsent] = useState<null | 'text' | 'foto'>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const [followUp, setFollowUp] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)
  const recent = useLiveQuery(() => db.aiInterpretations.orderBy('createdAt').reverse().limit(8).toArray(), []) ?? []

  const ctx = { today: date, now: date === today ? nowTime() : '12:00', weightKg: weight?.weight }
  const provider = settings.aiProvider
  // Foton kan inte tolkas lokalt – då används klistra in-läget, som fungerar utan inställningar.
  const photoVia: 'server' | 'klistra_in' = provider === 'server' ? 'server' : 'klistra_in'
  const endpointHost = (() => { try { return new URL(settings.aiEndpoint).host } catch { return settings.aiEndpoint } })()
  const isPhoto = mode === 'foto'
  const input = isPhoto ? photoNote : text

  const startReview = async (result: AiResult, providerId: string, inputText: string) => {
    if (!result.foods.length && !result.workouts.length) {
      setError(isPhoto
        ? 'Hittade ingen mat i fotot. Prova en tydligare bild ovanifrån, eller skriv en kort kommentar om vad det är.'
        : 'Hittade ingen mat eller träning i texten. Prova att skriva mängd och livsmedel, t.ex. "2 ägg och 1 banan", eller använd manuell registrering.')
      return
    }
    const id = await saveInterpretation(inputText, providerId, result, isPhoto && photo ? { thumb: photo.thumb } : undefined)
    setReview({ id, provider: providerId, result, foods: result.foods.map((f) => ({ ...f, keep: true })), workouts: result.workouts.map((w) => ({ ...w, keep: true })) })
    setFollowUp('')
    window.scrollTo({ top: 0 })
  }

  const analyze = async (inputText = input, consented = false) => {
    setError(undefined)
    if (isPhoto) {
      if (!photo) { setError('Ta ett foto eller välj en bild först.'); return }
      if (photoVia === 'klistra_in') { setPasteOpen(true); return }
    } else {
      if (!inputText.trim()) { setError('Skriv eller diktera vad du har ätit eller hur du har tränat.'); return }
      if (provider === 'klistra_in') { setPasteOpen(true); return }
    }
    const useServer = isPhoto || provider === 'server'
    if (useServer) {
      if (!settings.aiEndpoint) { setError('Ingen serveradress är angiven. Gå till Inställningar → AI, eller byt till lokal tolkning.'); return }
      if (!online) { setError('Du är offline. Försök igen när du har uppkoppling.'); return }
      const hasConsent = isPhoto ? settings.aiPhotoConsentAt : settings.aiConsentAt
      if (!hasConsent && !consented) { setConsent(isPhoto ? 'foto' : 'text'); return }
    }
    setBusy(true)
    try {
      const p = useServer ? serverProvider : localProvider
      const result = await p.interpret(inputText, ctx, { endpoint: settings.aiEndpoint, token: localStorageGet('dagbok.ai-token'), image: isPhoto && photo ? photo : undefined })
      await startReview(result, p.id, isPhoto ? `[Foto] ${inputText}`.trim() : inputText)
    } catch (e) {
      setError((e as Error).message || 'Tolkningen misslyckades.')
    } finally { setBusy(false) }
  }

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return
    setError(undefined)
    try { setPhoto(await prepareImage(file)) }
    catch (e) { setError((e as Error).message || 'Bilden kunde inte läsas.') }
  }

  // Textrutan får fokus direkt så att tangentbordet (med mikrofonknappen) redan är uppe.
  const showingText = !isPhoto && !review
  useEffect(() => { if (showingText) focusAtEnd(textRef.current) }, [showingText])

  if (review) {
    return <ReviewView review={review} setReview={setReview} date={date} today={today} followUp={followUp} setFollowUp={setFollowUp} thumb={isPhoto ? photo?.thumb : undefined}
      onRefine={async () => {
        const t = `${input}\n${followUp}`.trim()
        if (isPhoto) setPhotoNote(t); else setText(t)
        await cancelInterpretation(review.id); setReview(null)
        if (review.provider === 'klistra_in') { setPasteOpen(true); return }
        await analyze(t, true)
      }}
      onCancel={async () => { await cancelInterpretation(review.id); setReview(null); toast('Inget sparades') }}
      onSave={async () => {
        const foods = review.foods.filter((f) => f.keep).map(({ keep: _k, ...f }) => { void _k; return f })
        const workouts = review.workouts.filter((w) => w.keep).map(({ keep: _k, ...w }) => { void _k; return w })
        await acceptInterpretation(review.id, foods, workouts, { date, time: ctx.now }, review.foods.length + review.workouts.length)
        if (isPhoto) { setPhotoNote(''); setPhoto(null) } else setText('')
        setReview(null)
        toast(`${foods.length + workouts.length} poster sparade`)
        navigate(date === today ? '/' : `/dag/${date}`)
      }} />
  }

  return (
    <div>
      <PageHeader title={isPhoto ? 'Fota maten' : 'Skriv eller prata in'} back="/" subtitle={relativeDayLabel(date, today)} />
      <div className="max-w-2xl mx-auto px-4 grid gap-3 pb-6">
        <Segmented label="Sätt att beskriva" value={mode} onChange={(m) => { if (m === 'text') primeKeyboard(); setMode(m); setError(undefined) }}
          options={[{ value: 'text', label: '🎙️ Skriv eller prata' }, { value: 'foto', label: '📷 Foto' }]} />

        {isPhoto ? (
          <Card>
            <p className="text-sm text-muted mb-3">Ta en bild på tallriken, gärna ovanifrån. AI:n gör en uppskattning som du granskar och justerar innan något sparas.</p>
            {photo ? (
              <div className="grid gap-2">
                <img src={photo.dataUrl} alt="Valt foto av måltiden" className="w-full max-h-80 object-cover rounded-2xl border border-line" />
                <label className="text-brand font-semibold min-h-11 flex items-center justify-center cursor-pointer">
                  Byt bild
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void onPickPhoto(e.target.files?.[0]); e.target.value = '' }} />
                </label>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 min-h-44 rounded-2xl border-2 border-dashed border-line bg-card-2 cursor-pointer active:opacity-80 font-semibold text-[17px]">
                <span aria-hidden="true" className="text-4xl">📷</span>
                Ta foto eller välj bild
                <input type="file" accept="image/*" className="sr-only" aria-label="Ta foto eller välj bild" onChange={(e) => { void onPickPhoto(e.target.files?.[0]); e.target.value = '' }} />
              </label>
            )}
            <label htmlFor="photo-note" className="font-medium block mt-3 mb-1">Kommentar (valfritt)</label>
            <textarea id="photo-note" className="field min-h-20" value={photoNote} onChange={(e) => setPhotoNote(e.target.value)}
              placeholder="T.ex. lättmjölk i glaset, stekt i smör, åt halva" />
            {error && <p className="text-danger text-[15px] mt-2" role="alert">{error}</p>}
            <Button variant="primary" block className="mt-3 min-h-14 text-[17px]" onClick={() => analyze()} disabled={busy || !photo} aria-busy={busy}>
              {busy ? 'Analyserar fotot …' : 'Analysera foto'}
            </Button>
            <p className="text-sm text-muted mt-2">
              {photoVia === 'server'
                ? <>Fotot analyseras av din serverfunktion{endpointHost ? ` (${endpointHost})` : ''}. Bilden förminskas och platsdata tas bort innan den skickas.</>
                : <>Fotot analyseras med valfri AI-tjänst, t.ex. Claude-appen: du delar bilden och klistrar in svaret. Inget skickas automatiskt. Med en egen serverfunktion sker det direkt i appen.</>}
              {' '}<a href="#/installningar/ai" className="text-brand underline">Ändra</a>
            </p>
          </Card>
        ) : (
          <Card>
            <label htmlFor="ai-text" className="font-semibold block mb-1">Beskriv vad du ätit eller hur du tränat</label>
            <p id="ai-help" className="text-sm text-muted mb-2">Skriv med egna ord eller tryck på <b>mikrofonen 🎙</b> nere till höger på tangentbordet för att diktera. Ange gärna mängder. Du får granska allt innan något sparas.</p>
            <textarea ref={textRef} id="ai-text" aria-describedby="ai-help" className="field min-h-44 text-[17px] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)}
              placeholder="T.ex. Till lunch åt jag 150 g kyckling, 2 dl ris och en sallad. Sen promenad 30 minuter." autoCapitalize="sentences" spellCheck enterKeyHint="enter" />
            <div className="flex gap-2 mt-2">
              {text && <Button variant="ghost" onClick={() => setText('')}>Rensa</Button>}
            </div>
            {error && <p className="text-danger text-[15px] mt-2" role="alert">{error}</p>}
            <Button variant="primary" block className="mt-3 min-h-14 text-[17px]" onClick={() => analyze()} disabled={busy} aria-busy={busy}>
              {busy ? 'Tolkar …' : 'Analysera text'}
            </Button>
            <p className="text-sm text-muted mt-2">
              Tolkning: <b>{provider === 'lokal' ? 'Lokal (på enheten, offline)' : provider === 'server' ? `Serverfunktion${endpointHost ? ` (${endpointHost})` : ''}` : 'Klistra in AI-svar'}</b>
              {' · '}<a href="#/installningar/ai" className="text-brand underline">Ändra</a>
              {provider === 'server' && <span className="block">Texten skickas till serverfunktionen när du trycker Analysera.</span>}
            </p>
          </Card>
        )}
        {!isPhoto && !text && (
          <section aria-label="Exempel">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-2 px-1">Exempel – tryck för att prova</h2>
            <div className="grid gap-2">{EXAMPLES.map((e) => <button key={e} type="button" onClick={() => setText(e)} className="text-left bg-card border border-line rounded-2xl p-3 text-[15px] active:bg-card-2">{e}</button>)}</div>
          </section>
        )}
        {recent.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[13px] font-semibold uppercase tracking-wide text-muted px-1 min-h-11 flex items-center">Tidigare tolkningar</summary>
            <ul className="grid gap-2 mt-1">
              {recent.map((r) => (
                <li key={r.id} className="bg-card border border-line rounded-2xl p-3 text-[15px] flex gap-3">
                  {r.imageThumb && <img src={r.imageThumb} alt="Foto som tolkades" className="h-16 w-16 object-cover rounded-xl shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-sm text-muted mb-1"><span>{formatShort(r.createdAt.slice(0, 10))} · {r.provider === 'lokal' ? 'lokal' : r.provider}</span><span>{{ vantar: 'Ej granskad', godkand: 'Godkänd', delvis: 'Delvis godkänd', avbruten: 'Avbruten' }[r.status]}</span></div>
                    <p className="line-clamp-3">"{r.inputText}"</p>
                    {r.inputKind !== 'foto' && <button type="button" className="text-brand font-semibold text-sm min-h-11" onClick={() => { primeKeyboard(); setMode('text'); setText(r.inputText) }}>Använd texten igen</button>}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <Sheet open={!!consent} onClose={() => setConsent(null)} title={consent === 'foto' ? 'Skicka foto för analys?' : 'Skicka text för tolkning?'}
        footer={<div className="flex gap-2"><Button block onClick={() => setConsent(null)}>Avbryt</Button>
          <Button block variant="primary" onClick={async () => {
            await saveSettings(consent === 'foto' ? { aiPhotoConsentAt: new Date().toISOString() } : { aiConsentAt: new Date().toISOString() })
            setConsent(null); await analyze(input, true)
          }}>Godkänn och skicka</Button></div>}>
        <div className="grid gap-2 text-[15px]">
          <p>{consent === 'foto' ? 'Fotot' : 'Texten'} skickas till din serverfunktion <b>{endpointHost}</b>, som i sin tur anropar en extern AI-tjänst.</p>
          {consent === 'foto'
            ? <p>Det som skickas är: <b>fotot</b> (förminskat och utan platsdata eller annan metadata), <b>din kommentar</b>, <b>datum och klockslag</b> samt <b>din senaste vikt</b>. Ingen annan information från dagboken skickas. Undvik att fota personer eller annat känsligt.</p>
            : <p>Det som skickas är: <b>texten du skrivit</b>, <b>datum och klockslag</b> samt <b>din senaste vikt</b> (för att uppskatta träningskalorier). Ingen annan information från dagboken skickas.</p>}
          <p className="text-muted">Du tillfrågas bara första gången. Samtycket kan återkallas under Inställningar.</p>
        </div>
      </Sheet>

      <Sheet open={pasteOpen} onClose={() => setPasteOpen(false)} title={isPhoto ? 'Analysera fotot med valfri AI-tjänst' : 'Tolka med valfri AI-tjänst'}>
        <PasteFlow prompt={pasteModePrompt(input, ctx, isPhoto)} photo={isPhoto ? photo : null} pasted={pasted} setPasted={setPasted}
          onParse={async () => {
            try { const r = parsePastedResponse(pasted); setPasteOpen(false); setPasted(''); await startReview(r, 'klistra_in', isPhoto ? `[Foto] ${input}`.trim() : input) }
            catch (e) { toast((e as Error).message) }
          }} />
      </Sheet>
    </div>
  )
}

function localStorageGet(k: string): string | undefined {
  try { return localStorage.getItem(k) ?? undefined } catch { return undefined }
}

function PasteFlow({ prompt, photo, pasted, setPasted, onParse }: { prompt: string; photo: PreparedImage | null; pasted: string; setPasted: (s: string) => void; onParse: () => void }) {
  const [copied, setCopied] = useState(false)
  const file = photo ? new File([photo.blob], 'maltid.jpg', { type: 'image/jpeg' }) : null
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  const canShareFile = !!file && !!nav.canShare?.({ files: [file] })
  const copy = async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true) } catch { setCopied(false) } }
  return (
    <div className="grid gap-3 text-[15px]">
      {photo ? (
        <ol className="list-decimal pl-5 grid gap-1">
          <li>Tryck <b>Kopiera instruktion</b>.</li>
          <li>Tryck <b>Dela fotot</b> och välj t.ex. Claude-appen (eller bifoga bilden där själv).</li>
          <li>Klistra in instruktionen i samma meddelande och skicka.</li>
          <li>Kopiera hela svaret och klistra in det här.</li>
        </ol>
      ) : (
        <ol className="list-decimal pl-5 grid gap-1">
          <li>Kopiera instruktionen nedan (den innehåller din text).</li>
          <li>Klistra in den i valfri AI-tjänst, t.ex. Claude-appen.</li>
          <li>Kopiera hela svaret och klistra in det här.</li>
        </ol>
      )}
      <Button variant="soft" onClick={copy}>{copied ? '✓ Instruktionen är kopierad' : 'Kopiera instruktion'}</Button>
      {photo && (canShareFile
        ? <Button variant="soft" onClick={async () => { try { await navigator.share({ files: [file!] }) } catch { /* avbrutet */ } }}>Dela fotot</Button>
        : <a href={photo.dataUrl} download="maltid.jpg" className="text-brand font-semibold min-h-11 flex items-center justify-center">Spara fotot</a>)}
      <details><summary className="cursor-pointer text-brand min-h-11 flex items-center">Visa instruktionen</summary><pre className="whitespace-pre-wrap text-xs bg-card-2 rounded-xl p-2 max-h-48 overflow-auto">{prompt}</pre></details>
      <label htmlFor="pasted" className="font-semibold">Klistra in svaret</label>
      <textarea id="pasted" className="field min-h-32 text-sm font-mono" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{"foods": [...], "workouts": [...]}' />
      <Button variant="primary" onClick={onParse} disabled={!pasted.trim()}>Granska förslaget</Button>
    </div>
  )
}

function ReviewView({ review, setReview, date, today, followUp, setFollowUp, onSave, onCancel, onRefine, thumb }: {
  thumb?: string
  review: Review; setReview: (r: Review) => void; date: string; today: string; followUp: string; setFollowUp: (s: string) => void
  onSave: () => void; onCancel: () => void; onRefine: () => void
}) {
  const [saving, setSaving] = useState(false)
  const kept = review.foods.filter((f) => f.keep)
  const keptW = review.workouts.filter((w) => w.keep)
  const kcal = kept.reduce((s, f) => s + f.kcal, 0)
  const protein = kept.reduce((s, f) => s + f.protein, 0)
  const updFood = (i: number, p: Partial<AiFoodItem & { keep: boolean }>) => setReview({ ...review, foods: review.foods.map((f, k) => (k === i ? { ...f, ...p } : f)) })
  const updW = (i: number, p: Partial<AiWorkoutItem & { keep: boolean }>) => setReview({ ...review, workouts: review.workouts.map((w, k) => (k === i ? { ...w, ...p } : w)) })
  const allOn = review.foods.every((f) => f.keep) && review.workouts.every((w) => w.keep)
  useEffect(() => { document.getElementById('review-title')?.focus() }, [])

  return (
    <div>
      <HideNav />
      <PageHeader title="Granska förslaget" subtitle={`Inget är sparat ännu · ${relativeDayLabel(date, today)}`} />
      <div className="max-w-2xl mx-auto px-4 grid gap-3 pb-44">
        <h2 id="review-title" tabIndex={-1} className="sr-only">Granska tolkningen</h2>
        {thumb && <img src={thumb} alt="Fotot som analyserades" className="h-28 w-28 object-cover rounded-2xl border border-line" />}
        <div className="flex flex-wrap gap-2 text-sm items-center" aria-label="Förklaring av markeringar">
          <OriginBadge origin="angivet" /><OriginBadge origin="beraknat" /><OriginBadge origin="uppskattat" /><OriginBadge origin="osakert" />
        </div>
        {review.result.followUpQuestion && (
          <Card className="!bg-protein-soft">
            <p className="font-semibold mb-2">{review.result.followUpQuestion}</p>
            <div className="flex gap-2">
              <input className="field flex-1" value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="Svara kort, t.ex. 2 dl" aria-label="Svar på följdfrågan" />
              <Button onClick={onRefine} disabled={!followUp.trim()}>Uppdatera</Button>
            </div>
            <p className="text-sm text-muted mt-1">Du kan också justera värdena direkt nedan.</p>
          </Card>
        )}
        {(review.result.assumptions.length > 0 || review.result.uncertainties.length > 0) && (
          <Notice>
            {review.result.assumptions.map((a) => <span key={a} className="block">• {a}</span>)}
            {review.result.uncertainties.map((u) => <span key={u} className="block">? {u}</span>)}
          </Notice>
        )}
        <label className="flex items-center gap-2 min-h-11 px-1">
          <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={allOn}
            onChange={(e) => setReview({ ...review, foods: review.foods.map((f) => ({ ...f, keep: e.target.checked })), workouts: review.workouts.map((w) => ({ ...w, keep: e.target.checked })) })} />
          Markera alla
        </label>

        {review.foods.map((f, i) => (
          <Card key={i} className={cx(!f.keep && 'opacity-60')}>
            <div className="flex items-start gap-3">
              <input type="checkbox" aria-label={`Ta med ${f.name}`} className="h-6 w-6 mt-3 accent-[var(--brand)] shrink-0" checked={f.keep} onChange={(e) => updFood(i, { keep: e.target.checked })} />
              <div className="flex-1 grid gap-2 min-w-0">
                <TextInput label="Livsmedel" value={f.name} onChange={(e) => updFood(i, { name: e.target.value })} />
                <div className="flex gap-2 flex-wrap">
                  <span className="text-sm text-muted">Mängd:</span><OriginBadge origin={f.amountOrigin} />
                  <span className="text-sm text-muted">Näring:</span><OriginBadge origin={f.nutritionOrigin} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberValueField label="Mängd" value={f.amount} onValue={(a) => {
                    // Räkna om näring proportionellt när mängden ändras
                    const r = a !== undefined ? rescale(f, a, f.unit) : undefined
                    if (r) updFood(i, { amount: a, ...r.nutrition, amountOrigin: 'angivet', nutritionOrigin: f.nutritionOrigin === 'angivet' ? 'beraknat' : f.nutritionOrigin })
                    else if (a !== undefined) updFood(i, { amount: a, amountOrigin: 'angivet' })
                  }} />
                  <Select label="Enhet" value={f.unit} onChange={(u: Unit) => {
                    const r = rescale(f, f.amount, u)
                    updFood(i, r ? { unit: u, ...r.nutrition, nutritionOrigin: f.nutritionOrigin === 'angivet' ? 'beraknat' : f.nutritionOrigin } : { unit: u, nutritionOrigin: 'osakert', note: 'Enheten kunde inte räknas om automatiskt – kontrollera kalorier och protein.' })
                  }} options={UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] }))} />
                  <NumberValueField label="Kalorier" value={f.kcal} onValue={(v) => updFood(i, { kcal: Math.round(v ?? 0), nutritionOrigin: 'angivet' })} suffix="kcal" integer />
                  <NumberValueField label="Protein" value={f.protein} onValue={(v) => updFood(i, { protein: v ?? 0, nutritionOrigin: 'angivet' })} suffix="g" />
                  <Select label="Måltid" value={f.meal} onChange={(m: MealType) => updFood(i, { meal: m })} options={MEALS.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} />
                  <div className="text-sm text-muted self-end pb-2 tabular">{f.fat !== undefined && <>Fett {fmtDec(f.fat)} g<br /></>}{f.carbs !== undefined && <>Kolh. {fmtDec(f.carbs)} g</>}</div>
                </div>
                {f.note && <p className="text-sm text-warn">{f.note}</p>}
                {f.date && f.date !== date && <p className="text-sm">Datum: {formatShort(f.date)}</p>}
              </div>
            </div>
          </Card>
        ))}

        {review.workouts.map((w, i) => (
          <Card key={'w' + i} className={cx(!w.keep && 'opacity-60', 'border-train/40')}>
            <div className="flex items-start gap-3">
              <input type="checkbox" aria-label={`Ta med ${ACTIVITY_LABEL[w.activity]}`} className="h-6 w-6 mt-3 accent-[var(--brand)] shrink-0" checked={w.keep} onChange={(e) => updW(i, { keep: e.target.checked })} />
              <div className="flex-1 grid gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <Select label="Aktivitet" value={w.activity} onChange={(a: ActivityType) => updW(i, { activity: a })} options={ACTIVITIES.map((a) => ({ value: a, label: ACTIVITY_LABEL[a] }))} />
                  <Select label="Intensitet" value={w.intensity} onChange={(v: Intensity) => updW(i, { intensity: v })} options={(['lag', 'medel', 'hog'] as Intensity[]).map((v) => ({ value: v, label: INTENSITY_LABEL[v] }))} />
                  <NumberValueField label="Minuter" value={w.durationMin} onValue={(v) => updW(i, { durationMin: Math.round(v ?? 0), durationOrigin: 'angivet' })} integer />
                  <NumberValueField label="Förbrukning" value={w.kcal} onValue={(v) => updW(i, { kcal: v, kcalOrigin: 'angivet' })} suffix="kcal" integer />
                </div>
                <div className="flex gap-2 flex-wrap items-center"><span className="text-sm text-muted">Tid:</span><OriginBadge origin={w.durationOrigin} /><span className="text-sm text-muted">Förbrukning:</span><OriginBadge origin={w.kcalOrigin} /></div>
                {w.note && <p className="text-sm text-muted">{w.note}</p>}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <div className="fixed bottom-0 inset-x-0 z-50 bg-bg/95 backdrop-blur border-t border-line px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm text-muted mb-2 tabular text-center">Valt: {kept.length} livsmedel · {fmtInt(kcal)} kcal · {fmtInt(protein)} g protein{keptW.length ? ` · ${keptW.length} pass` : ''}</p>
          <div className="flex gap-2">
            <Button onClick={onCancel}>Avbryt</Button>
            <Button variant="primary" block disabled={saving || kept.length + keptW.length === 0} onClick={async () => { setSaving(true); try { await onSave() } finally { setSaving(false) } }}>
              {kept.length + keptW.length === review.foods.length + review.workouts.length ? 'Godkänn och spara allt' : `Spara valda (${kept.length + keptW.length})`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
