/**
 * Quiet Atmosphere — pure functions and data tables that drive the
 * living-day system. The provider in `lib/living-day-context.tsx`
 * consumes this; CSS reads its output via custom properties.
 *
 * Source of truth: `time-phases.json` from the design spec, plus the
 * celestial arc math from `animated-reference.html`. Keep numbers in
 * sync with that spec — visual tuning happens at the provider/CSS
 * layer, not here.
 */

export type Rgb = readonly [number, number, number]

export type WeatherKey =
  | 'sunny'
  | 'cloudy'
  | 'rainy'
  | 'stormy'
  | 'snowy'
  | 'windy'
  | 'hamsin'

export interface PhaseAnchor {
  /** Minute of day, 0-1439. */
  t: number
  /** Hebrew phase name, used in the time rail label. */
  name: string
  bg1: Rgb
  bg2: Rgb
  glow1: Rgb
  glow2: Rgb
  /** Hex accent — interpolated separately as a hex string. */
  accent: string
  wisdom: string
}

export interface WeatherMod {
  /** RGB-channel multipliers applied to glow1. */
  glow1: Rgb
  /** RGB-channel multipliers applied to glow2. */
  glow2: Rgb
  /** RGB-channel multipliers applied to bg1/bg2. */
  bg: Rgb
  /** Overall intensity multiplier on top of the channel multipliers. */
  mul: number
  /** 0..1 desaturation strength. */
  desat: number
  /** Hebrew mood tag for the wisdom-line tail. */
  mood: string
}

// ─── Phase anchors (0..1439 minutes) ───────────────────────────
export const PHASES: readonly PhaseAnchor[] = [
  { t: 0,    name: 'לילה',         bg1: [6,12,24],   bg2: [10,18,32],   glow1: [40,150,135], glow2: [20,55,100], accent: '#1eb084', wisdom: 'הלילה ארוך.' },
  { t: 240,  name: 'אחרי חצות',  bg1: [8,14,26],   bg2: [12,20,34],   glow1: [55,160,145], glow2: [25,65,105], accent: '#2bb89a', wisdom: 'אחרי חצות. תשמור על עצמך.' },
  { t: 300,  name: 'בוקר מוקדם', bg1: [14,22,38],  bg2: [35,32,42],   glow1: [180,110,90], glow2: [55,100,135],accent: '#3a9c8a', wisdom: 'הולך לזרוח.' },
  { t: 360,  name: 'שחר',         bg1: [22,38,60],  bg2: [110,85,80],  glow1: [255,150,100],glow2: [100,160,180],accent: '#5dc4a8', wisdom: 'בוקר טוב.' },
  { t: 420,  name: 'זריחה',       bg1: [20,52,78],  bg2: [120,130,135],glow1: [255,180,110],glow2: [140,200,225],accent: '#20dca0', wisdom: 'הראש פנוי.' },
  { t: 540,  name: 'בוקר',        bg1: [14,58,88],  bg2: [60,115,135], glow1: [255,210,140],glow2: [160,220,245],accent: '#20dca0', wisdom: 'הראש צלול.' },
  { t: 720,  name: 'צהריים',     bg1: [12,68,100], bg2: [40,115,140], glow1: [255,225,160],glow2: [150,220,250],accent: '#20dca0', wisdom: 'אמצע היום.' },
  { t: 840,  name: 'אחר הצהריים',bg1: [16,60,92],  bg2: [55,108,128], glow1: [245,200,130],glow2: [130,205,225],accent: '#2ed8a8', wisdom: 'הסוללה יורדת.' },
  { t: 960,  name: 'מאוחר',      bg1: [24,55,82],  bg2: [100,108,118],glow1: [245,170,100],glow2: [140,190,210],accent: '#2ed8a8', wisdom: 'עוד תרגיל.' },
  { t: 1020, name: 'לפני שקיעה', bg1: [30,48,72],  bg2: [160,95,80],  glow1: [255,140,80], glow2: [120,150,170],accent: '#a8c878', wisdom: 'השמש יורדת.' },
  { t: 1080, name: 'שקיעה',     bg1: [26,38,62],  bg2: [170,75,55],  glow1: [255,110,65], glow2: [110,125,150],accent: '#d8b078', wisdom: 'הזהב נעלם.' },
  { t: 1140, name: 'דמדומים',   bg1: [18,30,54],  bg2: [60,55,70],   glow1: [155,95,80],  glow2: [55,100,140], accent: '#5dc4a8', wisdom: 'החדר משתנה.' },
  { t: 1200, name: 'תחילת ערב', bg1: [12,22,42],  bg2: [24,30,48],   glow1: [70,135,125], glow2: [35,75,120],  accent: '#20dca0', wisdom: 'הערב מתחיל.' },
  { t: 1320, name: 'ערב',        bg1: [10,18,36],  bg2: [16,24,40],   glow1: [40,145,130], glow2: [25,65,110],  accent: '#20dca0', wisdom: 'הערב שקט.' },
  { t: 1380, name: 'לילה',       bg1: [8,16,30],   bg2: [13,22,40],   glow1: [32,160,140], glow2: [20,60,110],  accent: '#20dca0', wisdom: 'השעה לעבודה רגועה.' },
  { t: 1439, name: 'לילה',       bg1: [6,12,24],   bg2: [10,18,32],   glow1: [40,150,135], glow2: [20,55,100],  accent: '#1eb084', wisdom: 'אחרי חצות.' },
] as const

