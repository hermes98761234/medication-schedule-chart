import { useRef, useState } from 'react'
import { Shell, download, makeT, usePersisted, usePrefs } from './shell'
import { UK } from './i18n'
import { DAY_NAMES, buildRows, doseKey, isTime, newMed, periodOf, sanitizeMeds, toCsv, validateMed, weekDates, weekStart, weekStats, type FoodRule, type Med, type Period } from './lib/meds'

const REPO = 'medication-schedule-chart'
const uid = () => Math.random().toString(36).slice(2, 9)

const EXAMPLE: Med[] = [
  { id: 'ex1', name: 'Metformin', dose: '500 mg', times: ['08:00', '20:00'], days: [true, true, true, true, true, true, true], food: 'with', notes: '' },
  { id: 'ex2', name: 'Vitamin D', dose: '1000 IU', times: ['08:00'], days: [true, true, true, true, true, true, true], food: 'with', notes: 'With the fattiest meal' },
  { id: 'ex3', name: 'Amoxicillin', dose: '250 mg', times: ['07:00', '15:00', '23:00'], days: [true, true, true, true, true, false, false], food: 'any', notes: '5-day course' },
  { id: 'ex4', name: 'Levothyroxine', dose: '50 mcg', times: ['06:30'], days: [true, true, true, true, true, true, true], food: 'before', notes: '30 min before breakfast' },
]
const FOOD_LABEL: Record<FoodRule, string> = { any: 'Any time', with: 'With food', before: 'Before food', after: 'After food' }
const FOOD_SHORT: Record<FoodRule, string> = { any: '', with: 'Take with food', before: 'Take before food', after: 'Take after food' }
const PERIOD_LABEL: Record<Period, string> = { morning: 'Morning', noon: 'Midday', evening: 'Evening', night: 'Night' }

interface Data {
  meds: Med[]
  taken: Record<string, boolean>
  patient: string
}
const DEF: Data = { meds: EXAMPLE, taken: {}, patient: '' }

