import { describe, expect, it } from 'vitest'
import { addDays, dateRange, endOfMonth, isoWeek, startOfWeek, todayKey, nowTime, formatLong } from './dates'

describe('datum', () => {
  it('svensk tidszon vid midnatt UTC', () => {
    // 23:30 UTC den 13 nov = 00:30 svensk tid den 14 nov (vintertid)
    expect(todayKey(new Date('2026-11-13T23:30:00Z'))).toBe('2026-11-14')
    expect(nowTime(new Date('2026-07-01T22:15:00Z'))).toBe('00:15') // sommartid UTC+2
  })
  it('aritmetik över sommartidsbyte', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(dateRange('2026-10-24', '2026-10-27')).toHaveLength(4)
  })
  it('vecka börjar på måndag', () => {
    expect(startOfWeek('2026-11-13')).toBe('2026-11-09')
    expect(isoWeek('2026-11-13')).toBe(46)
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
  })
  it('svenskt format', () => {
    expect(formatLong('2026-11-13')).toBe('fredag 13 november')
  })
})
