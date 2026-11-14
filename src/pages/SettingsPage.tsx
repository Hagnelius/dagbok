import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, Notice, PageHeader, Segmented, Select, Sheet, TextInput, cx, useConfirm, useToast } from '../components/ui'
import { InstallSteps, isStandalone } from '../components/InstallHint'
import Onboarding from './Onboarding'
import { useGoals, useLatestWeight, useProfile, useSettings, useToday } from '../hooks'
import { addDays, diffDays, formatShort, startOfMonth, todayKey } from '../lib/dates'
import { clearAll, downloadText, exportAll, exportCsv, importBackup, markBackupDone, validateBackup, type ValidationResult } from '../lib/backup'
import { clearDemoData, hasDemoData, loadDemoData } from '../lib/demo'
import { fmtInt } from '../lib/format'
import { recalcGoalIfCalculated, saveSettings } from '../lib/repo'
import { goalForDate } from '../lib/stats'
import type { AiProviderId, ExerciseCalorieMode, ThemeSetting, WeighInPolicy } from '../lib/types'
import { navigate } from '../router'

async function shareOrDownload(filename: string, text: string, mime: string) {
  const file = new File([text], filename, { type: mime })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: filename }); return true } catch (e) { if ((e as Error).name === 'AbortError') return false }
  }
  downloadText(filename, text, mime)
  return true
}