export default function App() {
  const [prefs, setPrefs] = usePrefs(REPO)
  const [data, setData] = usePersisted<Data>(REPO + ':data', DEF, (l) => {
    const o = (l ?? {}) as Partial<Data>
    return { meds: sanitizeMeds(o.meds), taken: o.taken && typeof o.taken === 'object' ? o.taken : {}, patient: typeof o.patient === 'string' ? o.patient : '' }
  })
  const [week, setWeek] = useState(() => weekStart(new Date()))
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const t = makeT(UK, prefs.lang)
  const { meds, taken } = data
  const rows = buildRows(meds)
  const dates = weekDates(week)
  const stats = weekStats(rows, week, taken)
  const [todayIso] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  const setMeds = (fn: (m: Med[]) => Med[]) => setData((d) => ({ ...d, meds: fn(d.meds) }))
  const patchMed = (id: string, p: Partial<Med>) => setMeds((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)))
  const toggle = (key: string) =>
    setData((d) => {
      const taken = { ...d.taken }
      if (taken[key]) delete taken[key]
      else taken[key] = true
      return { ...d, taken }
    })
  const clearWeek = () =>
    setData((d) => {
      const taken = { ...d.taken }
      for (const k of Object.keys(taken)) if (dates.includes(k.split('|')[0])) delete taken[k]
      return { ...d, taken }
    })

  const importJson = async (f: File | undefined) => {
    if (!f) return
    try {
      const o = JSON.parse(await f.text()) as Partial<Data>
      const m = sanitizeMeds(Array.isArray(o) ? o : o.meds)
      if (!m.length) throw new Error('empty')
      setData((d) => ({ ...d, meds: m, taken: Array.isArray(o) ? d.taken : (o.taken ?? d.taken), patient: Array.isArray(o) ? d.patient : (o.patient ?? d.patient) }))
      setMsg('')
    } catch {
      setMsg(t('Not a valid medicines file.'))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const dateLabel = (s: string) => new Date(s + 'T00:00').toLocaleDateString(prefs.lang === 'uk' ? 'uk-UA' : 'en-GB', { day: 'numeric', month: 'short' })

  return (
    <Shell title={t('Medication Schedule Chart')} tagline={t('Add medicines once, tick doses through the week, print the chart.')} prefs={prefs} onPrefs={setPrefs} t={t} repo={REPO} note={t('Saved only in this browser. This chart is a memory aid, not medical advice. Follow your doctor and the leaflet.')}>
      <div className="body">
        <aside className="side no-print">
          <div className="panel">
            <div className="section">
              <h3>{t('Patient')}</h3>
              <div className="field">
                <input type="text" placeholder={t('Name (optional)')} value={data.patient} onChange={(e) => setData((d) => ({ ...d, patient: e.target.value }))} />
              </div>
            </div>
            <div className="section">
              <h3>{t('Medicines')}</h3>
              {meds.length === 0 && <p className="hint">{t('No medicines yet. Add one or load the example.')}</p>}
              {meds.map((m) => {
                const errs = validateMed(m)
                return (
                  <div className="card" key={m.id}>
                    <div className="grid2">
                      <div className="field">
                        <label>{t('Name')}</label>
                        <input type="text" className={errs.includes('name') ? 'bad' : ''} value={m.name} onChange={(e) => patchMed(m.id, { name: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>{t('Dose')}</label>
                        <input type="text" placeholder={t('e.g. 500 mg, 1 tablet')} value={m.dose} onChange={(e) => patchMed(m.id, { dose: e.target.value })} />
                      </div>
                    </div>
                    <div className="field">
                      <label>{t('Times (HH:MM)')}</label>
                      <div className="row" style={{ marginBottom: 0 }}>
                        {m.times.map((tm, i) => (
                          <span key={i} className="row" style={{ marginBottom: 0, gap: 2 }}>
                            <input type="time" className={isTime(tm) ? '' : 'bad'} style={{ width: 110 }} value={tm} onChange={(e) => patchMed(m.id, { times: m.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                            {m.times.length > 1 && (
                              <button className="small" aria-label={t('Remove')} onClick={() => patchMed(m.id, { times: m.times.filter((_, j) => j !== i) })}>
                                x
                              </button>
                            )}
                          </span>
                        ))}
                        <button className="small" onClick={() => patchMed(m.id, { times: [...m.times, '12:00'] })}>
                          + {t('Add time')}
                        </button>
                      </div>
                    </div>
                    <div className="field">
                      <label>{t('Days')}</label>
                      <div className="row" style={{ marginBottom: 0, gap: 8 }}>
                        {DAY_NAMES.map((d, i) => (
                          <label key={d} className="row" style={{ gap: 2, marginBottom: 0 }}>
                            <input type="checkbox" checked={m.days[i]} onChange={(e) => patchMed(m.id, { days: m.days.map((x, j) => (j === i ? e.target.checked : x)) })} />
                            {t(d)}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="grid2">
                      <div className="field">
                        <label>{t('Food')}</label>
                        <select value={m.food} onChange={(e) => patchMed(m.id, { food: e.target.value as FoodRule })}>
                          {(Object.keys(FOOD_LABEL) as FoodRule[]).map((f) => (
                            <option key={f} value={f}>
                              {t(FOOD_LABEL[f])}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>{t('Notes')}</label>
                        <input type="text" value={m.notes} onChange={(e) => patchMed(m.id, { notes: e.target.value })} />
                      </div>
                    </div>
                    {errs.length > 0 && <p className="err-text hint">{t('Needs a name, at least one valid time and one day.')}</p>}
                    <button className="small danger" onClick={() => setMeds((ms) => ms.filter((x) => x.id !== m.id))}>
                      {t('Remove')}
                    </button>
                  </div>
                )
              })}
              <div className="row">
                <button className="primary" onClick={() => setMeds((ms) => [...ms, newMed(uid())])}>
                  + {t('Add medicine')}
                </button>
                <button onClick={() => setMeds(() => EXAMPLE.map((m) => ({ ...m })))}>{t('Load example')}</button>
              </div>
            </div>
            <div className="section">
              <div className="row">
                <button onClick={() => download('medication-chart.json', JSON.stringify({ meds, taken, patient: data.patient }, null, 2), 'application/json')}>{t('Export JSON')}</button>
                <button onClick={() => fileRef.current?.click()}>{t('Import JSON')}</button>
                <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importJson(e.target.files?.[0])} />
              </div>
              {msg && <p className="err-text">{msg}</p>}
            </div>
          </div>
        </aside>
        <main className="main">
          <section className="box chart">
            <div className="row no-print">
              <button onClick={() => setWeek((w) => shift(w, -7))} aria-label={t('Previous week')}>
                &lt;
              </button>
              <button onClick={() => setWeek(weekStart(new Date()))}>{t('This week')}</button>
              <button onClick={() => setWeek((w) => shift(w, 7))} aria-label={t('Next week')}>
                &gt;
              </button>
              <span className="spacer" />
              <button onClick={() => download(`medication-${week}.csv`, toCsv(rows, week, taken), 'text/csv')}>{t('Export CSV')}</button>
              <button onClick={clearWeek}>{t('Clear ticks this week')}</button>
              <button className="primary" onClick={() => window.print()}>
                {t('Print')}
              </button>
            </div>
            <div className="print-title">
              <h2 style={{ margin: '0 0 2px' }}>{t('Medication chart')}{data.patient ? `: ${data.patient}` : ''}</h2>
              <div className="hint">
                {t('Week of {0}', dateLabel(dates[0]))} - {dateLabel(dates[6])} {dates[6].slice(0, 4)}
                {' · '}
                {t('Taken: {0} of {1} ({2}%)', stats.taken, stats.due, stats.pct)}
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="hint">{t('No medicines yet. Add one or load the example.')}</p>
            ) : (
              <div className="table-wrap">
                <table className="data grid-chart">
                  <thead>
                    <tr>
                      <th>{t('Time')}</th>
                      <th>{t('Medicine')}</th>
                      {dates.map((d, i) => (
                        <th key={d} className={'daycol' + (d === todayIso ? ' today' : '')}>
                          {t(DAY_NAMES[i])}
                          <div className="hint">{dateLabel(d)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, ri) => {
                      const p = periodOf(r.time)
                      const head = ri === 0 || periodOf(rows[ri - 1].time) !== p
                      return [
                        head && (
                          <tr key={'h' + p + r.med.id + r.time} className="period">
                            <td colSpan={9}>{t(PERIOD_LABEL[p])}</td>
                          </tr>
                        ),
                        <tr key={r.med.id + r.time}>
                          <td>
                            <strong>{r.time}</strong>
                          </td>
                          <td>
                            <strong>{r.med.name}</strong> {r.med.dose}
                            {r.med.food !== 'any' && <div className="hint">{t(FOOD_SHORT[r.med.food])}</div>}
                            {r.med.notes && <div className="hint">{r.med.notes}</div>}
                          </td>
                          {dates.map((d, i) => (
                            <td key={d} className={'cell' + (d === todayIso ? ' today' : '')}>
                              {r.med.days[i] ? (
                                <input type="checkbox" aria-label={`${r.med.name} ${r.time} ${d}`} checked={!!taken[doseKey(d, r.med.id, r.time)]} onChange={() => toggle(doseKey(d, r.med.id, r.time))} />
                              ) : (
                                <span className="hint">-</span>
                              )}
                            </td>
                          ))}
                        </tr>,
                      ]
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hint no-print">{t('Taken: {0} of {1} ({2}%)', stats.taken, stats.due, stats.pct)}</p>
          </section>
        </main>
      </div>
    </Shell>
  )
}

function shift(w: string, n: number): string {
  const d = new Date(w + 'T00:00')
  d.setDate(d.getDate() + n)
  return weekStart(d)
}