export const WEATHER: Readonly<Record<WeatherKey, WeatherMod>> = {
  sunny:  { glow1: [1.15,1.05,0.85], glow2: [1.1,1.0,0.9],  bg: [1.0,1.0,1.0],   mul: 1.05, desat: 0,    mood: 'יום שמשי בחוץ.' },
  cloudy: { glow1: [0.9,0.95,1.0],   glow2: [0.9,0.95,1.0], bg: [0.95,0.97,1.0], mul: 0.85, desat: 0.4,  mood: 'אפור בחוץ.' },
  rainy:  { glow1: [0.65,0.85,1.15], glow2: [0.6,0.85,1.15],bg: [0.85,0.95,1.05],mul: 0.75, desat: 0.3,  mood: 'יורד גשם.' },
  stormy: { glow1: [0.5,0.7,1.0],    glow2: [0.55,0.7,1.0], bg: [0.7,0.8,0.95],  mul: 0.55, desat: 0.5,  mood: 'סערה.' },
  snowy:  { glow1: [1.0,1.05,1.15],  glow2: [1.0,1.05,1.15],bg: [1.1,1.1,1.2],   mul: 1.15, desat: 0.5,  mood: 'שלג נופל.' },
  windy:  { glow1: [1.05,1.0,0.95],  glow2: [1.0,1.0,0.95], bg: [1.0,1.0,0.98],  mul: 0.95, desat: 0.2,  mood: 'רוח חזקה.' },
  hamsin: { glow1: [1.45,1.0,0.55],  glow2: [1.3,1.0,0.7],  bg: [1.15,1.0,0.85], mul: 1.05, desat: 0.3,  mood: 'חמסין כבד.' },
}

// ─── Math helpers ──────────────────────────────────────────────
const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  clamp255(lerp(a[0], b[0], t)),
  clamp255(lerp(a[1], b[1], t)),
  clamp255(lerp(a[2], b[2], t)),
]

const parseHex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]

const toHex = (rgb: Rgb): string =>
  '#' + rgb.map(v => clamp255(v).toString(16).padStart(2, '0')).join('')

const lerpHex = (h1: string, h2: string, t: number): string =>
  toHex(lerpRgb(parseHex(h1), parseHex(h2), t))

/** Smoothstep — softens linear interpolation between phase anchors. */
const smooth = (t: number) => t * t * (3 - 2 * t)

// ─── Phase interpolation ───────────────────────────────────────
export interface PhaseSnapshot {
  bg1: Rgb
  bg2: Rgb
  glow1: Rgb
  glow2: Rgb
  accent: string
  name: string
  wisdom: string
}

/**
 * Returns the interpolated phase at the given minute-of-day.
 * Uses smoothstep for non-linear easing between adjacent anchors.
 */
export function getPhase(min: number): PhaseSnapshot {
  const m = ((min % 1440) + 1440) % 1440
  for (let i = 0; i < PHASES.length - 1; i++) {
    const a = PHASES[i]
    const b = PHASES[i + 1]
    if (m >= a.t && m <= b.t) {
      const span = b.t - a.t || 1
      const t = smooth((m - a.t) / span)
      return {
        bg1: lerpRgb(a.bg1, b.bg1, t),
        bg2: lerpRgb(a.bg2, b.bg2, t),
        glow1: lerpRgb(a.glow1, b.glow1, t),
        glow2: lerpRgb(a.glow2, b.glow2, t),
        accent: lerpHex(a.accent, b.accent, t),
        name: t < 0.5 ? a.name : b.name,
        wisdom: t < 0.5 ? a.wisdom : b.wisdom,
      }
    }
  }
  const last = PHASES[PHASES.length - 1]
  return {
    bg1: last.bg1,
    bg2: last.bg2,
    glow1: last.glow1,
    glow2: last.glow2,
    accent: last.accent,
    name: last.name,
    wisdom: last.wisdom,
  }
}

