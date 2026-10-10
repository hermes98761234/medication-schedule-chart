import { describe, expect, it } from 'vitest'
import { addDays, buildRows, doseKey, isTime, newMed, periodOf, sanitizeMeds, toCsv, validateMed, weekDates, weekStart, weekStats } from './meds'

const med = (over = {}) => ({ ...newMed('a'), name: 'Aspirin', dose: '100 mg', ...over })

describe('dates', () => {
  it('finds the Monday of a week', () => {
    expect(weekStart(new Date(2026, 9, 10))).toBe('2026-10-05') // Saturday
    expect(weekStart(new Date(2026, 9, 5))).toBe('2026-10-05') // Monday
    expect(weekStart(new Date(2026, 9, 11))).toBe('2026-10-05') // Sunday
  })
  it('adds days across months and years', () => {
    expect(addDays('2026-10-28', 7)).toBe('2026-11-04')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(weekDates('2026-12-28')[6]).toBe('2027-01-03')
  })
})

describe('validation', () => {
  it('checks times and fields', () => {
    expect(isTime('08:30')).toBe(true)
    expect(isTime('24:00')).toBe(false)
    expect(isTime('8:30')).toBe(false)
    expect(validateMed(med())).toEqual([])
    expect(validateMed(med({ name: ' ' }))).toContain('name')
    expect(validateMed(med({ times: [] }))).toContain('times')
    expect(validateMed(med({ days: new Array(7).fill(false) }))).toContain('days')
  })
})

describe('rows and periods', () => {
  it('sorts by time and skips invalid', () => {
    const rows = buildRows([med({ id: '1', times: ['20:00', '08:00'] }), med({ id: '2', name: 'Zinc', times: ['08:00'] }), med({ id: '3', name: '' })])
    expect(rows.map((r) => r.med.id + r.time)).toEqual(['108:00', '208:00', '120:00'])
  })
  it('dedupes times', () => {
    expect(buildRows([med({ times: ['08:00', '08:00'] })]).length).toBe(1)
  })
  it('periods', () => {
    expect(periodOf('08:00')).toBe('morning')
    expect(periodOf('13:00')).toBe('noon')
    expect(periodOf('18:30')).toBe('evening')
    expect(periodOf('23:00')).toBe('night')
    expect(periodOf('03:00')).toBe('night')
  })
})

describe('stats and csv', () => {
  const rows = buildRows([med({ days: [true, true, true, true, true, false, false] })])
  it('counts due and taken', () => {
    const taken = { [doseKey('2026-10-05', 'a', '08:00')]: true, [doseKey('2026-10-06', 'a', '08:00')]: true }
    expect(weekStats(rows, '2026-10-05', taken)).toEqual({ due: 5, taken: 2, pct: 40 })
    expect(weekStats([], '2026-10-05', {}).pct).toBe(0)
  })
  it('exports csv with escaping', () => {
    const r = buildRows([med({ notes: 'with "water", cold', days: [true, false, false, false, false, false, false] })])
    const csv = toCsv(r, '2026-10-05', { [doseKey('2026-10-05', 'a', '08:00')]: true })
    const lines = csv.trim().split('\n')
    expect(lines[0].startsWith('Medicine,Dose,Time,Food,Notes,Mon 2026-10-05')).toBe(true)
    expect(lines[1]).toBe('Aspirin,100 mg,08:00,any,"with ""water"", cold",taken,,,,,,')
  })
})

describe('import', () => {
  it('sanitizes junk', () => {
    expect(sanitizeMeds('x')).toEqual([])
    const m = sanitizeMeds([{ name: 5, times: ['08:00', 3], days: [1], food: 'bogus' }, null])
    expect(m.length).toBe(1)
    expect(m[0].food).toBe('any')
    expect(m[0].times).toEqual(['08:00'])
    expect(m[0].days.length).toBe(7)
  })
})
