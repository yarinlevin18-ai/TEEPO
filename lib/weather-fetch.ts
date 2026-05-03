/**
 * Weather fetcher.
 *
 * Tries the browser's geolocation, falls back to Tel Aviv coordinates so
 * the app still shows weather for users who deny permission. Calls
 * Open-Meteo's free no-key API and maps the WMO code to TEEPO's
 * `WeatherKey` palette.
 */

import type { WeatherKey } from './living-day'

interface CachedWeather {
  weather: WeatherKey
  temp_c: number
  fetched_at: number
  lat: number
  lon: number
}

const CACHE_KEY = 'teepo_weather_cache_v1'
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const FALLBACK_COORDS = { lat: 32.0853, lon: 34.7818 } // Tel Aviv

// WMO weather code → TEEPO WeatherKey.
// See https://open-meteo.com/en/docs#weathervariables
function mapWmoCode(code: number): WeatherKey {
  if (code === 0) return 'sunny'
  if (code >= 1 && code <= 3) return 'cloudy'
  if (code >= 45 && code <= 48) return 'cloudy'
  if (code >= 51 && code <= 67) return 'rainy'
  if (code >= 71 && code <= 77) return 'snowy'
  if (code >= 80 && code <= 82) return 'rainy'
  if (code >= 85 && code <= 86) return 'snowy'
  if (code >= 95 && code <= 99) return 'stormy'
  return 'cloudy'
}

function readCache(): CachedWeather | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedWeather
    if (Date.now() - parsed.fetched_at > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(value: CachedWeather): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(value))
  } catch {
    // ignore quota errors
  }
}

async function getCoords(): Promise<{ lat: number; lon: number }> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return FALLBACK_COORDS
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(FALLBACK_COORDS), 4000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeout)
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      () => {
        clearTimeout(timeout)
        resolve(FALLBACK_COORDS)
      },
      { enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: 4000 },
    )
  })
}

export async function fetchWeather(): Promise<CachedWeather> {
  const cached = readCache()
  if (cached) return cached

  const { lat, lon } = await getCoords()
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,temperature_2m`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`weather ${res.status}`)
    const data = await res.json()
    const code = Number(data?.current?.weather_code ?? 1)
    const temp = Number(data?.current?.temperature_2m ?? 20)
    const result: CachedWeather = {
      weather: mapWmoCode(code),
      temp_c: Math.round(temp),
      fetched_at: Date.now(),
      lat,
      lon,
    }
    writeCache(result)
    return result
  } catch {
    // Soft fallback: pretend it's sunny if the API is unreachable.
    const result: CachedWeather = {
      weather: 'sunny',
      temp_c: 22,
      fetched_at: Date.now(),
      lat,
      lon,
    }
    writeCache(result)
    return result
  }
}
