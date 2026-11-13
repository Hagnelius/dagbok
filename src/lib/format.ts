const intFmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 })
const dec1Fmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 })
const dec1Fixed = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** 1650 -> "1 650" */
export const fmtInt = (n: number) => intFmt.format(Math.round(n))
/** 1,25 -> "1,3" */
export const fmtDec = (n: number) => dec1Fmt.format(n)
export const fmtKg = (n: number) => `${dec1Fixed.format(n)} kg`
export const fmtSigned = (n: number, digits = 1) => {
  const s = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(n))
  return (n > 0 ? '+' : n < 0 ? '−' : '±') + s
}

/** Tolkar svensk decimalinmatning: "1,5" och "1.5" -> 1.5. Tomt -> undefined. */
export function parseNum(v: string | number | undefined | null): number | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const t = v.replace(/\s/g, '').replace(',', '.')
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

export const round1 = (n: number) => Math.round(n * 10) / 10