export default function SettingsPage({ section }: { section?: string }) {
  const profile = useProfile()
  const goals = useGoals()
  const settings = useSettings()
  const today = useToday()
  const latest = useLatestWeight()
  const toast = useToast()
  const confirm = useConfirm()
  const goal = goalForDate(goals, today)

  useEffect(() => { if (section && section !== 'profil') document.getElementById(`sec-${section}`)?.scrollIntoView() }, [section])

  if (section === 'profil' && profile) {
    return <Onboarding existing={profile} currentGoal={goal} latestWeight={latest?.weight} exerciseMode={settings.exerciseCalorieMode} onDone={() => navigate('/installningar', { replace: true })} />
  }

  const setMode = async (m: ExerciseCalorieMode) => {
    await saveSettings({ exerciseCalorieMode: m })
    await recalcGoalIfCalculated()
    toast('Inställningen är sparad')
  }

  return (
    <div>
      <PageHeader title="Inställningar" />
      <div className="max-w-2xl mx-auto px-4 grid gap-4 pb-8">
        <Card aria-labelledby="h-goal">
          <h2 id="h-goal" className="font-bold text-lg mb-2">Profil och mål</h2>
          {goal && (
            <p className="tabular text-[17px]"><b>{fmtInt(goal.kcal)} kcal</b> och <b>{goal.protein} g protein</b> per dag
              <span className="block text-sm text-muted">{goal.mode === 'beraknat' ? 'Beräknat' : 'Eget mål'} · gäller från {formatShort(goal.validFrom)}{profile ? ` · målvikt ${String(profile.goalWeightKg).replace('.', ',')} kg` : ''}</span></p>
          )}
          <div className="grid grid-cols-1 gap-2 mt-3">
            <Button variant="soft" onClick={() => navigate('/installningar/profil')}>Ändra profil och mål</Button>
            {goal?.mode === 'beraknat' && latest && (
              <Button onClick={async () => { await recalcGoalIfCalculated(); toast('Målet är omräknat med senaste vikten') }}>Räkna om mål med senaste vikt ({String(latest.weight).replace('.', ',')} kg)</Button>
            )}
            <a href="#/favoriter" className="text-brand font-semibold min-h-11 flex items-center justify-center">Favoriter och mallar</a>
          </div>
        </Card>

        <Card aria-labelledby="h-ex">
          <h2 id="h-ex" className="font-bold text-lg mb-1">Träningskalorier</h2>
          <p className="text-sm text-muted mb-3">Träningsförbrukning är en grov uppskattning. Välj hur mycket av den som får läggas till dagens matbudget.</p>
          <fieldset className="grid gap-2">
            <legend className="sr-only">Hantering av träningskalorier</legend>
            {([
              ['separat', 'Visa separat', 'Läggs inte till matbudgeten. Din normala träning ingår då i stället i grundmålet.'],
              ['andel', 'Lägg till en andel', 'En vald andel av den uppskattade förbrukningen fyller en egen träningsstapel när du ätit upp grundmålet. (Standard: 75 %)'],
              ['alla', 'Lägg till allt', 'Hela uppskattningen läggs till. Planerad träning tas då bort ur grundmålet.'],
            ] as Array<[ExerciseCalorieMode, string, string]>).map(([v, l, h]) => (
              <label key={v} className={cx('flex gap-3 rounded-2xl border p-3 min-h-14 cursor-pointer', settings.exerciseCalorieMode === v ? 'border-brand bg-brand-soft' : 'border-line')}>
                <input type="radio" name="exmode" className="h-5 w-5 mt-0.5 accent-[var(--brand)]" checked={settings.exerciseCalorieMode === v} onChange={() => setMode(v)} />
                <span><span className="block font-semibold">{l}</span><span className="block text-sm text-muted">{h}</span></span>
              </label>
            ))}
          </fieldset>
          {settings.exerciseCalorieMode === 'andel' && (
            <div className="mt-3">
              <label htmlFor="pct" className="font-medium">Andel: {settings.exerciseCaloriePercent} %</label>
              <input id="pct" type="range" min={10} max={100} step={5} value={settings.exerciseCaloriePercent} onChange={(e) => saveSettings({ exerciseCaloriePercent: Number(e.target.value) })} className="w-full h-11 accent-[var(--brand)]" />
            </div>
          )}
        </Card>

        <Card aria-labelledby="h-vikt">
          <h2 id="h-vikt" className="font-bold text-lg mb-2">Vikt och utseende</h2>
          <div className="grid gap-3">
            <Select<WeighInPolicy> label="Flera vägningar samma dag" value={settings.weighInPolicy} onChange={(v) => saveSettings({ weighInPolicy: v })}
              hint="Ett värde per dag används i trender och snitt." options={[{ value: 'forsta', label: 'Använd dagens första (rekommenderas)' }, { value: 'senaste', label: 'Använd dagens senaste' }, { value: 'medel', label: 'Använd medelvärdet' }]} />
            <div>
              <p className="text-[15px] font-medium mb-1.5">Tema</p>
              <Segmented<ThemeSetting> label="Tema" value={settings.theme} onChange={(v) => saveSettings({ theme: v })} options={[{ value: 'system', label: 'Auto' }, { value: 'ljust', label: 'Ljust' }, { value: 'morkt', label: 'Mörkt' }]} />
            </div>
          </div>
        </Card>

        <AiSettings key={settings.aiEndpoint} />
        <DataSettings today={today} lastBackupAt={settings.lastBackupAt} confirmAsk={confirm.ask} />

        <Card aria-labelledby="h-inst" >
          <h2 id="h-inst" className="font-bold text-lg mb-2">Installera på iPhone</h2>
          {isStandalone() ? <p className="text-[15px]">Appen körs redan från hemskärmen. ✓</p> : <InstallSteps />}
          <p className="text-sm text-muted mt-2">Öppna appens adress i <b>Safari</b> (inte i en annan app eller webbläsare), tryck på Dela och välj Lägg till på hemskärmen.</p>
        </Card>

        <Card aria-labelledby="h-om">
          <h2 id="h-om" className="font-bold text-lg mb-2">Integritet och om appen</h2>
          <div className="text-[15px] grid gap-2">
            <p>All data sparas lokalt i den här webbläsaren (IndexedDB) på den här enheten. Det finns inget konto och ingen molnlagring. Ingenting skickas någonstans, med ett undantag: om du själv aktiverar en AI-serverfunktion skickas den text du ber om att få tolkad.</p>
            <p className="text-muted">Beräkningar av energibehov och träningsförbrukning är uppskattningar och inte medicinsk rådgivning.</p>
            <p className="text-muted text-sm">Version {__APP_VERSION__}</p>
          </div>
        </Card>
      </div>
      {confirm.node}
    </div>
  )
}

