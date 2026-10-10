import { useCallback, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'
export interface Prefs {
  lang: Lang
  theme: Theme
}
export type T = (s: string, ...args: (string | number)[]) => string

/** Marks a string for translation where it is defined away from its t() call. */
export const N = (s: string) => s

export function makeT(UK: Record<string, string>, lang: Lang): T {
  return (s, ...args) => {
    const src = lang === 'uk' ? (UK[s] ?? s) : s
    return src.replace(/\{(\d+)\}/g, (_, i: string) => String(args[+i]))
  }
}

/** useState persisted as JSON in localStorage; `merge` lets callers sanitise what was loaded. */
export function usePersisted<V>(key: string, init: V, merge?: (loaded: unknown) => V): [V, (v: V | ((p: V) => V)) => void] {
  const [val, setVal] = useState<V>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        return merge ? merge(parsed) : (parsed as V)
      }
    } catch {
      /* ignore corrupt storage */
    }
    return init
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val))
    } catch {
      /* storage full or blocked */
    }
  }, [key, val])
  return [val, setVal]
}

export function usePrefs(key: string): [Prefs, (p: Partial<Prefs>) => void] {
  const def: Prefs = { lang: typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('uk') ? 'uk' : 'en', theme: 'auto' }
  const [prefs, setPrefs] = usePersisted<Prefs>(key + ':prefs', def, (l) => {
    const o = (l ?? {}) as Partial<Prefs>
    return { lang: o.lang === 'uk' || o.lang === 'en' ? o.lang : def.lang, theme: o.theme === 'light' || o.theme === 'dark' ? o.theme : 'auto' }
  })
  useEffect(() => {
    const root = document.documentElement
    if (prefs.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = prefs.theme
    root.lang = prefs.lang
  }, [prefs.theme, prefs.lang])
  const patch = useCallback((p: Partial<Prefs>) => setPrefs((s) => ({ ...s, ...p })), [setPrefs])
  return [prefs, patch]
}

export function Shell(props: { title: string; tagline: string; prefs: Prefs; onPrefs: (p: Partial<Prefs>) => void; t: T; repo: string; note?: string; actions?: ReactNode; children: ReactNode }) {
  const { prefs, onPrefs, t } = props
  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{props.title}</span>
        <span className="hint tagline">{props.tagline}</span>
        <span className="spacer" />
        {props.actions}
        <label className="inline">
          {t('Theme')}{' '}
          <select value={prefs.theme} onChange={(e) => onPrefs({ theme: e.target.value as Theme })}>
            <option value="auto">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
        <label className="inline">
          {t('Language')}{' '}
          <select value={prefs.lang} onChange={(e) => onPrefs({ lang: e.target.value as Lang })}>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </label>
      </header>
      {props.children}
      <p className="hint foot">
        {props.note ? props.note + ' ' : ''}
        {t('Everything stays in your browser.')}{' '}
        <a href={`https://github.com/hermes98761234/${props.repo}`}>{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}

export const SHELL_UK: Record<string, string> = {
  Theme: 'Тема',
  System: 'Системна',
  Light: 'Світла',
  Dark: 'Темна',
  Language: 'Мова',
  'Source on GitHub': 'Код на GitHub',
  'Everything stays in your browser.': 'Усе залишається у вашому браузері.',
}

export function download(filename: string, data: string | Blob, mime = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime + ';charset=utf-8' }) : data
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/** Share-link helpers: state as URL-safe base64 JSON in the hash. */
export function encodeShare(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function decodeShare<V>(s: string): V | null {
  try {
    const b = s.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as V
  } catch {
    return null
  }
}

export function NumField(props: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  const { value, min, max } = props
  const bad = !Number.isFinite(value) || (min !== undefined && value < min) || (max !== undefined && value > max)
  return (
    <div className="field">
      <label>
        {props.label}
        {props.suffix ? ` (${props.suffix})` : ''}
      </label>
      <input type="number" className={bad ? 'bad' : ''} value={Number.isFinite(value) ? value : ''} min={min} max={max} step={props.step ?? 'any'} onChange={(e) => props.onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
    </div>
  )
}
