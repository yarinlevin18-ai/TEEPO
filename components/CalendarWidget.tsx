'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, ChevronRight, ChevronLeft, Clock, MapPin, ExternalLink, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import {
  type GoogleCalendarEvent,
  getWeekEvents,
  formatEventTime,
  getEventColor,
} from '@/lib/google-calendar'

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

interface DayEvents {
  date: Date
  events: GoogleCalendarEvent[]
  isToday: boolean
}

export default function CalendarWidget() {
  const { googleToken, clearGoogleToken, refreshGoogleToken } = useAuth()
  const [weekEvents, setWeekEvents] = useState<DayEvents[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay())
  const [weekOffset, setWeekOffset] = useState(0)

  const providerToken = googleToken

  useEffect(() => {
    if (!providerToken) {
      setLoading(false)
      return
    }
    loadEvents()
  }, [providerToken, weekOffset])

  async function loadEvents() {
    setLoading(true)
    setError(null)
    try {
      // Calculate week range with offset
      const now = new Date()
      const dayOfWeek = now.getDay()
      const sunday = new Date(now)
      sunday.setDate(now.getDate() - dayOfWeek + weekOffset * 7)
      sunday.setHours(0, 0, 0, 0)

      const saturday = new Date(sunday)
      saturday.setDate(sunday.getDate() + 6)
      saturday.setHours(23, 59, 59, 999)

      const { fetchCalendarEvents } = await import('@/lib/google-calendar')
      const events = await fetchCalendarEvents(
        providerToken!,
        sunday.toISOString(),
        saturday.toISOString(),
        refreshGoogleToken,
      )

      // Group events by day
      const days: DayEvents[] = []
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      for (let i = 0; i < 7; i++) {
        const date = new Date(sunday)
        date.setDate(sunday.getDate() + i)

        const dayEvents = events.filter(e => {
          const eventDate = new Date(e.start.dateTime || e.start.date || '')
          return eventDate.toDateString() === date.toDateString()
        })

        days.push({
          date,
          events: dayEvents,
          isToday: date.toDateString() === today.toDateString(),
        })
      }

      setWeekEvents(days)
    } catch (e: any) {
      if (e.message === 'TOKEN_EXPIRED') {
        clearGoogleToken()
        setError('TOKEN_EXPIRED')
      } else {
        setError('שגיאה בטעינת הלוח שנה')
      }
    } finally {
      setLoading(false)
    }
  }

  // No Google account connected
  if (!providerToken && !loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass overflow-hidden"
      >
        <div className="flex items-center gap-2 p-5 border-b border-white/5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(66,133,244,0.15)' }}>
            <Calendar size={14} style={{ color: '#4285F4' }} />
          </div>
          <h2 className="font-semibold text-ink">לוח שנה</h2>
        </div>
        <div className="p-8 text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(66,133,244,0.1)' }}>
            <Calendar size={24} style={{ color: '#4285F4' }} />
          </div>
          <p className="text-ink-muted text-sm mb-1">חבר את Google Calendar</p>
          <p className="text-ink-subtle text-xs mb-4">התחבר עם Google כדי לראות את האירועים שלך כאן</p>
          <button
            onClick={async () => {
              await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                  redirectTo: `${window.location.origin}/dashboard`,
                  scopes: 'https://www.googleapis.com/auth/calendar.readonly',
                  queryParams: { access_type: 'offline', prompt: 'consent' },
                },
              })
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'rgba(66,133,244,0.15)', color: '#8ab4f8', border: '1px solid rgba(66,133,244,0.25)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            חבר Google Calendar
          </button>
        </div>
      </motion.div>
    )
  }

  // Token expired
  if (error === 'TOKEN_EXPIRED') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass overflow-hidden"
      >
        <div className="flex items-center gap-2 p-5 border-b border-white/5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(66,133,244,0.15)' }}>
            <Calendar size={14} style={{ color: '#4285F4' }} />
          </div>
          <h2 className="font-semibold text-ink">לוח שנה</h2>
        </div>
        <div className="p-6 text-center">
          <p className="text-ink-muted text-sm mb-3">הגישה ל-Google Calendar פגה</p>
          <button
            onClick={async () => {
              await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                  redirectTo: `${window.location.origin}/dashboard`,
                  scopes: 'https://www.googleapis.com/auth/calendar.readonly',
                  queryParams: { access_type: 'offline', prompt: 'consent' },
                },
              })
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'rgba(66,133,244,0.15)', color: '#8ab4f8', border: '1px solid rgba(66,133,244,0.25)' }}
          >
            <RefreshCw size={14} />
            התחבר מחדש
          </button>
        </div>
      </motion.div>
    )
  }

  const selectedDayData = weekEvents[selectedDay]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(66,133,244,0.15)' }}>
            <Calendar size={14} style={{ color: '#4285F4' }} />
          </div>
          <h2 className="font-semibold text-ink">לוח שנה</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(66,133,244,0.12)', color: '#8ab4f8' }}>
            Google
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-white/5 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => { setWeekOffset(0); setSelectedDay(new Date().getDay()) }}
            className="px-2.5 py-1 rounded-lg text-xs text-accent-400 hover:bg-white/5 transition-colors font-medium"
          >
            היום
          </button>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-white/5 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      {/* Week day selector */}
      <div className="grid grid-cols-7 gap-1 p-3 border-b border-white/5">
        {weekEvents.map((day, i) => (
          <button
            key={i}
            onClick={() => setSelectedDay(i)}
            className={`flex flex-col items-center py-2 px-1 rounded-xl transition-all ${
              selectedDay === i
                ? 'text-white'
                : day.isToday
                  ? 'text-accent-400'
                  : 'text-ink-muted hover:text-ink hover:bg-white/5'
            }`}
            style={selectedDay === i ? {
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
            } : undefined}
          >
            <span className="text-[10px] font-medium mb-1">{DAYS_SHORT[i]}</span>
            <span className="text-sm font-bold">{day.date.getDate()}</span>
            {day.events.length > 0 && selectedDay !== i && (
              <div className="flex gap-0.5 mt-1">
                {day.events.slice(0, 3).map((_, j) => (
                  <div key={j} className="w-1 h-1 rounded-full bg-accent-400" />
                ))}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Selected day events */}
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl shimmer" />
            ))}
          </div>
        ) : selectedDayData && selectedDayData.events.length > 0 ? (
          <div className="p-3 space-y-2">
            {selectedDayData.events.map((event) => {
              const color = getEventColor(event.colorId)
              const time = formatEventTime(event)
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex gap-3 p-3 rounded-xl group hover:scale-[1.01] transition-all cursor-default"
                  style={{ background: color.bg, border: `1px solid ${color.border}` }}
                >
                  {/* Time bar */}
                  <div className="w-1 rounded-full flex-shrink-0" style={{ background: color.text }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{event.summary}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {time && (
                        <span className="flex items-center gap-1 text-xs text-ink-muted">
                          <Clock size={10} />
                          {time}
                        </span>
                      )}
                      {event.location && (
                        <span className="flex items-center gap-1 text-xs text-ink-muted truncate">
                          <MapPin size={10} />
                          {event.location}
                        </span>
                      )}
                    </div>
                  </div>
                  {event.htmlLink && (
                    <a
                      href={event.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-ink-subtle hover:text-accent-400 transition-all"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </motion.div>
              )
            })}
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-ink-muted text-sm">
              {selectedDayData?.isToday ? 'אין אירועים להיום' : `אין אירועים ליום ${DAYS_HE[selectedDay]}`}
            </p>
          </div>
        )}
      </div>

      {/* Month/Year label */}
      {weekEvents.length > 0 && (
        <div className="px-5 py-2 border-t border-white/5 text-center">
          <span className="text-xs text-ink-subtle">
            {weekEvents[0].date.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
          </span>
        </div>
      )}
    </motion.div>
  )
}
