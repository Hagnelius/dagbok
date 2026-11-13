import { useSettings } from '../hooks'
import { saveSettings } from '../lib/repo'

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}
export function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Diskret instruktion som bara visas i Safari på iPhone/iPad när appen inte redan är installerad. */
export default function InstallHint({ force }: { force?: boolean }) {
  const s = useSettings()
  if (!force && (s.installHintDismissed || isStandalone() || !isIos())) return null
  return <InstallSteps onDismiss={force ? undefined : () => void saveSettings({ installHintDismissed: true })} />
}

export function InstallSteps({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <aside aria-label="Lägg till på hemskärmen" className="rounded-2xl bg-brand-soft px-3 py-2 flex gap-2 items-start">
      <span aria-hidden="true" className="text-xl mt-0.5">📲</span>
      <div className="flex-1 text-sm">
        <p className="font-semibold">Lägg appen på hemskärmen</p>
        <p>Tryck på <b>Dela</b> <span aria-hidden="true">(□↑)</span> i Safari → <b>Lägg till på hemskärmen</b>. Då öppnas dagboken som en app och fungerar offline.</p>
      </div>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dölj instruktionen" className="min-h-11 min-w-11 rounded-full text-muted">✕</button>}
    </aside>
  )
}