function AiSettings() {
  const settings = useSettings()
  const toast = useToast()
  const [endpoint, setEndpoint] = useState(settings.aiEndpoint)
  const [token, setToken] = useState(() => { try { return localStorage.getItem('dagbok.ai-token') ?? '' } catch { return '' } })
  const speechSupported = typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
  const urlError = endpoint && !/^https:\/\/|^http:\/\/localhost|^http:\/\/127\.0\.0\.1/.test(endpoint) ? 'Adressen måste börja med https://' : undefined
  return (
    <Card aria-labelledby="h-ai">
      <h2 id="sec-ai" className="font-bold text-lg mb-1"><span id="h-ai">AI-tolkning (text, tal och foto)</span></h2>
      <p className="text-sm text-muted mb-3">Resten av appen fungerar helt utan AI. Alla förslag granskas innan något sparas. Foton kan inte tolkas lokalt – de analyseras via serverfunktionen, eller med klistra in-läget om ingen server är inställd.</p>
      <fieldset className="grid gap-2">
        <legend className="sr-only">Tolkningsmetod</legend>
        {([
          ['lokal', 'Lokal tolkning', 'Regelbaserad tolkning på enheten med en inbyggd livsmedelslista. Fungerar offline, inget skickas.'],
          ['klistra_in', 'Klistra in AI-svar', 'Appen skapar en instruktion som du kopierar till valfri AI-tjänst och klistrar tillbaka svaret.'],
          ['server', 'Egen serverfunktion', 'Texten skickas till en serverfunktion du driftsätter (se README). API-nyckeln ligger bara på servern.'],
        ] as Array<[AiProviderId, string, string]>).map(([v, l, h]) => (
          <label key={v} className={cx('flex gap-3 rounded-2xl border p-3 min-h-14 cursor-pointer', settings.aiProvider === v ? 'border-brand bg-brand-soft' : 'border-line')}>
            <input type="radio" name="aiprov" className="h-5 w-5 mt-0.5 accent-[var(--brand)]" checked={settings.aiProvider === v} onChange={() => saveSettings({ aiProvider: v })} />
            <span><span className="block font-semibold">{l}</span><span className="block text-sm text-muted">{h}</span></span>
          </label>
        ))}
      </fieldset>
      {settings.aiProvider === 'server' && (
        <div className="grid gap-3 mt-3">
          <TextInput label="Serverfunktionens adress" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://dagbok-ai.exempel.workers.dev/tolka"
            value={endpoint} onChange={(e) => setEndpoint(e.target.value)} error={urlError} />
          <TextInput label="Åtkomstkod (valfri)" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)}
            hint="Den kod du satt som APP_TOKEN på servern. Sparas bara på den här enheten och ingår inte i säkerhetskopior." />
          <Button variant="soft" disabled={!!urlError} onClick={async () => {
            await saveSettings({ aiEndpoint: endpoint.trim() })
            try { if (token) localStorage.setItem('dagbok.ai-token', token); else localStorage.removeItem('dagbok.ai-token') } catch { /* ignore */ }
            toast('AI-inställningen är sparad')
          }}>Spara</Button>
          {settings.aiConsentAt && (
            <p className="text-sm text-muted">Du godkände att text skickas {formatShort(settings.aiConsentAt.slice(0, 10))}. <button type="button" className="text-brand underline min-h-11" onClick={() => saveSettings({ aiConsentAt: undefined })}>Återkalla</button></p>
          )}
          {settings.aiPhotoConsentAt && (
            <p className="text-sm text-muted">Du godkände att foton skickas {formatShort(settings.aiPhotoConsentAt.slice(0, 10))}. <button type="button" className="text-brand underline min-h-11" onClick={() => saveSettings({ aiPhotoConsentAt: undefined })}>Återkalla</button></p>
          )}
        </div>
      )}
      {speechSupported && (
        <label className="flex gap-3 items-start mt-4 min-h-11">
          <input type="checkbox" className="h-5 w-5 mt-0.5 accent-[var(--brand)]" checked={settings.speechRecognition} onChange={(e) => saveSettings({ speechRecognition: e.target.checked })} />
          <span><span className="block font-medium">Visa knapp för webbläsarens taligenkänning</span><span className="block text-sm text-muted">Valfritt. Ljudet kan behandlas av webbläsarens leverantör (t.ex. Apple eller Google). Tangentbordets vanliga mikrofonknapp fungerar alltid.</span></span>
        </label>
      )}
    </Card>
  )
}

