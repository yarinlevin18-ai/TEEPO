'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen, Clock, Calendar, ArrowLeft, ArrowRight,
  ChevronRight, ChevronLeft, MapPin, ExternalLink,
  PenLine, FileText, TrendingUp, RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { api } from '@/lib/api-client'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import ErrorAlert from '@/components/ui/ErrorAlert'
import type { Course, Assignment } from '@/types'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import {
  type GoogleCalendarEvent,
  fetchCalendarEvents,
  formatEventTime,
  getEventColor,
} from '@/lib/google-calendar'

// ── Helpers ──────────────────────────────────────────────────

const DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'בוקר טוב'
  if (h >= 12 && h < 17) return 'צהריים טובים'
  if (h >= 17 && h < 21) return 'ערב טוב'
  return 'לילה טוב'
}

function getCurrentSemester(): string {
  const m = new Date().getMonth() + 1
  if (m >= 10 || m <= 2) return "סמסטר א'"
  if (m >= 3 && m <= 7) return "סמסטר ב'"
  return 'קיץ'
}

/** Try to match a Google Calendar event to a course by fuzzy title matching */
function matchEventToCourse(event: GoogleCalendarEvent, courses: Course[]): Course | null {
  const summary = (event.summary || '').toLowerCase()
  if (!summary) return null
  // Direct match
  for (const c of courses) {
    const title = c.title.toLowerCase()
    if (summary.includes(title) || title.includes(summary)) return c
    // Try matching without common prefixes
    const cleanSummary = summary.replace(/^(הרצאה|תרגול|מעבדה|שיעור|lecture|tutorial|lab)\s*[-:]\s*/i, '')
    const cleanTitle = title.replace(/^(הרצאה|תרגול|מעבדה|שיעור)\s*[-:]\s*/i, '')
    if (cleanSummary && cleanTitle && (cleanSummary.includes(cleanTitle) || cleanTitle.includes(cleanSummary))) return c
    // Word-level match (at least 2 significant words match)
    const sWords = cleanSummary.split(/\s+/).filter(w => w.length > 2)
    const tWords = cleanTitle.split(/\s+/).filter(w => w.length > 2)
    const matches = sWords.filter(w => tWords.some(tw => tw.includes(w) || w.includes(tw)))
    if (matches.length >= 2) return c
  }
  return null
}

// ── Types ────────────────────────────────────────────────────

interface DayData {
  date: Date
  events: GoogleCalendarEvent[]
  isToday: boolean
}

