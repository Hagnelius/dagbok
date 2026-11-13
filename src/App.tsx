import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ToastProvider, Sheet, cx } from './components/ui'
import { navigate, useRoute } from './router'
import { useProfile, useSettings, useToday, useOnline } from './hooks'
import { isDateKey } from './lib/dates'
import { db } from './lib/db'
import DayPage from './pages/DayPage'
import Onboarding from './pages/Onboarding'
import AddFoodPage from './pages/AddFoodPage'
import WorkoutPage from './pages/WorkoutPage'
import AiPage from './pages/AiPage'
import HistoryPage from './pages/HistoryPage'
import LibraryPage from './pages/LibraryPage'
import SettingsPage from './pages/SettingsPage'

// Diagramvyerna laddas vid behov så att startsidan öppnas snabbare.
const WeightPage = lazy(() => import('./pages/WeightPage'))
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'))

function useTheme() {
  const { theme } = useSettings()
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'morkt' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0b1210' : '#f4f5f2'))
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

export default function App() {
  useTheme()
  const profile = useProfile()
  const route = useRoute()
  const today = useToday()
  const online = useOnline()
  const [addOpen, setAddOpen] = useState(false)
  const demo = useLiveQuery(() => db.entries.filter((e) => !!e.isDemo).count(), [])

  if (profile === undefined) return <div className="min-h-dvh" aria-busy="true" />
  if (profile === null) return <ToastProvider><Onboarding /></ToastProvider>

  const [first, second] = route.parts
  const dateParam = route.query.get('datum')
  const date = isDateKey(dateParam) ? dateParam : today
  let page: ReactNode
  let tab: 'idag' | 'historik' | 'analys' | 'mer' | null = null
  switch (first) {
    case undefined: page = <DayPage date={today} />; tab = 'idag'; break
    case 'dag': page = <DayPage date={isDateKey(second) ? second : today} />; tab = second === today ? 'idag' : 'historik'; break
    case 'mat': page = <AddFoodPage date={date} initialTab={second} meal={route.query.get('maltid')} />; break
    case 'traning': page = <WorkoutPage date={date} />; break
    case 'vikt': page = <WeightPage date={date} />; break
    case 'ai': page = <AiPage key={route.query.get('lage') ?? 'text'} date={date} mode={route.query.get('lage')} />; break
    case 'historik': page = <HistoryPage />; tab = 'historik'; break
    case 'analys': page = <AnalysisPage />; tab = 'analys'; break
    case 'favoriter': page = <LibraryPage tab={second} />; break
    case 'installningar': page = <SettingsPage section={second} />; tab = 'mer'; break
    default: page = <DayPage date={today} />; tab = 'idag'
  }

  return (
    <ToastProvider>
      <div className="min-h-dvh pb-nav">
        {!online && <div className="pt-safe bg-warn-soft text-center text-sm py-1" role="status">Offline – allt sparas lokalt som vanligt.</div>}
        {!!demo && (
          <div className="bg-weight-soft text-center text-sm py-1.5 px-3" role="status">
            Demodata visas. <a href="#/installningar/data" className="underline font-semibold">Rensa testdata</a>
          </div>
        )}
        <main key={route.path} className="anim-fade"><Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>{page}</Suspense></main>
      </div>
      <BottomNav active={tab} onAdd={() => setAddOpen(true)} />
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} date={first === 'dag' && isDateKey(second) ? second : today} today={today} />
    </ToastProvider>
  )
}

function NavIcon({ name }: { name: 'idag' | 'historik' | 'analys' | 'mer' }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'idag' && <><circle cx="12" cy="12" r="8" {...p} /><path d="M12 8v4l2.5 2" {...p} /></>}
      {name === 'historik' && <><rect x="4" y="5" width="16" height="15" rx="2" {...p} /><path d="M4 10h16M9 3v4M15 3v4" {...p} /></>}
      {name === 'analys' && <path d="M4 19V9M10 19V5M16 19v-7M21 19H3" {...p} />}
      {name === 'mer' && <><circle cx="12" cy="12" r="3" {...p} /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" {...p} /></>}
    </svg>
  )
}

function BottomNav({ active, onAdd }: { active: string | null; onAdd: () => void }) {
  const item = (key: 'idag' | 'historik' | 'analys' | 'mer', label: string, href: string) => (
    <a href={href} aria-current={active === key ? 'page' : undefined}
      className={cx('flex-1 flex flex-col items-center justify-center gap-0.5 min-h-14 text-[11px] font-semibold rounded-xl', active === key ? 'text-brand' : 'text-muted')}>
      <NavIcon name={key} />{label}
    </a>
  )
  return (
    <nav aria-label="Huvudmeny" className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-md border-t border-line pb-safe">
      <div className="flex items-center max-w-2xl mx-auto px-2 h-[72px]">
        {item('idag', 'Idag', '#/')}
        {item('historik', 'Historik', '#/historik')}
        <div className="flex-1 flex justify-center">
          <button type="button" onClick={onAdd} aria-label="Lägg till" aria-haspopup="dialog"
            className="h-14 w-14 -mt-6 rounded-full bg-brand text-brand-ink shadow-lg shadow-brand/30 flex items-center justify-center active:scale-95 transition-transform">
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" /></svg>
          </button>
        </div>
        {item('analys', 'Analys', '#/analys')}
        {item('mer', 'Inställningar', '#/installningar')}
      </div>
    </nav>
  )
}

function AddSheet({ open, onClose, date, today }: { open: boolean; onClose: () => void; date: string; today: string }) {
  const q = date !== today ? `?datum=${date}` : ''
  const go = (to: string) => { onClose(); navigate(to + (q && to.includes('?') ? q.replace('?', '&') : q)) }
  const opt = (icon: string, label: string, help: string, to: string, tone: string) => (
    <button type="button" onClick={() => go(to)} className="flex items-center gap-3 w-full text-left bg-card border border-line rounded-2xl p-3 min-h-16 active:bg-card-2">
      <span className={cx('h-11 w-11 rounded-xl flex items-center justify-center text-xl', tone)} aria-hidden="true">{icon}</span>
      <span><span className="block font-semibold">{label}</span><span className="block text-sm text-muted">{help}</span></span>
    </button>
  )
  return (
    <Sheet open={open} onClose={onClose} title={date !== today ? `Lägg till (${date})` : 'Lägg till'}>
      <div className="grid gap-2">
        {opt('⚡', 'Snabbregistrera', 'Favoriter, standardmåltider och senaste', '/mat/snabb', 'bg-brand-soft')}
        {opt('🍽️', 'Mat', 'Sök, ange manuellt eller kopiera', '/mat/sok', 'bg-kcal-soft')}
        {opt('🏃', 'Träning', 'Pass och vardagsmotion', '/traning', 'bg-train-soft')}
        {opt('⚖️', 'Vikt och mått', 'Vikt, midja, vilopuls', '/vikt', 'bg-weight-soft')}
        {opt('🎙️', 'Skriv eller prata in', 'Beskriv med egna ord – granska innan du sparar', '/ai', 'bg-protein-soft')}
        {opt('📷', 'Fota maten', 'AI uppskattar måltiden – du bekräftar', '/ai?lage=foto', 'bg-protein-soft')}
        <a href="#/favoriter" onClick={onClose} className="text-center text-brand font-semibold py-3 min-h-11">Hantera favoriter och mallar</a>
      </div>
    </Sheet>
  )
}
