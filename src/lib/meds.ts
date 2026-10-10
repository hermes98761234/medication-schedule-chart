export type FoodRule = 'any' | 'with' | 'before' | 'after'

export interface Med {
  id: string
  name: string
  dose: string
  /** Times of day, "HH:MM". */
  times: string[]
  /** Days of week, index 0 = Monday ... 6 = Sunday. */
  days: boolean[]
  food: FoodRule
  notes: string
}

export interface Row {
  med: Med
  time: string
}

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function isTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

export function newMed(id: string): Med {
  return { id, name: '', dose: '', times: ['08:00'], days: [true, true, true, true, true, true, true], food: 'any', notes: '' }
}

export function validateMed(m: Med): string[] {
  const errs: string[] = []
  if (!m.name.trim()) errs.push('name')
  if (m.times.length === 0 || m.times.some((t) => !isTime(t))) errs.push('times')
  if (!m.days.some(Boolean)) errs.push('days')
  return errs
}

/** One row per (medicine, time) pair, sorted by time then name. Invalid meds are skipped. */
export function buildRows(meds: Med[]): Row[] {
  const rows: Row[] = []
  for (const med of meds) {
    if (validateMed(med).length) continue
    for (const time of [...new Set(med.times)]) rows.push({ med, time })
  }
  return rows.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name))
}

export type Period = 'morning' | 'noon' | 'evening' | 'night'
export function periodOf(time: string): Period {
  const h = Number(time.slice(0, 2))
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 17) return 'noon'
  if (h >= 17 && h < 22) return 'evening'
  return 'night'
}

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Monday of the week containing `d` (local time), as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const back = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - back)
  return iso(x)
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s: string, n: number): string {
  const d = parseIso(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export const doseKey = (date: string, medId: string, time: string) => `${date}|${medId}|${time}`

export interface Stats {
  due: number
  taken: number
  pct: number
}

/** Adherence for a week: counts scheduled doses and ticked ones. */
export function weekStats(rows: Row[], start: string, taken: Record<string, boolean>): Stats {
  let due = 0
  let done = 0
  const dates = weekDates(start)
  for (const r of rows) {
    dates.forEach((date, i) => {
      if (!r.med.days[i]) return
      due++
      if (taken[doseKey(date, r.med.id, r.time)]) done++
    })
  }
  return { due, taken: done, pct: due === 0 ? 0 : Math.round((done / due) * 100) }
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

export function toCsv(rows: Row[], start: string, taken: Record<string, boolean>): string {
  const dates = weekDates(start)
  const head = ['Medicine', 'Dose', 'Time', 'Food', 'Notes', ...DAY_NAMES.map((d, i) => `${d} ${dates[i]}`)]
  const lines = [head.map(csvCell).join(',')]
  for (const r of rows) {
    const cells = dates.map((date, i) => (!r.med.days[i] ? '' : taken[doseKey(date, r.med.id, r.time)] ? 'taken' : 'due'))
    lines.push([r.med.name, r.med.dose, r.time, r.med.food, r.med.notes, ...cells].map(csvCell).join(','))
  }
  return lines.join('\n') + '\n'
}

/** Accepts only well-formed medicine lists (used for JSON import). */
export function sanitizeMeds(x: unknown): Med[] {
  if (!Array.isArray(x)) return []
  const out: Med[] = []
  for (const raw of x) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const food: FoodRule = o.food === 'with' || o.food === 'before' || o.food === 'after' ? o.food : 'any'
    const days = Array.isArray(o.days) && o.days.length === 7 ? o.days.map(Boolean) : [true, true, true, true, true, true, true]
    const times = Array.isArray(o.times) ? o.times.filter((t): t is string => typeof t === 'string') : []
    out.push({ id: String(o.id ?? Math.random().toString(36).slice(2, 9)), name: String(o.name ?? ''), dose: String(o.dose ?? ''), times, days, food, notes: String(o.notes ?? '') })
  }
  return out
}
