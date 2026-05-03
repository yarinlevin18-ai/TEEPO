'use client'

/**
 * LivingDayProvider — keeps the dashboard's atmospheric CSS custom
 * properties (--bg1, --bg2, --glow1, --glow2, --accent, --sun-x, --sun-y,
 * --sun-opacity) in sync with current minute-of-day and weather. CSS
 * reads those vars; React state is reserved for things that affect
 * non-CSS output (the wisdom line, the time-rail label, the active
 * celestial body type).
 *
 * Time tick: 60s in production, but a dev override can set the minute
 * directly via `setMinute` for the time-rail slider in Stage I.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getAtmosphere,
  type AtmosphereSnapshot,
  type WeatherKey,
} from './living-day'
import { fetchWeather } from './weather-fetch'

interface LivingDayContextValue {
  /** Current minute of day (0..1439). */
  minute: number
  /** Current weather. Defaults to 'sunny'. */
  weather: WeatherKey
  /** Full interpolated atmosphere — colors, celestial position, mood. */
  atmosphere: AtmosphereSnapshot
  /** Override the minute manually (used by the dev time-rail). */
  setMinute: (m: number | null) => void
  /** Set weather. */
  setWeather: (w: WeatherKey) => void
  /** True if `setMinute` has overridden the live clock. */
  isMinuteOverridden: boolean
}

const LivingDayContext = createContext<LivingDayContextValue | null>(null)

function nowMinute(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

export function LivingDayProvider({ children }: { children: ReactNode }) {
  const [liveMinute, setLiveMinute] = useState<number>(() => nowMinute())
  const [override, setOverride] = useState<number | null>(null)
  const [weather, setWeather] = useState<WeatherKey>('sunny')

  // Tick once a minute. Aligns to the next minute boundary so updates
  // happen in step with the wall clock rather than drifting.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null
    let interval: ReturnType<typeof setInterval> | null = null
    const align = () => {
      const msToNextMinute = 60_000 - (Date.now() % 60_000)
      timeout = setTimeout(() => {
        setLiveMinute(nowMinute())
        interval = setInterval(() => setLiveMinute(nowMinute()), 60_000)
      }, msToNextMinute)
    }
    align()
    return () => {
      if (timeout) clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [])

  // Auto-fetch real weather on mount + every 30 minutes. Falls back to
  // 'sunny' if geolocation is denied or the API is unreachable.
  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const result = await fetchWeather()
      if (!cancelled) setWeather(result.weather)
    }
    refresh()
    const id = setInterval(refresh, 30 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const minute = override ?? liveMinute

  const atmosphere = useMemo(
    () => getAtmosphere(minute, weather),
    [minute, weather],
  )

  // Write CSS custom properties to <html>. Done in an effect so SSR
  // doesn't try to inject them and cause hydration mismatches.
  const lastWritten = useRef<string>('')
  useEffect(() => {
    const root = document.documentElement
    const { bg1, bg2, glow1, glow2, accent, celestial } = atmosphere
    // Cheap dirty-check — skip writes when nothing changed.
    const sig = [
      bg1.join(','), bg2.join(','),
      glow1.join(','), glow2.join(','),
      accent,
      celestial.xPct.toFixed(2),
      celestial.yPct.toFixed(2),
      celestial.opacity.toFixed(3),
      celestial.type,
    ].join('|')
    if (sig === lastWritten.current) return
    lastWritten.current = sig

    root.style.setProperty('--bg1', `rgb(${bg1.join(',')})`)
    root.style.setProperty('--bg2', `rgb(${bg2.join(',')})`)
    root.style.setProperty('--glow1', glow1.join(','))
    root.style.setProperty('--glow2', glow2.join(','))
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--sun-x', `${celestial.xPct}%`)
    root.style.setProperty('--sun-y', `${celestial.yPct}%`)
    root.style.setProperty('--sun-opacity', String(celestial.opacity))
    root.dataset.celestial = celestial.type
  }, [atmosphere])

  const setMinute = useCallback((m: number | null) => {
    if (m === null) setOverride(null)
    else setOverride(((m % 1440) + 1440) % 1440)
  }, [])

  const value = useMemo<LivingDayContextValue>(
    () => ({
      minute,
      weather,
      atmosphere,
      setMinute,
      setWeather,
      isMinuteOverridden: override !== null,
    }),
    [minute, weather, atmosphere, setMinute, override],
  )

  return (
    <LivingDayContext.Provider value={value}>
      {children}
    </LivingDayContext.Provider>
  )
}

export function useLivingDay(): LivingDayContextValue {
  const ctx = useContext(LivingDayContext)
  if (!ctx) {
    throw new Error('useLivingDay must be used inside <LivingDayProvider>')
  }
  return ctx
}
