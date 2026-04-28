'use client'

/**
 * TimeRailDev — small floating slider for scrubbing through the day
 * to tune the atmosphere at every phase. Visible only in dev (or when
 * ?time=dev is in the URL). Calls setMinute on LivingDayProvider so
 * the entire scene — sky, sun/moon position, accent, wisdom — moves
 * in step with the slider.
 *
 * Hides itself in production unless explicitly invoked.
 */

import { useEffect, useState } from 'react'
import { useLivingDay } from '@/lib/living-day-context'

const PRESETS: Array<{ label: string; minute: number }> = [
  { label: 'שחר',    minute: 360 },   // 06:00
  { label: 'בוקר',  minute: 540 },   // 09:00
  { label: 'צהריים', minute: 720 },   // 12:00
  { label: 'אחה״צ',  minute: 900 },   // 15:00
  { label: 'שקיעה', minute: 1080 },  // 18:00
  { label: 'ערב',   minute: 1260 },  // 21:00
  { label: 'לילה',  minute: 60 },    // 01:00
]

function fmt(m: number): string {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export default function TimeRailDev() {
  const { minute, setMinute, atmosphere, isMinuteOverridden } = useLivingDay()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const isDev = process.env.NODE_ENV !== 'production'
    const hasFlag =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('time')
    setShow(isDev || hasFlag)
  }, [])

  if (!show) return null

  return (
    <div
      className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2 px-3 py-2 rounded-2xl"
      style={{
        background: 'rgba(15,17,23,0.78)',
        backdropFilter: 'blur(14px)',
        border: '0.5px solid rgba(255,255,255,0.10)',
        minWidth: 280,
      }}
      aria-label="Time rail (dev)"
    >
      {/* Header — current phase + time */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-ink-muted font-medium">
          {atmosphere.phase.name}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-ink font-mono tabular-nums" style={{ color: 'var(--accent)' }}>
            {fmt(minute)}
          </span>
          {isMinuteOverridden && (
            <button
              onClick={() => setMinute(null)}
              className="text-[10px] px-1.5 py-0.5 rounded text-ink-subtle hover:text-ink"
              style={{ background: 'rgba(255,255,255,0.06)' }}
              title="Restore live time"
            >
              live
            </button>
          )}
        </div>
      </div>

      {/* Slider — 0..1439 */}
      <input
        type="range"
        min={0}
        max={1439}
        step={5}
        value={minute}
        onChange={(e) => setMinute(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: 'var(--accent)' as string }}
      />

      {/* Phase presets */}
      <div className="flex flex-wrap gap-1">
        {PRESETS.map(({ label, minute: m }) => (
          <button
            key={label}
            onClick={() => setMinute(m)}
            className="px-1.5 py-0.5 rounded-full text-[10px] transition-colors"
            style={{
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.7)',
              border: '0.5px solid rgba(255,255,255,0.08)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