// ─── Weather application ───────────────────────────────────────
/**
 * Applies a weather modifier to an RGB triplet on a specific channel.
 * Channels are 'bg' (used for bg1/bg2), 'glow1', or 'glow2'. Desaturates
 * by mixing each channel toward the overall mean.
 */
export function applyWeather(rgb: Rgb, mod: WeatherMod, channel: 'bg' | 'glow1' | 'glow2'): Rgb {
  const m = channel === 'bg' ? mod.bg : channel === 'glow1' ? mod.glow1 : mod.glow2
  let r = rgb[0] * m[0] * mod.mul
  let g = rgb[1] * m[1] * mod.mul
  let b = rgb[2] * m[2] * mod.mul
  if (mod.desat > 0) {
    const avg = (r + g + b) / 3
    r += (avg - r) * mod.desat
    g += (avg - g) * mod.desat
    b += (avg - b) * mod.desat
  }
  return [clamp255(r), clamp255(g), clamp255(b)]
}

/** Apply weather to the accent hex (treats as a glow1-channel color). */
export function applyWeatherHex(hex: string, mod: WeatherMod): string {
  return toHex(applyWeather(parseHex(hex), mod, 'glow1'))
}

// ─── Celestial body — sun and moon arc ─────────────────────────
export interface CelestialState {
  type: 'sun' | 'moon'
  /** 0..100 (% from left). */
  xPct: number
  /** 0..100 (% from top). */
  yPct: number
  /** 0..1 fade at the very edges of the visibility window. */
  opacity: number
}

const SUN_START = 300   // 05:00
const SUN_END = 1140    // 19:00
const MOON_START = 1170 // 19:30
const MOON_TOTAL = 540  // 09:00 worth of arc, wraps past midnight

/**
 * Returns the active celestial body and its arc position. The sun rises
 * in the east (right side, RTL) and sets in the west; moon mirrors the
 * arc with a slightly lower peak. Both fade in/out at the window edges.
 */
export function celestialState(min: number): CelestialState {
  const m = ((min % 1440) + 1440) % 1440
  if (m >= SUN_START && m <= SUN_END) {
    const p = (m - SUN_START) / (SUN_END - SUN_START)
    const xPct = 88 - p * 76
    const yPct = 78 - Math.sin(p * Math.PI) * 60
    let opacity = 1
    if (p < 0.06) opacity = p / 0.06
    else if (p > 0.94) opacity = (1 - p) / 0.06
    return { type: 'sun', xPct, yPct, opacity }
  }
  // Moon — wraps past midnight.
  const elapsed = m >= MOON_START ? m - MOON_START : m + (1440 - MOON_START)
  const p = Math.max(0, Math.min(1, elapsed / MOON_TOTAL))
  const xPct = 88 - p * 76
  const yPct = 75 - Math.sin(p * Math.PI) * 55
  let opacity = 0.95
  if (p < 0.06) opacity = (p / 0.06) * 0.95
  else if (p > 0.94) opacity = ((1 - p) / 0.06) * 0.95
  return { type: 'moon', xPct, yPct, opacity }
}

// ─── Convenience — full snapshot with weather applied ──────────
export interface AtmosphereSnapshot {
  minute: number
  weather: WeatherKey
  phase: PhaseSnapshot
  /** Phase colors after weather modifiers are applied. */
  bg1: Rgb
  bg2: Rgb
  glow1: Rgb
  glow2: Rgb
  accent: string
  celestial: CelestialState
  weatherMood: string
}

export function getAtmosphere(minute: number, weather: WeatherKey): AtmosphereSnapshot {
  const phase = getPhase(minute)
  const mod = WEATHER[weather]
  return {
    minute,
    weather,
    phase,
    bg1: applyWeather(phase.bg1, mod, 'bg'),
    bg2: applyWeather(phase.bg2, mod, 'bg'),
    glow1: applyWeather(phase.glow1, mod, 'glow1'),
    glow2: applyWeather(phase.glow2, mod, 'glow2'),
    accent: applyWeatherHex(phase.accent, mod),
    celestial: celestialState(minute),
    weatherMood: mod.mood,
  }
}
