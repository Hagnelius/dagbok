import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'
import { goBack } from '../router'
import type { ValueOrigin } from '../lib/types'
import { ORIGIN_LABEL } from '../lib/labels'

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
export function Button({ variant = 'secondary', className, block, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  const v: Record<Variant, string> = {
    primary: 'bg-brand text-brand-ink active:opacity-85 disabled:opacity-50',
    secondary: 'bg-card border border-line active:bg-card-2 disabled:opacity-50',
    soft: 'bg-brand-soft text-ink active:opacity-85 disabled:opacity-50',
    ghost: 'bg-transparent active:bg-card-2 disabled:opacity-50',
    danger: 'bg-card border border-line text-danger active:bg-card-2 disabled:opacity-50',
  }
  return (
    <button type="button" {...p}
      className={cx('min-h-11 min-w-11 rounded-xl px-4 py-2.5 font-semibold transition-colors inline-flex items-center justify-center gap-2 select-none', v[variant], block && 'w-full', className)} />
  )
}

export function Card({ className, children, as: As = 'section', ...rest }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article'; 'aria-label'?: string; 'aria-labelledby'?: string }) {
  return <As {...rest} className={cx('bg-card rounded-2xl border border-line/70 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]', className)}>{children}</As>
}

export function PageHeader({ title, back, right, subtitle }: { title: string; back?: boolean | string; right?: ReactNode; subtitle?: ReactNode }) {
  return (
    <header className="pt-safe sticky top-0 z-20 bg-bg/90 backdrop-blur-md">
      <div className="flex items-center gap-1 px-2 min-h-14 max-w-2xl mx-auto">
        {back ? (
          <button type="button" onClick={() => goBack(typeof back === 'string' ? back : '/')} aria-label="Tillbaka"
            className="min-h-11 min-w-11 rounded-xl flex items-center justify-center text-brand active:bg-card-2">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        ) : <span className="w-2" />}
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold leading-tight truncate">{title}</h1>
          {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
        </div>
        {right}
      </div>
    </header>
  )
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[15px] font-medium">{label}</label>
      {children}
      {hint && !error && <p className="text-sm text-muted">{hint}</p>}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  )
}

export function TextInput({ label, hint, error, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: string }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input id={id} className={cx('field', className)} aria-invalid={!!error || undefined} {...p} />
    </Field>
  )
}

/** Sifferfält med decimaltangentbord. Värdet hanteras som sträng för att tillåta "1," under inmatning. */
export function NumberField({ label, value, onChange, suffix, hint, error, placeholder, integer, id: idProp, ...rest }: {
  label: ReactNode; value: string; onChange: (v: string) => void; suffix?: string; hint?: ReactNode; error?: string; placeholder?: string; integer?: boolean; id?: string; autoFocus?: boolean; 'aria-describedby'?: string
}) {
  const gen = useId()
  const id = idProp ?? gen
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <input id={id} className={cx('field tabular', suffix && 'pr-14')} inputMode={integer ? 'numeric' : 'decimal'} enterKeyHint="done"
          value={value} placeholder={placeholder} aria-invalid={!!error || undefined}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,-]/g, ''))} {...rest} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true">{suffix}</span>}
      </div>
    </Field>
  )
}

export function Select<T extends string>({ label, value, onChange, options, hint }: { label: ReactNode; value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; hint?: ReactNode }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

export function Segmented<T extends string>({ label, value, onChange, options, size = 'md' }: { label: string; value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }>; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex bg-card-2 rounded-xl p-1 gap-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx('flex-1 rounded-lg font-semibold transition-colors min-h-11', size === 'sm' ? 'text-sm px-2' : 'px-3',
            value === o.value ? 'bg-card shadow-sm text-ink' : 'text-muted')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chip({ selected, onClick, children, className }: { selected?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={cx('min-h-11 px-4 rounded-full border font-medium whitespace-nowrap transition-colors',
        selected ? 'bg-brand text-brand-ink border-brand' : 'bg-card border-line active:bg-card-2', className)}>
      {children}
    </button>
  )
}

export function Stepper({ value, onChange, step = 1, min = 0, label, format }: { value: number; onChange: (v: number) => void; step?: number; min?: number; label: string; format?: (v: number) => string }) {
  const f = format ?? ((v: number) => new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(v))
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" aria-label={`Minska ${label}`} disabled={value - step < min - 1e-9} onClick={() => onChange(Math.round((value - step) * 100) / 100)}
        className="min-h-11 min-w-11 rounded-full bg-card-2 text-xl font-bold disabled:opacity-40 active:opacity-70">−</button>
      <span className="min-w-10 text-center font-semibold tabular" aria-live="polite">{f(value)}</span>
      <button type="button" aria-label={`Öka ${label}`} onClick={() => onChange(Math.round((value + step) * 100) / 100)}
        className="min-h-11 min-w-11 rounded-full bg-card-2 text-xl font-bold active:opacity-70">+</button>
    </div>
  )
}

/** Progressindikator. Överskridet mål visas lugnt med streckat mönster i stället för röd färg. */
export function Progress({ value, max, color, label, valueText }: { value: number; max: number; color: 'kcal' | 'protein' | 'train' | 'weight'; label: string; valueText: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const over = max > 0 && value > max
  const bg: Record<string, string> = { kcal: 'bg-kcal', protein: 'bg-protein', train: 'bg-train', weight: 'bg-weight' }
  const soft: Record<string, string> = { kcal: 'bg-kcal-soft', protein: 'bg-protein-soft', train: 'bg-train-soft', weight: 'bg-weight-soft' }
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(value)} aria-valuetext={valueText}
      className={cx('h-3 rounded-full overflow-hidden', soft[color])}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', bg[color])}
        style={{ width: `${pct}%`, backgroundImage: over ? 'repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,.35) 6px 10px)' : undefined }} />
    </div>
  )
}