// ── Component ────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, session } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Calendar state
  const [weekDays, setWeekDays] = useState<DayData[]>([])
  const [selectedDay, setSelectedDay] = useState(new Date().getDay())
  const [weekOffset, setWeekOffset] = useState(0)
  const [calLoading, setCalLoading] = useState(true)
  const [calError, setCalError] = useState<string | null>(null)

  const providerToken = session?.provider_token
  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || ''

  // ── Load app data ──────────────────────────────────────────
  useEffect(() => {
    Promise.all([api.courses.list(), api.assignments.list()])
      .then(([c, a]) => { setCourses(c); setAssignments(a) })
      .catch(() => setError('שגיאה בטעינת הנתונים'))
      .finally(() => setLoading(false))
  }, [])

  // ── Load calendar events ───────────────────────────────────
  useEffect(() => {
    if (!providerToken) { setCalLoading(false); return }
    loadCalendar()
  }, [providerToken, weekOffset])

  async function loadCalendar() {
    setCalLoading(true)
    setCalError(null)
    try {
      const now = new Date()
      const sunday = new Date(now)
      sunday.setDate(now.getDate() - now.getDay() + weekOffset * 7)
      sunday.setHours(0, 0, 0, 0)
      const saturday = new Date(sunday)
      saturday.setDate(sunday.getDate() + 6)
      saturday.setHours(23, 59, 59, 999)

      const events = await fetchCalendarEvents(providerToken!, sunday.toISOString(), saturday.toISOString())
      const today = new Date(); today.setHours(0, 0, 0, 0)

      const days: DayData[] = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(sunday); date.setDate(sunday.getDate() + i)
        return {
          date,
          events: events.filter(e => {
            const ed = new Date(e.start.dateTime || e.start.date || '')
            return ed.toDateString() === date.toDateString()
          }),
          isToday: date.toDateString() === today.toDateString(),
        }
      })
      setWeekDays(days)
    } catch (e: any) {
      setCalError(e.message === 'TOKEN_EXPIRED' ? 'TOKEN_EXPIRED' : 'calendar_error')
    } finally {
      setCalLoading(false)
    }
  }

  const todayData = weekDays[selectedDay]
  const activeCourses = courses.filter(c => c.status === 'active')

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6 animate-fade-in">

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo-128.png" alt="SmartDesk" width={38} height={38} />
          <div>
            <h1 className="text-2xl font-extrabold">
              <span className="text-ink">{getGreeting()}, </span>
              <span className="gradient-text">{displayName}</span>
            </h1>
            <p className="text-xs text-ink-muted mt-0.5">{getCurrentSemester()}</p>
          </div>
        </div>
        <span className="text-sm font-bold px-3 py-1.5 rounded-xl"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}>
          MyDesk
        </span>
      </motion.div>

      {/* ── Calendar Strip ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass overflow-hidden"
      >
        {/* Week nav + date */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <Calendar size={16} style={{ color: '#818cf8' }} />
            <span className="text-sm font-semibold text-ink">
              {format(new Date(), 'EEEE, d בMMMM yyyy', { locale: he })}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-white/5 transition-colors">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => { setWeekOffset(0); setSelectedDay(new Date().getDay()) }}
              className="px-2.5 py-1 rounded-lg text-xs text-accent-400 hover:bg-white/5 transition-colors font-medium">
              היום
            </button>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-white/5 transition-colors">
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>

        {/* Day pills */}
        <div className="grid grid-cols-7 gap-1.5 px-4 pb-4">
          {weekDays.map((day, i) => (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              className={`flex flex-col items-center py-2.5 px-1 rounded-xl transition-all ${
                selectedDay === i ? 'text-white shadow-lg' : day.isToday ? 'text-accent-400' : 'text-ink-muted hover:text-ink hover:bg-white/5'
              }`}
              style={selectedDay === i ? {
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
              } : undefined}
            >
              <span className="text-[10px] font-medium">{DAYS_SHORT[i]}</span>
              <span className="text-lg font-bold mt-0.5">{day.date.getDate()}</span>
              {day.events.length > 0 && selectedDay !== i && (
                <div className="flex gap-0.5 mt-1">
                  {day.events.slice(0, 3).map((_, j) => (
                    <div key={j} className="w-1 h-1 rounded-full bg-accent-400" />
                  ))}
                </div>
              )}
            </button>
          ))}
          {weekDays.length === 0 && !calLoading && (
            <div className="col-span-7 text-center py-4">
              {!providerToken ? (
                <button
                  onClick={() => supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: `${window.location.origin}/dashboard`, scopes: 'https://www.googleapis.com/auth/calendar.readonly' },
                  })}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                  style={{ background: 'rgba(66,133,244,0.15)', color: '#8ab4f8', border: '1px solid rgba(66,133,244,0.25)' }}
                >
                  <Calendar size={14} /> חבר Google Calendar
                </button>
              ) : calError === 'TOKEN_EXPIRED' ? (
                <button
                  onClick={() => supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: `${window.location.origin}/dashboard`, scopes: 'https://www.googleapis.com/auth/calendar.readonly' },
                  })}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-accent-400"
                >
                  <RefreshCw size={12} /> התחבר מחדש ל-Google
                </button>
              ) : null}
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Schedule ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)' }}>
            <Clock size={14} style={{ color: '#818cf8' }} />
          </div>
          <h2 className="font-semibold text-ink">מערכת שעות</h2>
          {todayData && todayData.events.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
              {todayData.events.length} אירועים
            </span>
          )}
        </div>
        <ScheduleView
          dayData={todayData}
          calLoading={calLoading}
          courses={courses}
          assignments={assignments}
          providerToken={providerToken}
        />
      </motion.div>

      {/* ── Subjects for selected day ── */}
      {(() => {
        // Filter courses to only those that have a matching event on the selected day
        const dayEvents = todayData?.events || []
        const dayCourses = activeCourses.filter(c =>
          dayEvents.some(e => matchEventToCourse(e, [c]) !== null)
        )
        return (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                  <BookOpen size={14} style={{ color: '#a78bfa' }} />
                </div>
                <h2 className="font-semibold text-ink">מקצועות היום</h2>
                {dayCourses.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#c4b5fd' }}>
                    {dayCourses.length}
                  </span>
                )}
              </div>
              <Link href="/courses">
                <button className="text-xs text-accent-400 hover:text-accent flex items-center gap-1 transition-colors">
                  כל הקורסים <ArrowLeft size={12} />
                </button>
              </Link>
            </div>
            <SubjectsView courses={dayCourses} assignments={assignments} loading={loading} />
          </motion.div>
        )
      })()}
    </div>
  )
}