function DataSettings({ today, lastBackupAt, confirmAsk }: { today: string; lastBackupAt?: string; confirmAsk: (t: string, c?: string, danger?: boolean) => Promise<boolean> }) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ValidationResult | null>(null)
  const [csv, setCsv] = useState({ kind: 'mat' as 'mat' | 'traning' | 'vikt', start: startOfMonth(today), end: today })
  const demo = useLiveQuery(() => hasDemoData(), [])
  const daysSince = lastBackupAt ? diffDays(today, todayKey(new Date(lastBackupAt))) : undefined

  const doExport = async () => {
    const data = await exportAll()
    const ok = await shareOrDownload(`dagbok-sakerhetskopia-${today}.json`, JSON.stringify(data, null, 1), 'application/json')
    if (ok) { await markBackupDone(); toast('Säkerhetskopian är skapad') }
  }
  const onFile = async (f: File) => {
    try { setPending(validateBackup(JSON.parse(await f.text()))) }
    catch { setPending({ ok: false, errors: ['Filen kunde inte läsas som JSON.'], counts: {} }) }
  }

  return (
    <Card aria-labelledby="h-data">
      <h2 id="sec-data" className="font-bold text-lg mb-1"><span id="h-data">Data och säkerhetskopiering</span></h2>
      <Notice tone="warn">Data finns bara i den här webbläsaren. Den kan försvinna om webbläsardata raderas, om appen tas bort från hemskärmen eller om enheten byts. Gör en säkerhetskopia regelbundet och spara filen t.ex. i Filer eller iCloud Drive.</Notice>
      <p className="text-[15px] mt-3">Senaste säkerhetskopia: <b>{lastBackupAt ? `${formatShort(lastBackupAt.slice(0, 10))} (${daysSince === 0 ? 'idag' : `för ${daysSince} dagar sedan`})` : 'aldrig'}</b></p>
      <div className="grid gap-2 mt-3">
        <Button variant="primary" onClick={doExport}>Exportera säkerhetskopia (JSON)</Button>
        <Button onClick={() => fileRef.current?.click()}>Importera säkerhetskopia</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Välj säkerhetskopia" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = '' }} />
      </div>

      <h3 className="font-semibold mt-5 mb-2">Exportera som CSV</h3>
      <div className="grid gap-2">
        <Segmented label="Innehåll" size="sm" value={csv.kind} onChange={(k) => setCsv({ ...csv, kind: k })} options={[{ value: 'mat', label: 'Mat' }, { value: 'traning', label: 'Träning' }, { value: 'vikt', label: 'Vikt' }]} />
        <div className="grid grid-cols-2 gap-2">
          <TextInput label="Från" type="date" value={csv.start} onChange={(e) => setCsv({ ...csv, start: e.target.value })} />
          <TextInput label="Till" type="date" value={csv.end} onChange={(e) => setCsv({ ...csv, end: e.target.value })} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="text-brand text-sm font-semibold min-h-11 px-1" onClick={() => setCsv({ ...csv, start: addDays(today, -6), end: today })}>Senaste 7 dagarna</button>
          <button type="button" className="text-brand text-sm font-semibold min-h-11 px-1" onClick={() => setCsv({ ...csv, start: '2000-01-01', end: today })}>Allt</button>
        </div>
        <Button onClick={async () => { await shareOrDownload(`dagbok-${csv.kind}-${csv.start}-${csv.end}.csv`, await exportCsv(csv.kind, csv.start, csv.end), 'text/csv') }}>Exportera CSV</Button>
      </div>

      <h3 className="font-semibold mt-5 mb-2">Demoläge och radering</h3>
      <div className="grid gap-2">
        {demo ? (
          <Button onClick={async () => { await clearDemoData(); toast('All testdata är borttagen') }}>Rensa all testdata</Button>
        ) : (
          <Button onClick={async () => { if (await confirmAsk('Lägg till fyra veckors syntetisk testdata? Den märks som demodata och kan rensas med en knapp utan att dina egna registreringar påverkas.', 'Lägg till', false)) { await loadDemoData(); toast('Demodata tillagd') } }}>Visa demodata</Button>
        )}
        <Button variant="danger" onClick={async () => {
          if (!(await confirmAsk('Radera ALL data i appen på den här enheten? Detta går inte att ångra. Gör gärna en säkerhetskopia först.', 'Fortsätt'))) return
          if (!(await confirmAsk('Är du helt säker? Profil, mål, registreringar och mallar raderas.', 'Radera allt'))) return
          await clearAll(); toast('All data är raderad'); navigate('/', { replace: true })
        }}>Radera all lokal data</Button>
      </div>

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Importera säkerhetskopia"
        footer={pending?.ok ? <div className="flex gap-2"><Button block onClick={() => setPending(null)}>Avbryt</Button>
          <Button block variant="danger" onClick={async () => { await importBackup(pending.backup!); setPending(null); toast('Säkerhetskopian är återställd'); navigate('/', { replace: true }) }}>Ersätt min data</Button></div> : undefined}>
        {pending && (pending.ok ? (
          <div className="grid gap-2 text-[15px]">
            <p>Filen är kontrollerad och innehåller:</p>
            <ul className="tabular">
              <li>{pending.counts.entries ?? 0} matposter</li><li>{pending.counts.workouts ?? 0} träningspass</li>
              <li>{pending.counts.measurements ?? 0} mätningar</li><li>{(pending.counts.foods ?? 0) + (pending.counts.mealTemplates ?? 0) + (pending.counts.recipes ?? 0) + (pending.counts.workoutTemplates ?? 0)} favoriter och mallar</li>
              {pending.backup?.exportedAt && <li className="text-muted">Skapad {formatShort(pending.backup.exportedAt.slice(0, 10))}</li>}
            </ul>
            <Notice tone="warn">All nuvarande data på den här enheten ersätts med innehållet i filen.</Notice>
          </div>
        ) : (
          <div className="grid gap-2 text-[15px]" role="alert">
            <p className="font-semibold">Filen kan inte importeras. Ingenting har ändrats.</p>
            <ul className="list-disc pl-5 text-sm">{pending.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        ))}
      </Sheet>
    </Card>
  )
}