export function OriginBadge({ origin }: { origin?: ValueOrigin }) {
  if (!origin) return null
  const c: Record<ValueOrigin, string> = {
    angivet: 'bg-brand-soft text-ink',
    beraknat: 'bg-protein-soft text-ink',
    uppskattat: 'bg-card-2 text-muted',
    osakert: 'bg-warn-soft text-warn',
  }
  const icon: Record<ValueOrigin, string> = { angivet: '✓', beraknat: '=', uppskattat: '≈', osakert: '?' }
  return <span className={cx('inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5', c[origin])}><span aria-hidden="true">{icon[origin]}</span>{ORIGIN_LABEL[origin]}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted text-[15px] py-2">{children}</p>
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  return (
    <div role={tone === 'warn' ? 'note' : undefined} className={cx('rounded-xl px-3 py-2.5 text-[15px]', tone === 'warn' ? 'bg-warn-soft text-ink' : 'bg-card-2 text-ink')}>
      {tone === 'warn' && <span aria-hidden="true" className="mr-1.5">⚠︎</span>}{children}
    </div>
  )
}

/** Nedre ark (bottom sheet) – dialog med fokusfälla light och stängning via Escape/bakgrund. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onClose = () => closeRef.current()
    const prev = document.activeElement as HTMLElement | null
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button')?.focus({ preventScroll: true }), 50)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.({ preventScroll: true }) }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 anim-fade" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative w-full sm:max-w-lg bg-bg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] flex flex-col anim-sheet shadow-2xl">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h2 id={titleId} className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Stäng" className="min-h-11 min-w-11 rounded-full flex items-center justify-center text-muted active:bg-card-2">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-4 flex-1">{children}</div>
        {footer && <div className="px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] border-t border-line bg-bg rounded-b-3xl">{footer}</div>}
        {!footer && <div className="pb-safe" />}
      </div>
    </div>
  )
}

// ---------- Toast ----------

interface ToastMsg { id: number; text: string; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(text: string, action?: ToastMsg['action']) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([])
  const show = useCallback((text: string, action?: ToastMsg['action']) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x.slice(-1), { id, text, action }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), action ? 5000 : 2600)
    if ('vibrate' in navigator) try { navigator.vibrate(10) } catch { /* ignore */ }
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="fixed left-0 right-0 bottom-nav-offset z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="anim-pop pointer-events-auto bg-ink text-bg rounded-2xl pl-4 pr-2 py-2 shadow-lg flex items-center gap-3 max-w-md min-h-12">
            <span className="flex items-center gap-2"><span aria-hidden="true" className="text-train">✓</span>{t.text}</span>
            {t.action && <button type="button" className="min-h-11 px-3 font-semibold text-brand-soft underline" onClick={() => { t.action!.run(); setItems((x) => x.filter((y) => y.id !== t.id)) }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ---------- Bekräftelse ----------

export function useConfirm() {
  const [state, setState] = useState<{ text: string; confirm: string; danger: boolean; resolve: (v: boolean) => void } | null>(null)
  const ask = (text: string, confirm = 'Ta bort', danger = true) => new Promise<boolean>((resolve) => setState({ text, confirm, danger, resolve }))
  const node = state ? (
    <Sheet open title="Bekräfta" onClose={() => { state.resolve(false); setState(null) }}
      footer={<div className="flex gap-2">
        <Button block onClick={() => { state.resolve(false); setState(null) }}>Avbryt</Button>
        <Button block variant={state.danger ? 'danger' : 'primary'} data-autofocus onClick={() => { state.resolve(true); setState(null) }}>{state.confirm}</Button>
      </div>}>
      <p>{state.text}</p>
    </Sheet>
  ) : null
  return { ask, node }
}

export function SectionTitle({ children, right, id }: { children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between mt-6 mb-2 px-1">
      <h2 id={id} className="text-[13px] font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {right}
    </div>
  )
}

/** Sifferfält bundet till ett tal. Behåller inmatningen som text (t.ex. "1,") tills den är komplett. */
export function NumberValueField({ value, onValue, ...rest }: Omit<Parameters<typeof NumberField>[0], 'value' | 'onChange'> & { value: number | undefined; onValue: (n: number | undefined) => void }) {
  const toStr = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','))
  const [s, setS] = useState(toStr(value))
  useEffect(() => {
    const parsed = s.trim() === '' ? undefined : Number(s.replace(',', '.'))
    if (parsed !== value) setS(toStr(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return <NumberField {...rest} value={s} onChange={(v) => { setS(v); const t = v.replace(',', '.'); if (t === '') onValue(undefined); else if (!t.endsWith('.') && Number.isFinite(Number(t))) onValue(Number(t)) }} />
}

/** Döljer bottenmenyn medan komponenten visas (t.ex. i granskningsvyer med egen knapprad). */
export function HideNav() {
  useEffect(() => {
    document.body.dataset.hideNav = '1'
    return () => { delete document.body.dataset.hideNav }
  }, [])
  return null
}
