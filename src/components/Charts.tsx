import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, ComposedChart } from 'recharts'
import { fmtDec, fmtInt } from '../lib/format'
import { formatDayMonth, formatShort } from '../lib/dates'

type ColorKey = 'kcal' | 'protein' | 'train' | 'weight' | 'muted' | 'line' | 'ink' | 'card'

/** Läser temafärgerna från CSS-variablerna och uppdateras när ljust/mörkt läge byts. */
function useColors(): Record<ColorKey, string> {
  const read = () => {
    const cs = getComputedStyle(document.documentElement)
    const g = (k: string) => cs.getPropertyValue(`--${k}`).trim() || '#888'
    return { kcal: g('kcal'), protein: g('protein'), train: g('train'), weight: g('weight'), muted: g('muted'), line: g('line'), ink: g('ink'), card: g('card') }
  }
  const [c, setC] = useState(read)
  useEffect(() => {
    const mo = new MutationObserver(() => setC(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  return c
}

const tooltipStyle = (c: Record<ColorKey, string>) => ({
  contentStyle: { background: c.card, border: `1px solid ${c.line}`, borderRadius: 12, color: c.ink, fontSize: 14 },
  labelStyle: { color: c.muted, fontWeight: 600 },
  itemStyle: { color: c.ink },
})

export interface DailyPoint { date: string; value: number | null; goal?: number }

/** Stapeldiagram per dag. Dagar utan data visas som tomma (inte som noll). */
export function DailyBarChart({ data, color, unit, title, goal }: { data: DailyPoint[]; color: 'kcal' | 'protein' | 'train'; unit: string; title: string; goal?: number }) {
  const c = useColors()
  const many = data.length > 14
  return (
    <figure aria-label={title}>
      <div className="h-48 -ml-2" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={many ? 2 : 6}>
            <CartesianGrid vertical={false} stroke={c.line} strokeDasharray="0" />
            <XAxis dataKey="date" tickFormatter={formatDayMonth} tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} interval={many ? 'preserveStartEnd' : 0} minTickGap={8} />
            <YAxis tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => fmtInt(v)} />
            <Tooltip cursor={{ fill: c.line, opacity: 0.4 }} {...tooltipStyle(c)} labelFormatter={(l) => formatShort(String(l))}
              formatter={(v) => (v === null || v === undefined ? ['Ingen data', title] : [`${fmtInt(Number(v))} ${unit}`, title])} />
            {goal ? <ReferenceLine y={goal} stroke={c.muted} strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `Mål ${fmtInt(goal)}`, position: 'insideTopRight', fill: c.muted, fontSize: 12 }} /> : null}
            <Bar dataKey="value" fill={c[color]} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable rows={data.map((d) => [formatShort(d.date), d.value === null ? 'Ingen data' : `${fmtInt(d.value)} ${unit}`])} caption={title} />
    </figure>
  )
}

export interface WeightPointView { date: string; weight: number; avg7: number }

export function WeightChart({ data, goal }: { data: WeightPointView[]; goal?: number }) {
  const c = useColors()
  if (data.length === 0) return null
  const vals = data.flatMap((d) => [d.weight, d.avg7])
  let min = Math.min(...vals), max = Math.max(...vals)
  if (goal && goal >= min - 3) min = Math.min(min, goal)
  min = Math.floor(min - 0.5); max = Math.ceil(max + 0.5)
  const stepKg = Math.max(1, Math.ceil((max - min) / 5))
  max = min + Math.ceil((max - min) / stepKg) * stepKg
  const ticks = Array.from({ length: (max - min) / stepKg + 1 }, (_, i) => min + i * stepKg)
  return (
    <figure aria-label="Viktutveckling">
      <div className="h-56 -ml-2" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.line} />
            <XAxis dataKey="date" tickFormatter={formatDayMonth} tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis domain={[min, max]} ticks={ticks} tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => fmtDec(v)} />
            <Tooltip {...tooltipStyle(c)} labelFormatter={(l) => formatShort(String(l))}
              formatter={(v, name) => [`${fmtDec(Number(v))} kg`, name === 'avg7' ? '7-dagarssnitt' : 'Vägning']} />
            {goal && goal >= min ? <ReferenceLine y={goal} stroke={c.muted} strokeDasharray="5 4" label={{ value: `Mål ${fmtDec(goal)}`, position: 'insideBottomRight', fill: c.muted, fontSize: 12 }} /> : null}
            <Scatter dataKey="weight" fill={c.weight} fillOpacity={0.45} isAnimationActive={false} />
            <Line type="monotone" dataKey="avg7" stroke={c.weight} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 text-sm text-muted mt-1" aria-hidden="true">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-weight opacity-50" />Vägning</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-weight" />Rullande 7-dagarssnitt</span>
      </div>
      <DataTable rows={[...data].reverse().map((d) => [formatShort(d.date), `${fmtDec(d.weight)} kg`, `${fmtDec(d.avg7)} kg`])} caption="Vikt" headers={['Datum', 'Vägning', '7-dagarssnitt']} />
    </figure>
  )
}

export function ActivityBars({ data }: { data: Array<{ label: string; minutes: number; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.minutes))
  return (
    <ul className="grid gap-2">
      {data.map((d) => (
        <li key={d.label}>
          <div className="flex justify-between text-[15px] mb-1"><span>{d.label}</span><span className="tabular text-muted">{d.count} pass · {d.minutes} min</span></div>
          <div className="h-2.5 rounded-full bg-train-soft overflow-hidden" aria-hidden="true"><div className="h-full rounded-full bg-train" style={{ width: `${(d.minutes / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

export function MiniLine({ data, color }: { data: Array<{ x: string; y: number }>; color: 'weight' }) {
  const c = useColors()
  return (
    <div className="h-12 w-28" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}><Line dataKey="y" stroke={c[color]} strokeWidth={2} dot={false} isAnimationActive={false} /><YAxis hide domain={['dataMin - 0.5', 'dataMax + 0.5']} /></LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function DataTable({ rows, caption, headers = ['Datum', 'Värde'] }: { rows: string[][]; caption: string; headers?: string[] }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-sm text-brand font-semibold min-h-11 flex items-center">Visa som tabell</summary>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-sm tabular">
          <caption className="sr-only">{caption}</caption>
          <thead><tr>{headers.map((h) => <th key={h} scope="col" className="text-left text-muted font-semibold py-1">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r[0]} className="border-t border-line">{r.map((x, i) => <td key={i} className="py-1">{x}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  )
}
