'use client'

/**
 * <LCDDisplay /> — VT323 monospace text inside a dark "LCD pit" box.
 *
 * Used for the dashboard hero's date strip ("יום שלישי · 12 במאי 2026") and
 * the live clock ("00:00"). Source: teepo-design/mockup_dashboard.html
 * `.lcd-date` and `.lcd-time` rules.
 *
 * Two variants:
 *   - `date` (kind="date") → static text, smaller font, no colon blink.
 *   - `time` (kind="time") → live updating, larger font, blinking ':'.
 *
 * `tick` controls whether the time variant refreshes itself every second.
 * Default true; turn off for static screenshots.
 */
import { useEffect, useState } from 'react'

interface Props {
  kind: 'date' | 'time'
  /** Override the rendered text. If omitted, time auto-ticks; date renders today. */
  value?: string
  tick?: boolean
  className?: string
}

const HEBREW_DAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת']
const HEBREW_MONTHS = [
  'בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני',
  'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר',
]

function formatDate(d: Date): string {
  return `${HEBREW_DAYS[d.getDay()]} · ${d.getDate()} ${HEBREW_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export default function LCDDisplay({ kind, value, tick = true, className = '' }: Props) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    // Initialize on client so SSR doesn't fight us on the visible text.
    setNow(new Date())
    if (kind !== 'time' || !tick) return
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [kind, tick])

  if (kind === 'date') {
    const text = value ?? (now ? formatDate(now) : ' ')
    return <span className={`lcd lcd-date ${className}`.trim()}>{text}</span>
  }

  // time
  if (value !== undefined) {
    return <span className={`lcd lcd-time ${className}`.trim()}>{value}</span>
  }
  if (!now) {
    return <span className={`lcd lcd-time ${className}`.trim()}>00<span className="colon">:</span>00</span>
  }
  return (
    <span className={`lcd lcd-time ${className}`.trim()}>
      {pad(now.getHours())}
      <span className="colon">:</span>
      {pad(now.getMinutes())}
    </span>
  )
}