// ── Schedule Tab ─────────────────────────────────────────────

function ScheduleView({ dayData, calLoading, courses, assignments, providerToken }: {
  dayData?: DayData
  calLoading: boolean
  courses: Course[]
  assignments: Assignment[]
  providerToken?: string | null
}) {
  if (calLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl shimmer" />)}
      </div>
    )
  }

  if (!providerToken) {
    return (
      <div className="glass p-10 text-center">
        <Calendar size={32} className="mx-auto mb-3" style={{ color: '#818cf8' }} />
        <p className="text-ink-muted text-sm mb-1">חבר את Google Calendar כדי לראות את המערכת שלך</p>
        <p className="text-ink-subtle text-xs">התחבר מחדש עם Google כדי לסנכרן את לוח השנה</p>
      </div>
    )
  }

  const events = dayData?.events || []

  // Also show assignments due on this day
  const dayStr = dayData ? format(dayData.date, 'yyyy-MM-dd') : ''
  const dayAssignments = assignments.filter(a => a.deadline && a.deadline.startsWith(dayStr) && a.status !== 'submitted')

  if (events.length === 0 && dayAssignments.length === 0) {
    return (
      <div className="glass p-10 text-center">
        <div className="text-4xl mb-3">🎉</div>
        <p className="text-ink font-semibold">יום פנוי!</p>
        <p className="text-ink-muted text-sm mt-1">אין שיעורים או מטלות היום</p>
      </div>
    )
  }

  // Sort events by time
  const sorted = [...events].sort((a, b) => {
    const ta = new Date(a.start.dateTime || a.start.date || '').getTime()
    const tb = new Date(b.start.dateTime || b.start.date || '').getTime()
    return ta - tb
  })

  return (
    <div className="space-y-3">
      {sorted.map((event, i) => {
        const color = getEventColor(event.colorId)
        const time = formatEventTime(event)
        const endTime = event.end.dateTime
          ? new Date(event.end.dateTime).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
          : ''
        const matchedCourse = matchEventToCourse(event, courses)

        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            {matchedCourse ? (
              <Link href={`/courses/${matchedCourse.id}`}>
                <EventCard event={event} color={color} time={time} endTime={endTime} matchedCourse={matchedCourse} clickable />
              </Link>
            ) : (
              <EventCard event={event} color={color} time={time} endTime={endTime} />
            )}
          </motion.div>
        )
      })}

      {/* Assignments due today */}
      {dayAssignments.map((a, i) => (
        <motion.div
          key={a.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: (sorted.length + i) * 0.05 }}
          className="flex items-center gap-4 p-4 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <div className="w-1 h-12 rounded-full bg-red-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">{a.title}</p>
            <span className="text-xs text-red-400">מטלה להגשה היום</span>
          </div>
          <FileText size={16} className="text-red-400" />
        </motion.div>
      ))}
    </div>
  )
}

function EventCard({ event, color, time, endTime, matchedCourse, clickable }: {
  event: GoogleCalendarEvent
  color: { bg: string; text: string; border: string }
  time: string
  endTime: string
  matchedCourse?: Course
  clickable?: boolean
}) {
  return (
    <div
      className={`flex items-stretch gap-4 p-4 rounded-xl transition-all ${clickable ? 'cursor-pointer hover:scale-[1.01] group' : ''}`}
      style={{ background: color.bg, border: `1px solid ${color.border}` }}
    >
      {/* Color bar */}
      <div className="w-1 rounded-full flex-shrink-0" style={{ background: color.text }} />

      {/* Time */}
      <div className="flex flex-col items-center justify-center min-w-[52px]">
        <span className="text-sm font-bold text-ink">{time}</span>
        {endTime && <span className="text-[10px] text-ink-muted">{endTime}</span>}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold text-ink truncate ${clickable ? 'group-hover:text-accent-400 transition-colors' : ''}`}>
          {event.summary}
        </p>
        <div className="flex items-center gap-3 mt-1">
          {event.location && (
            <span className="flex items-center gap-1 text-xs text-ink-muted truncate">
              <MapPin size={10} /> {event.location}
            </span>
          )}
          {matchedCourse && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
              <PenLine size={9} /> כתוב סיכום
            </span>
          )}
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center">
        {matchedCourse ? (
          <div className="p-2 rounded-lg text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowLeft size={16} />
          </div>
        ) : event.htmlLink ? (
          <a href={event.htmlLink} target="_blank" rel="noopener noreferrer"
            className="p-2 rounded-lg text-ink-subtle hover:text-accent-400 transition-colors"
            onClick={e => e.stopPropagation()}>
            <ExternalLink size={14} />
          </a>
        ) : null}
      </div>
    </div>
  )
}

// ── Subjects Tab ─────────────────────────────────────────────

function SubjectsView({ courses, assignments, loading }: {
  courses: Course[]
  assignments: Assignment[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="grid sm:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-36 rounded-xl shimmer" />)}
      </div>
    )
  }

  if (courses.length === 0) {
    return (
      <div className="glass p-8 text-center">
        <div className="text-3xl mb-2">📖</div>
        <p className="text-ink-muted text-sm">אין מקצועות ביום הזה</p>
        <Link href="/courses">
          <button className="mt-3 text-xs text-accent-400 hover:text-accent transition-colors">ראה את כל הקורסים</button>
        </Link>
      </div>
    )
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {courses.map((course, i) => {
        // Count assignments for this course
        const courseAssignments = assignments.filter(a => a.course_id === course.id)
        const pendingCount = courseAssignments.filter(a => a.status !== 'submitted' && a.status !== 'graded').length

        return (
          <motion.div
            key={course.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Link href={`/courses/${course.id}`}>
              <div className="relative overflow-hidden rounded-xl p-5 group hover:scale-[1.02] transition-all cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {/* Top accent */}
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
                  style={{ background: `linear-gradient(90deg, ${course.progress_percentage >= 70 ? '#10b981' : '#6366f1'}, ${course.progress_percentage >= 70 ? '#34d399' : '#8b5cf6'})` }} />

                {/* Course info */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink text-sm line-clamp-2 group-hover:text-accent-400 transition-colors">
                      {course.title}
                    </p>
                  </div>
                  <ArrowLeft size={16} className="text-ink-subtle group-hover:text-accent-400 transition-colors flex-shrink-0 mt-0.5" />
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 mb-3">
                  {pendingCount > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1"
                      style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <FileText size={10} /> {pendingCount} מטלות
                    </span>
                  )}
                  <span className="text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <PenLine size={10} /> כתוב סיכום
                  </span>
                </div>

                {/* Progress */}
                <div>
                  <div className="flex justify-between text-xs text-ink-muted mb-1.5">
                    <span className="flex items-center gap-1"><TrendingUp size={10} /> התקדמות</span>
                    <span className="font-bold" style={{ color: course.progress_percentage >= 70 ? '#10b981' : '#a5b4fc' }}>
                      {Math.round(course.progress_percentage)}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${course.progress_percentage}%`,
                        background: course.progress_percentage >= 70
                          ? 'linear-gradient(90deg, #10b981, #34d399)'
                          : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                      }}
                    />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}
