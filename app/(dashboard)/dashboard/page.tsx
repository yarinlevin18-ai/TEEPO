'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Clock, Calendar, ArrowLeft,
  ChevronRight, ChevronLeft, MapPin, ExternalLink,
  PenLine, FileText, TrendingUp, RefreshCw,
  CheckCircle2, Circle, AlertTriangle, GraduationCap,
  Target, Award, ListTodo, Flame,
  CheckSquare, BarChart3, Sparkles, Wifi, WifiOff,
  Plus, X, Trash2,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { api } from '@/lib/api-client'
import { useAuth } from '@/lib/auth-context'
import { useDB } from '@/lib/db-context'
import { supabase } from '@/lib/supabase'
import ErrorAlert from '@/components/ui/ErrorAlert'
import GlowCard from '@/components/ui/GlowCard'
import AnimatedBorder from '@/components/ui/AnimatedBorder'
import Teepo, { type TeepoState } from '@/components/Teepo'
import type { Course, Assignment, StudyTask, Grade } from '@/types'
import { format, formatDistanceToNow, differenceInDays, differenceInHours } from 'date-fns'
import { he } from 'date-fns/locale'
import {
  type GoogleCalendarEvent,
  fetchCalendarEvents,
  formatEventTime,
  getEventColor,
} from '@/lib/google-calendar'
import { useNotifications } from '@/lib/use-notifications'
import NotificationCenter from '@/components/NotificationCenter'
import SemesterCard from '@/components/SemesterCard'
import { getSemesterStatus } from '@/lib/academic-calendar'

// ── Helpers ──────────────────────────────────────────────────

const DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'בוקר טוב'
  if (h >= 12 && h < 17) return 'צהריים טובים'
  if (h >= 17 && h < 21) return 'ערב טוב'
  return 'לילה טוב'
}

/**
 * TEEPO mood based on time of day + user activity.
 * Priority order: activity > time-of-day.
 */
function getTeepoMood(opts: {
  hour: number
  hasData: boolean
  urgentCount: number
  todayTotal: number
  todayDone: number
}): { state: TeepoState; hint: string } {
  const { hour, hasData, urgentCount, todayTotal, todayDone } = opts

  // Activity-driven states (override time of day)
  if (!hasData) return { state: 'sassy', hint: 'שעמום. תתחיל להוסיף משהו?' }
  if (urgentCount >= 3) return { state: 'alert', hint: 'ערמת דחופים. יאללה.' }
  if (urgentCount >= 1) return { state: 'thinking', hint: 'משהו דחוף בפתח.' }
  if (todayTotal > 0 && todayDone === todayTotal) return { state: 'celebrate', hint: 'סיימת הכל היום. כל הכבוד!' }

  // Time-of-day fallback
  if (hour >= 22 || hour < 5) return { state: 'sleep', hint: 'מאוחר. לכו לישון.' }
  if (hour >= 5 && hour < 12)   return { state: 'idle',     hint: 'יום חדש, בוא נתחיל.' }
  if (hour >= 12 && hour < 17)  return { state: 'happy',    hint: 'צהריים טובים!' }
  return { state: 'thinking', hint: 'ערב טוב. מה על הבוקר מחר?' }
}


function matchEventToCourse(event: GoogleCalendarEvent, courses: Course[]): Course | null {
  const summary = (event.summary || '').toLowerCase()
  if (!summary) return null
  for (const c of courses) {
    const title = c.title.toLowerCase()
    if (summary.includes(title) || title.includes(summary)) return c
    const cleanSummary = summary.replace(/^(הרצאה|תרגול|מעבדה|שיעור|lecture|tutorial|lab)\s*[-:]\s*/i, '')
    const cleanTitle = title.replace(/^(הרצאה|תרגול|מעבדה|שיעור)\s*[-:]\s*/i, '')
    if (cleanSummary && cleanTitle && (cleanSummary.includes(cleanTitle) || cleanTitle.includes(cleanSummary))) return c
    const sWords = cleanSummary.split(/\s+/).filter(w => w.length > 2)
    const tWords = cleanTitle.split(/\s+/).filter(w => w.length > 2)
    const matches = sWords.filter(w => tWords.some(tw => tw.includes(w) || w.includes(tw)))
    if (matches.length >= 2) return c
  }
  return null
}

function getDeadlineColor(deadline: string): { text: string; bg: string; border: string; label: string } {
  const now = new Date()
  const dl = new Date(deadline)
  const hours = differenceInHours(dl, now)
  const days = differenceInDays(dl, now)

  if (hours < 0) return { text: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', label: 'עבר' }
  if (hours < 24) return { text: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', label: `${hours} שעות` }
  if (days <= 3) return { text: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: `${days} ימים` }
  if (days <= 7) return { text: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)', label: `${days} ימים` }
  return { text: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)', label: `${days} ימים` }
}

function getGradeColor(grade: number): string {
  if (grade >= 90) return '#10b981'
  if (grade >= 80) return '#3b82f6'
  if (grade >= 70) return '#f59e0b'
  if (grade >= 60) return '#f97316'
  return '#ef4444'
}

// ── Types ────────────────────────────────────────────────────

interface DayData {
  date: Date
  events: GoogleCalendarEvent[]
  isToday: boolean
}

// ── Component ────────────────────────────────────────────────

interface CreditsInfo {
  completed: number
  required: number
  remaining: number
  remaining_semesters: number
  recommended_per_semester: number
}

export default function DashboardPage() {
  const { user, googleToken, clearGoogleToken, refreshGoogleToken } = useAuth()
  const {
    db, ready: dbReady, loading: dbLoading,
    createTask: dbCreateTask, updateTask: dbUpdateTask, deleteTask: dbDeleteTask,
  } = useDB()
  const courses = db.courses
  const assignments = db.assignments
  const tasks = db.tasks
  const [grades, setGrades] = useState<Grade[]>([])
  const [gradesAvg, setGradesAvg] = useState<number | null>(null)
  const [credits, setCredits] = useState<CreditsInfo | null>(null)
  const [bguConnected, setBguConnected] = useState<boolean>(false)
  const zone1Loading = dbLoading || !dbReady
  const [zone2Loading, setZone2Loading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Calendar state
  const [weekDays, setWeekDays] = useState<DayData[]>([])
  const [selectedDay, setSelectedDay] = useState(new Date().getDay())
  const [weekOffset, setWeekOffset] = useState(0)
  const [calLoading, setCalLoading] = useState(true)
  const [calError, setCalError] = useState<string | null>(null)

  const providerToken = googleToken
  // Google OAuth populates metadata as full_name / name / first_name (not display_name).
  // Prefer first name for a friendlier greeting, fall back through the chain,
  // and only use the email local-part if nothing else is available.
  const meta = user?.user_metadata || {}
  const fullName = (meta.full_name || meta.name || '').trim()
  const firstName = (meta.first_name || meta.given_name || fullName.split(/\s+/)[0] || '').trim()
  const displayName = firstName || fullName || user?.email?.split('@')[0] || ''

  // Zone 1 (courses/assignments/tasks) now comes from DB context automatically

  // ── Zone 2: Load Moodle status, grades, credits (independent) ─
  useEffect(() => {
    async function loadZone2() {
      try {
        const [statusRes, gradesRes, degreeRes] = await Promise.all([
          api.university.status().catch(() => null),
          api.university.grades().catch(() => ({ grades: [], average: null })),
          api.university.degree().catch(() => ({ credits: null, settings: null })),
        ])

        const isConnected = statusRes?.moodle || statusRes?.portal
        setBguConnected(!!isConnected)
        setGrades(gradesRes?.grades || [])
        setGradesAvg(gradesRes?.average ?? null)
        if (degreeRes?.settings && degreeRes?.credits) {
          setCredits(degreeRes.credits)
        }
      } catch {
        setBguConnected(false)
      } finally {
        setZone2Loading(false)
      }
    }
    loadZone2()
  }, [])

  // ── Load calendar events ───────────────────────────────────
  useEffect(() => {
    if (!googleToken) { setCalLoading(false); return }
    loadCalendar()
  }, [googleToken, weekOffset])

  async function loadCalendar() {
    if (!googleToken) return
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

      const events = await fetchCalendarEvents(googleToken, sunday.toISOString(), saturday.toISOString(), refreshGoogleToken)
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
      if (e.message === 'TOKEN_EXPIRED') {
        clearGoogleToken()
        setCalError('TOKEN_EXPIRED')
      } else {
        setCalError('calendar_error')
      }
    } finally {
      setCalLoading(false)
    }
  }

  // ── Toggle task completion ─────────────────────────────────
  const toggleTask = useCallback(async (taskId: string, isCompleted: boolean) => {
    await dbUpdateTask(taskId, { is_completed: !isCompleted })
  }, [dbUpdateTask])

  // ── Todo popup state ──────────────────────────────────────
  const [todoOpen, setTodoOpen] = useState(false)

  const addTask = useCallback(async (title: string) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    await dbCreateTask({ title, scheduled_date: today })
  }, [dbCreateTask])

  const deleteTask = useCallback(async (taskId: string) => {
    await dbDeleteTask(taskId)
  }, [dbDeleteTask])

  // ── Computed data ──────────────────────────────────────────
  const todayData = weekDays[selectedDay]
  const activeCourses = courses.filter(c => c.status === 'active')

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayTasks = tasks.filter(t => t.scheduled_date === todayStr)
  const completedTodayTasks = todayTasks.filter(t => t.is_completed)
  const pendingTasks = tasks.filter(t => !t.is_completed)

  const pendingAssignments = assignments
    .filter(a => a.status !== 'submitted' && a.status !== 'graded')
    .sort((a, b) => {
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    })

  const urgentAssignments = pendingAssignments.filter(a => {
    if (!a.deadline) return false
    return differenceInDays(new Date(a.deadline), new Date()) <= 3
  })

  const avgGrade = gradesAvg ?? (grades.length > 0
    ? grades.reduce((sum, g) => sum + (typeof g.grade === 'number' ? g.grade : parseFloat(String(g.grade)) || 0), 0) / grades.length
    : null)

  const overallProgress = activeCourses.length > 0
    ? activeCourses.reduce((sum, c) => sum + c.progress_percentage, 0) / activeCourses.length
    : 0

  // Filter courses by day events
  const dayEvents = todayData?.events || []
  const dayCourses = activeCourses.filter(c =>
    dayEvents.some(e => matchEventToCourse(e, [c]) !== null)
  )

  const completedCourses = courses.filter(c => c.status === 'completed')
  const hasData = courses.length > 0 || assignments.length > 0 || tasks.length > 0
  const hasTodayData = todayTasks.length > 0 || urgentAssignments.length > 0 || (todayData?.events?.length || 0) > 0

  // Collect all today's calendar events for notifications.
  // Memoized so the array identity is stable across renders — useNotifications has
  // an effect that depends on this array and calls setState; an unstable identity
  // would loop "Maximum update depth exceeded".
  const allTodayEvents: GoogleCalendarEvent[] = useMemo(
    () => todayData?.events || [],
    [todayData],
  )

  // Notification system
  const {
    notifications, unreadCount, markRead, markAllRead,
    requestPermission, hasPermission,
  } = useNotifications(assignments, tasks, allTodayEvents)

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Todo Popup */}
      <TodoPopup
        isOpen={todoOpen}
        onClose={() => setTodoOpen(false)}
        tasks={tasks}
        onToggle={toggleTask}
        onAdd={addTask}
        onDelete={deleteTask}
        todayStr={format(new Date(), 'yyyy-MM-dd')}
      />

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          {/* TEEPO mascot — state reflects time of day + activity */}
          {(() => {
            const { state, hint } = getTeepoMood({
              hour: new Date().getHours(),
              hasData,
              urgentCount: urgentAssignments.length,
              todayTotal: todayTasks.length,
              todayDone: completedTodayTasks.length,
            })
            return (
              <div
                className="flex-shrink-0 hidden sm:block"
                title={hint}
                aria-label={`TEEPO: ${hint}`}
              >
                <Teepo state={state} size={68} />
              </div>
            )
          })()}
          <div>
            <h1 className="text-heading-1 leading-tight">
              <span className="text-ink">{getGreeting()}, </span>
              <span className="gradient-text hand-underline">{displayName}</span>
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              {getSemesterStatus().label} &middot; {format(new Date(), 'EEEE, d בMMMM', { locale: he })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationCenter
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            onRequestPermission={requestPermission}
            hasPermission={hasPermission}
          />
          <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg ${bguConnected ? 'text-emerald-400' : 'text-ink-subtle'}`}
            style={{ background: bguConnected ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${bguConnected ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
            {bguConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            Moodle
          </span>
        </div>
      </motion.div>

      {/* ── Live semester card ── */}
      <SemesterCard />

      {/* ══════════════════════════════════════════════════════════
          ZONE 1: מה קורה עכשיו — What's Happening Now
          ══════════════════════════════════════════════════════════ */}

      {/* ── "היום" Mini-Stats Row (only when there's data) ── */}
      {hasTodayData && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          {(() => {
            const hasGpa = gradesAvg != null
            const cols = hasGpa ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
            return (
              <div className={`grid ${cols} gap-3`}>
                {/* Tasks today */}
                <div className="glass-sm rounded-xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{ background: 'rgba(107,91,229,0.15)' }}>
                    <CheckSquare size={18} style={{ color: '#B8A9FF' }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold text-ink leading-none">
                      {completedTodayTasks.length}
                      <span className="text-sm text-ink-muted font-medium">/{todayTasks.length}</span>
                    </p>
                    <p className="text-[11px] text-ink-muted mt-1">משימות היום</p>
                  </div>
                </div>

                {/* Urgent assignments */}
                <div className="glass-sm rounded-xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{ background: urgentAssignments.length > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)' }}>
                    {urgentAssignments.length > 0
                      ? <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
                      : <CheckCircle2 size={18} style={{ color: '#10b981' }} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold leading-none"
                       style={{ color: urgentAssignments.length > 0 ? '#f59e0b' : '#10b981' }}>
                      {urgentAssignments.length}
                    </p>
                    <p className="text-[11px] text-ink-muted mt-1">
                      {urgentAssignments.length > 0 ? 'מטלות דחופות' : 'אין דחופות'}
                    </p>
                  </div>
                </div>

                {/* Semester days */}
                {(() => {
                  const s = getSemesterStatus()
                  const num = s.daysRemaining ?? s.daysUntilNext ?? null
                  const label = s.daysRemaining != null
                    ? 'ימים לסוף הסמסטר'
                    : s.daysUntilNext != null
                      ? `עד פתיחת ${s.nextLabel}`
                      : 'חופשה'
                  return (
                    <div className="glass-sm rounded-xl p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                           style={{ background: 'rgba(129,140,248,0.15)' }}>
                        <Calendar size={18} style={{ color: '#818cf8' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xl font-bold gradient-text leading-none">
                          {num ?? '—'}
                        </p>
                        <p className="text-[11px] text-ink-muted mt-1">{label}</p>
                      </div>
                    </div>
                  )
                })()}

                {/* GPA (only when available) */}
                {hasGpa && (
                  <div className="glass-sm rounded-xl p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                         style={{ background: `${getGradeColor(gradesAvg!)}22` }}>
                      <Award size={18} style={{ color: getGradeColor(gradesAvg!) }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xl font-bold leading-none"
                         style={{ color: getGradeColor(gradesAvg!) }}>
                        {gradesAvg!.toFixed(1)}
                      </p>
                      <p className="text-[11px] text-ink-muted mt-1">ממוצע ציונים</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </motion.div>
      )}

      {/* ── Calendar Strip ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
      <GlowCard className="overflow-hidden" glowColor="rgba(99,102,241,0.08)">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <Calendar size={16} style={{ color: '#818cf8' }} />
            <span className="text-sm font-semibold text-ink">
              {weekDays.length > 0 && weekOffset !== 0
                ? `${format(weekDays[0].date, 'd/M')} - ${format(weekDays[6].date, 'd/M')}`
                : 'השבוע שלי'
              }
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-white/5 transition-colors" title="שבוע קודם">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => { setWeekOffset(0); setSelectedDay(new Date().getDay()) }}
              className="px-2.5 py-1 rounded-lg text-xs text-accent-400 hover:bg-white/5 transition-colors font-medium" title="חזרה להיום">
              היום
            </button>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-white/5 transition-colors" title="שבוע הבא">
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 px-4 pb-4">
          {weekDays.map((day, i) => (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              className={`relative flex flex-col items-center py-2.5 px-1 rounded-xl transition-all ${
                selectedDay === i
                  ? 'text-ink'
                  : day.isToday
                    ? 'text-ink hover:bg-white/[0.04]'
                    : 'text-ink-muted hover:text-ink hover:bg-white/[0.04]'
              }`}
              style={selectedDay === i ? {
                background: 'rgba(var(--glow1), 0.12)',
                border: '0.5px solid rgba(var(--glow1), 0.4)',
              } : undefined}
            >
              <span className="text-[10px] font-medium">{DAYS_SHORT[i]}</span>
              <span className="text-lg font-medium mt-0.5">{day.date.getDate()}</span>
              {/* "Today" hairline pill under the date */}
              {day.isToday && selectedDay !== i && (
                <span
                  className="mt-1 h-0.5 w-4 rounded-full"
                  style={{ background: 'var(--accent)', boxShadow: '0 0 6px rgba(var(--glow1), 0.6)' }}
                />
              )}
              {day.events.length > 0 && selectedDay !== i && !day.isToday && (
                <div className="flex gap-0.5 mt-1">
                  {day.events.slice(0, 3).map((_, j) => (
                    <div key={j} className="w-1 h-1 rounded-full" style={{ background: 'rgba(var(--glow1), 0.6)' }} />
                  ))}
                </div>
              )}
            </button>
          ))}
          {weekDays.length === 0 && !calLoading && (
            <div className="col-span-7 text-center py-4">
              {calError === 'TOKEN_EXPIRED' ? (
                <button
                  onClick={() => supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                      redirectTo: `${window.location.origin}/dashboard`,
                      scopes: 'https://www.googleapis.com/auth/calendar.readonly',
                      queryParams: { access_type: 'offline', prompt: 'consent' },
                    },
                  })}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
                  style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}
                >
                  <RefreshCw size={12} /> חדש חיבור Google Calendar
                </button>
              ) : !providerToken ? (
                <button
                  onClick={() => supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                      redirectTo: `${window.location.origin}/dashboard`,
                      scopes: 'https://www.googleapis.com/auth/calendar.readonly',
                      queryParams: { access_type: 'offline', prompt: 'consent' },
                    },
                  })}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                  style={{ background: 'rgba(66,133,244,0.15)', color: '#8ab4f8', border: '1px solid rgba(66,133,244,0.25)' }}
                >
                  <Calendar size={14} /> חבר Google Calendar
                </button>
              ) : null}
            </div>
          )}
        </div>
      </GlowCard>
      </motion.div>

      {/* ── Zone 1 Main Content Grid (3/5 + 2/5) ── */}
      <div className="grid lg:grid-cols-5 gap-4 sm:gap-5">

        {/* ── Left Column (3/5): Schedule + Subjects ── */}
        <div className="lg:col-span-3 space-y-4 sm:space-y-6">

          {/* Schedule */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)' }}>
                <Clock size={14} style={{ color: '#818cf8' }} />
              </div>
              <h2 className="font-semibold text-ink">מערכת שעות</h2>
              {todayData && todayData.events.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                  {todayData.events.length}
                </span>
              )}
            </div>
            <ScheduleSection
              dayData={todayData}
              calLoading={calLoading}
              calError={calError}
              courses={courses}
              assignments={assignments}
              providerToken={providerToken}
            />
          </motion.div>

        </div>

        {/* ── Right Column (2/5): Tasks + Assignments ── */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">

          {/* Tasks */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
                  <CheckSquare size={14} style={{ color: '#60a5fa' }} />
                </div>
                <h2 className="font-semibold text-ink">משימות</h2>
                {pendingTasks.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.12)', color: '#93c5fd' }}>
                    {pendingTasks.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTodoOpen(true)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-accent-400 hover:bg-accent-400/10 transition-colors"
                  title="הוסף משימה"
                >
                  <Plus size={14} />
                </button>
                <Link href="/tasks">
                  <button className="text-xs text-accent-400 hover:text-accent flex items-center gap-1 transition-colors">
                    הכל <ArrowLeft size={12} />
                  </button>
                </Link>
              </div>
            </div>
            <TasksSection tasks={tasks} todayStr={todayStr} onToggle={toggleTask} loading={zone1Loading} onAddClick={() => setTodoOpen(true)} />
          </motion.div>

          {/* Upcoming Assignments */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)' }}>
                  <FileText size={14} style={{ color: '#fbbf24' }} />
                </div>
                <h2 className="font-semibold text-ink">מטלות קרובות</h2>
                {urgentAssignments.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full animate-pulse" style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>
                    {urgentAssignments.length} דחוף
                  </span>
                )}
              </div>
              <Link href="/assignments">
                <button className="text-xs text-accent-400 hover:text-accent flex items-center gap-1 transition-colors">
                  הכל <ArrowLeft size={12} />
                </button>
              </Link>
            </div>
            <AssignmentsSection assignments={pendingAssignments} courses={courses} loading={zone1Loading} />
          </motion.div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          ZONE 2: תמונת מצב כללית — Overall Academic Status
          ══════════════════════════════════════════════════════════ */}
      <div className="relative pt-2 pb-1">
        <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-l from-transparent via-white/8 to-transparent" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="space-y-4"
      >
        {/* ── Zone 2 Stats Row ── */}
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={14} className="text-accent-400" />
          <h2 className="text-sm font-bold text-ink-muted">תמונת מצב כללית</h2>
          <hr className="divider-clay flex-1" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          <StatCard
            icon={<BookOpen size={18} />}
            iconColor="#818cf8"
            iconBg="rgba(99,102,241,0.15)"
            label="קורסים פעילים"
            value={activeCourses.length}
            sub={`${Math.round(overallProgress)}% ממוצע התקדמות`}
            subColor={overallProgress >= 60 ? '#10b981' : '#f59e0b'}
          />
          <StatCard
            icon={<Award size={18} />}
            iconColor={avgGrade !== null ? getGradeColor(avgGrade) : '#64748b'}
            iconBg={avgGrade !== null ? `${getGradeColor(avgGrade)}20` : 'rgba(100,116,139,0.15)'}
            label="ממוצע ציונים"
            value={avgGrade !== null ? avgGrade.toFixed(1) : '—'}
            sub={grades.length > 0 ? `${grades.length} קורסים` : 'לא זמין'}
            subColor="#64748b"
          />
          <StatCard
            icon={<GraduationCap size={18} />}
            iconColor="#a78bfa"
            iconBg="rgba(167,139,250,0.15)"
            label="נק״ז"
            value={credits ? `${credits.completed}/${credits.required}` : '—'}
            sub={credits ? `${credits.recommended_per_semester} מומלץ/סמסטר` : 'לא הוגדר'}
            subColor="#a78bfa"
          />
          <StatCard
            icon={<CheckCircle2 size={18} />}
            iconColor="#10b981"
            iconBg="rgba(16,185,129,0.15)"
            label="קורסים שהושלמו"
            value={completedCourses.length}
            sub={completedCourses.length > 0 ? `מתוך ${courses.length} קורסים` : 'טרם הושלמו'}
            subColor={completedCourses.length > 0 ? '#10b981' : '#64748b'}
          />
        </motion.div>

        {/* ── Zone 2 Content Grid (1/2 + 1/2) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Left: Credits / Degree Progress ── */}
          <div>
            {credits ? (
              <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-violet-500/15">
                    <GraduationCap size={14} className="text-violet-400" />
                  </div>
                  <h2 className="font-semibold text-ink">התקדמות תואר</h2>
                </div>
                <AnimatedBorder speed={4}>
                  <CreditsSection credits={credits} />
                </AnimatedBorder>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
                <DegreeSetupPrompt />
              </motion.div>
            )}
          </div>

          {/* ── Right: Grades ── */}
          <div>
            <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: 0.1 }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: avgGrade !== null ? `${getGradeColor(avgGrade)}20` : 'rgba(100,116,139,0.15)' }}>
                    <BarChart3 size={14} style={{ color: avgGrade !== null ? getGradeColor(avgGrade) : '#64748b' }} />
                  </div>
                  <h2 className="font-semibold text-ink">ציונים</h2>
                </div>
                {!bguConnected && (
                  <Link href="/moodle">
                    <button className="text-xs text-accent-400 hover:text-accent flex items-center gap-1 transition-colors">
                      חבר Moodle <ArrowLeft size={12} />
                    </button>
                  </Link>
                )}
              </div>
              <GradesSection grades={grades} bguConnected={bguConnected} avgGrade={avgGrade} loading={zone2Loading} />
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ── Animated Number ─────────────────────────────────────────

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const dur = 1200
    const t0 = performance.now()
    let raf: number
    function tick(now: number) {
      const p = Math.min((now - t0) / dur, 1)
      const ease = 1 - Math.pow(1 - p, 3)              // ease-out cubic
      setDisplay(Number((ease * value).toFixed(decimals)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, decimals])
  return <>{display}</>
}

// ── Stat Card ───────────────────────────────────────────────

function StatCard({ icon, iconColor, iconBg, label, value, sub, subColor }: {
  icon: React.ReactNode; iconColor: string; iconBg: string
  label: string; value: string | number; sub: string; subColor: string
}) {
  const numericValue = typeof value === 'number' ? value : NaN
  const isAnimatable = !isNaN(numericValue)

  return (
    <GlowCard
      className="group hover:scale-[1.02] transition-transform"
      glowColor={iconBg.replace('0.15', '0.18')}
    >
      <div className="p-4 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-caption text-ink-muted truncate">{label}</p>
          <p className="text-xl font-extrabold text-ink leading-tight">
            {isAnimatable ? <AnimatedNumber value={numericValue} /> : value}
          </p>
          <p className="text-overline font-medium truncate" style={{ color: subColor }}>{sub}</p>
        </div>
      </div>
    </GlowCard>
  )
}

// ── Schedule Section ────────────────────────────────────────

function ScheduleSection({ dayData, calLoading, calError, courses, assignments, providerToken }: {
  dayData?: DayData; calLoading: boolean; calError?: string | null; courses: Course[]; assignments: Assignment[]; providerToken?: string | null
}) {
  if (calLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl shimmer" />)}</div>
  }

  if (calError === 'TOKEN_EXPIRED') {
    return (
      <GlowCard className="text-center" glowColor="rgba(245,158,11,0.10)">
        <div className="p-8">
          <RefreshCw size={28} className="mx-auto mb-2" style={{ color: '#fbbf24' }} />
          <p className="text-ink-muted text-sm mb-1">פג תוקף החיבור ל-Google</p>
          <p className="text-ink-subtle text-xs mb-3">יש להתחבר מחדש כדי לראות את המערכת</p>
          <button
            onClick={() => supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: `${window.location.origin}/dashboard`,
                scopes: 'https://www.googleapis.com/auth/calendar.readonly',
                queryParams: { access_type: 'offline', prompt: 'consent' },
              },
            })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <RefreshCw size={14} /> חדש חיבור
          </button>
        </div>
      </GlowCard>
    )
  }

  if (!providerToken) {
    return (
      <GlowCard className="text-center">
        <div className="p-8">
          <Calendar size={28} className="mx-auto mb-2" style={{ color: '#818cf8' }} />
          <p className="text-ink-muted text-sm mb-1">חבר את Google Calendar</p>
          <p className="text-ink-subtle text-xs">כדי לראות את המערכת שלך כאן</p>
        </div>
      </GlowCard>
    )
  }

  const events = dayData?.events || []
  const dayStr = dayData ? format(dayData.date, 'yyyy-MM-dd') : ''
  const dayAssignments = assignments.filter(a => a.deadline && a.deadline.startsWith(dayStr) && a.status !== 'submitted')

  if (events.length === 0 && dayAssignments.length === 0) {
    return (
      <GlowCard className="text-center" glowColor="rgba(16,185,129,0.10)">
        <div className="p-8">
          <div className="text-3xl mb-2">🎉</div>
          <p className="text-ink font-semibold text-sm">יום פנוי!</p>
          <p className="text-ink-muted text-xs mt-1">אין שיעורים או מטלות</p>
        </div>
      </GlowCard>
    )
  }

  const sorted = [...events].sort((a, b) => {
    const ta = new Date(a.start.dateTime || a.start.date || '').getTime()
    const tb = new Date(b.start.dateTime || b.start.date || '').getTime()
    return ta - tb
  })

  return (
    <div className="space-y-2">
      {sorted.map((event, i) => {
        const color = getEventColor(event.colorId)
        const time = formatEventTime(event)
        const endTime = event.end.dateTime
          ? new Date(event.end.dateTime).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
          : ''
        const matchedCourse = matchEventToCourse(event, courses)

        const card = (
          <div
            className={`flex items-stretch gap-3 p-3.5 rounded-xl transition-all ${matchedCourse ? 'cursor-pointer hover:scale-[1.01] group' : ''}`}
            style={{ background: color.bg, border: `1px solid ${color.border}` }}
          >
            <div className="w-1 rounded-full flex-shrink-0" style={{ background: color.text }} />
            <div className="flex flex-col items-center justify-center min-w-[48px]">
              <span className="text-sm font-bold text-ink">{time}</span>
              {endTime && <span className="text-[10px] text-ink-muted">{endTime}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold text-ink truncate ${matchedCourse ? 'group-hover:text-accent-400 transition-colors' : ''}`}>
                {event.summary}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {event.location && (
                  <span className="flex items-center gap-1 text-xs text-ink-muted truncate">
                    <MapPin size={10} /> {event.location}
                  </span>
                )}
                {matchedCourse && (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                    <PenLine size={8} /> סיכום
                  </span>
                )}
              </div>
            </div>
            {matchedCourse ? (
              <div className="flex items-center p-1.5 text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowLeft size={14} />
              </div>
            ) : event.htmlLink ? (
              <a href={event.htmlLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center p-1.5 text-ink-subtle hover:text-accent-400 transition-colors"
                onClick={e => e.stopPropagation()}>
                <ExternalLink size={13} />
              </a>
            ) : null}
          </div>
        )

        return (
          <motion.div key={event.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            {matchedCourse ? <Link href={`/courses/${matchedCourse.id}`}>{card}</Link> : card}
          </motion.div>
        )
      })}

      {dayAssignments.map((a, i) => (
        <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: (sorted.length + i) * 0.04 }}
          className="flex items-center gap-3 p-3.5 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="w-1 h-10 rounded-full bg-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate">{a.title}</p>
            <span className="text-xs text-red-400">מטלה להגשה היום</span>
          </div>
          <FileText size={14} className="text-red-400 flex-shrink-0" />
        </motion.div>
      ))}
    </div>
  )
}

// ── Tasks Section ───────────────────────────────────────────

function TasksSection({ tasks, todayStr, onToggle, loading, onAddClick }: {
  tasks: StudyTask[]; todayStr: string; onToggle: (id: string, done: boolean) => void; loading: boolean; onAddClick?: () => void
}) {
  if (loading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl shimmer" />)}</div>
  }

  // Show today's tasks first, then upcoming incomplete
  const todayTasks = tasks.filter(t => t.scheduled_date === todayStr)
  const upcomingTasks = tasks
    .filter(t => !t.is_completed && t.scheduled_date && t.scheduled_date > todayStr)
    .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''))
    .slice(0, 3)

  const allShown = [...todayTasks, ...upcomingTasks]

  if (allShown.length === 0) {
    return (
      <GlowCard className="text-center">
        <div className="p-6">
          <Sparkles size={24} className="mx-auto mb-2" style={{ color: '#818cf8' }} />
          <p className="text-ink-muted text-sm">אין משימות</p>
          <button
            onClick={onAddClick}
            className="mt-2 text-xs text-accent-400 hover:text-accent transition-colors"
          >
            הוסף משימה
          </button>
        </div>
      </GlowCard>
    )
  }

  return (
    <GlowCard className="overflow-hidden">
    <div className="divide-y divide-white/5">
      {todayTasks.length > 0 && (
        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">היום</p>
        </div>
      )}
      {todayTasks.map((task, i) => (
        <TaskRow key={task.id} task={task} onToggle={onToggle} index={i} isToday />
      ))}
      {upcomingTasks.length > 0 && (
        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">בקרוב</p>
        </div>
      )}
      {upcomingTasks.map((task, i) => (
        <TaskRow key={task.id} task={task} onToggle={onToggle} index={todayTasks.length + i} />
      ))}
    </div>
    </GlowCard>
  )
}

function TaskRow({ task, onToggle, index, isToday }: {
  task: StudyTask; onToggle: (id: string, done: boolean) => void; index: number; isToday?: boolean
}) {
  const priorityColors: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#10b981',
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center gap-3 px-3 py-3 hover:bg-white/3 transition-colors"
    >
      <motion.button
        onClick={() => onToggle(task.id, task.is_completed)}
        className="flex-shrink-0"
        whileTap={{ scale: 1.3 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      >
        {task.is_completed ? (
          <CheckCircle2 size={18} className="text-success" />
        ) : (
          <Circle size={18} style={{ color: priorityColors[task.category] || '#64748b' }} />
        )}
      </motion.button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate transition-all ${task.is_completed ? 'line-through text-ink-subtle task-complete-strike' : 'text-ink'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {task.duration_minutes && (
            <span className="text-[10px] text-ink-subtle flex items-center gap-0.5">
              <Clock size={8} /> {task.duration_minutes} דק׳
            </span>
          )}
          {!isToday && task.scheduled_date && (
            <span className="text-[10px] text-ink-subtle">
              {format(new Date(task.scheduled_date), 'd/M')}
            </span>
          )}
        </div>
      </div>
      {(task as any).priority && (
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: priorityColors[(task as any).priority] || '#64748b' }} />
      )}
    </motion.div>
  )
}

// ── Assignments Section ─────────────────────────────────────

function AssignmentsSection({ assignments, courses, loading }: {
  assignments: Assignment[]; courses: Course[]; loading: boolean
}) {
  if (loading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl shimmer" />)}</div>
  }

  if (assignments.length === 0) {
    return (
      <GlowCard className="text-center" glowColor="rgba(16,185,129,0.10)">
        <div className="p-6">
          <Target size={24} className="mx-auto mb-2" style={{ color: '#10b981' }} />
          <p className="text-ink-muted text-sm">אין מטלות ממתינות</p>
          <p className="text-ink-subtle text-xs mt-0.5">יפה! הכל מעודכן</p>
        </div>
      </GlowCard>
    )
  }

  return (
    <div className="space-y-2">
      {assignments.slice(0, 5).map((a, i) => {
        const course = courses.find(c => c.id === a.course_id)
        const dl = a.deadline ? getDeadlineColor(a.deadline) : null

        return (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
          >
          <GlowCard
            className="hover:scale-[1.01] transition-transform"
            glowColor={a.priority === 'high' ? 'rgba(239,68,68,0.10)' : a.priority === 'medium' ? 'rgba(245,158,11,0.10)' : 'rgba(16,185,129,0.10)'}
          >
            <div className="flex items-start gap-3 p-3.5">
              {/* Priority strip */}
              <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{
                background: a.priority === 'high' ? '#ef4444' : a.priority === 'medium' ? '#f59e0b' : '#10b981'
              }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{a.title}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {course && (
                    <span className="text-[10px] text-ink-subtle truncate max-w-[120px]">{course.title}</span>
                  )}
                  {dl && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: dl.bg, color: dl.text, border: `1px solid ${dl.border}` }}>
                      {dl.label}
                    </span>
                  )}
                  {a.deadline && (
                    <span className="text-[10px] text-ink-subtle">
                      {format(new Date(a.deadline), 'd/M')}
                    </span>
                  )}
                </div>
                {/* Progress: assignment tasks */}
                {a.assignment_tasks && a.assignment_tasks.length > 0 && (() => {
                  const done = a.assignment_tasks!.filter(t => t.is_completed).length
                  const total = a.assignment_tasks!.length
                  const pct = (done / total) * 100
                  return (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-1.5 rounded-full transition-all" style={{
                          width: `${pct}%`,
                          background: pct === 100 ? '#10b981' : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                        }} />
                      </div>
                      <span className="text-[10px] text-ink-subtle font-medium">{done}/{total}</span>
                    </div>
                  )
                })()}
              </div>
            </div>
          </GlowCard>
          </motion.div>
        )
      })}
      {assignments.length > 5 && (
        <Link href="/assignments">
          <button className="w-full text-center text-xs text-accent-400 hover:text-accent py-2 transition-colors">
            +{assignments.length - 5} נוספות
          </button>
        </Link>
      )}
    </div>
  )
}

// ── Grades Section ──────────────────────────────────────────

function GradesSection({ grades, bguConnected, avgGrade, loading }: {
  grades: Grade[]; bguConnected: boolean; avgGrade: number | null; loading: boolean
}) {
  if (loading) {
    return <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-14 rounded-xl shimmer" />)}</div>
  }

  if (!bguConnected) {
    return (
      <GlowCard className="text-center">
        <div className="p-6">
          <GraduationCap size={24} className="mx-auto mb-2" style={{ color: '#64748b' }} />
          <p className="text-ink-muted text-sm">חבר את Moodle כדי לראות ציונים</p>
          <Link href="/moodle">
            <button className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent transition-colors">
              <Wifi size={12} /> התחבר עכשיו
            </button>
          </Link>
        </div>
      </GlowCard>
    )
  }

  if (grades.length === 0) {
    return (
      <GlowCard className="text-center">
        <div className="p-6">
          <BarChart3 size={24} className="mx-auto mb-2" style={{ color: '#64748b' }} />
          <p className="text-ink-muted text-sm">אין ציונים עדיין</p>
          <p className="text-ink-subtle text-xs mt-0.5">ציונים יופיעו כאן אחרי פרסום</p>
        </div>
      </GlowCard>
    )
  }

  return (
    <GlowCard className="overflow-hidden">
    <div>
      {/* Average header */}
      {avgGrade !== null && (
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/5"
          style={{ background: `${getGradeColor(avgGrade)}08` }}>
          <span className="text-xs text-ink-muted">ממוצע</span>
          <span className="text-lg font-extrabold" style={{ color: getGradeColor(avgGrade) }}>
            {avgGrade.toFixed(1)}
          </span>
        </div>
      )}
      {/* Grade rows with semester groups */}
      <div className="max-h-72 overflow-y-auto">
        {(() => {
          // Group grades by semester/year
          const grouped: Record<string, typeof grades> = {}
          const ungrouped: typeof grades = []
          for (const g of grades) {
            const key = (g as any).semester || (g as any).academic_year
            if (key) {
              ;(grouped[key] = grouped[key] || []).push(g)
            } else {
              ungrouped.push(g)
            }
          }
          const groups = Object.entries(grouped)
          const allRows = groups.length > 0 ? groups : [['', grades]]

          return allRows.map(([label, items], gi) => (
            <div key={String(label) || gi}>
              {label && typeof label === 'string' && (
                <div className="px-4 py-1.5 bg-white/3 border-y border-white/5">
                  <span className="text-[10px] font-semibold text-ink-subtle">{String(label)}</span>
                </div>
              )}
              <div className="divide-y divide-white/5">
                {(items as typeof grades).map((g, i) => {
                  const numGrade = typeof g.grade === 'number' ? g.grade : parseFloat(String(g.grade))
                  const color = !isNaN(numGrade) ? getGradeColor(numGrade) : '#64748b'
                  return (
                    <div key={`${g.course_name}-${i}`}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-white/3 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink truncate">{g.course_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {(g as any).credits && (
                            <span className="text-[10px] text-ink-subtle">{(g as any).credits} נק״ז</span>
                          )}
                          {g.rank && <span className="text-[10px] text-ink-subtle">דירוג: {g.rank}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color }}>
                          {!isNaN(numGrade) ? numGrade : (g as any).grade_text || g.grade || '—'}
                        </span>
                        {!isNaN(numGrade) && (
                          <div className="w-10 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${numGrade}%`, background: color }} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        })()}
      </div>
    </div>
    </GlowCard>
  )
}

// ── Degree Setup Prompt ─────────────────────────────────────

function DegreeSetupPrompt() {
  const [open, setOpen] = useState(false)
  const [totalCredits, setTotalCredits] = useState('')
  const [endYear, setEndYear] = useState('')
  const [degreeName, setDegreeName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!totalCredits) return
    setSaving(true)
    try {
      await api.university.saveDegree({
        total_credits_required: parseFloat(totalCredits),
        expected_end_year: endYear ? parseInt(endYear) : undefined,
        degree_name: degreeName || undefined,
        start_year: new Date().getFullYear(),
      })
      window.location.reload()
    } catch {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <GlowCard className="text-center" glowColor="rgba(167,139,250,0.12)">
        <div className="p-5">
        <GraduationCap size={24} className="mx-auto mb-2" style={{ color: '#a78bfa' }} />
        <p className="text-ink-muted text-sm mb-1">הגדר את פרטי התואר שלך</p>
        <p className="text-ink-subtle text-xs mb-3">כדי לעקוב אחרי נק״ז והתקדמות</p>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.25)' }}
        >
          <GraduationCap size={14} /> הגדר תואר
        </button>
        </div>
      </GlowCard>
    )
  }

  return (
    <GlowCard glowColor="rgba(167,139,250,0.12)">
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <GraduationCap size={16} style={{ color: '#a78bfa' }} />
        <h3 className="text-sm font-semibold text-ink">הגדרות תואר</h3>
      </div>
      <div>
        <label className="text-xs text-ink-muted mb-1 block">שם התואר</label>
        <input
          value={degreeName}
          onChange={e => setDegreeName(e.target.value)}
          placeholder="לדוגמה: מדעי המדינה"
          className="w-full px-3 py-2 rounded-lg text-sm text-ink bg-white/5 border border-white/10 focus:border-accent-400 focus:outline-none transition-colors"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-ink-muted mb-1 block">סה״כ נק״ז לתואר</label>
          <input
            type="number"
            value={totalCredits}
            onChange={e => setTotalCredits(e.target.value)}
            placeholder="למשל 120"
            className="w-full px-3 py-2 rounded-lg text-sm text-ink bg-white/5 border border-white/10 focus:border-accent-400 focus:outline-none transition-colors"
          />
        </div>
        <div>
          <label className="text-xs text-ink-muted mb-1 block">שנת סיום צפויה</label>
          <input
            type="number"
            value={endYear}
            onChange={e => setEndYear(e.target.value)}
            placeholder="למשל 2028"
            className="w-full px-3 py-2 rounded-lg text-sm text-ink bg-white/5 border border-white/10 focus:border-accent-400 focus:outline-none transition-colors"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={!totalCredits || saving}
          className="flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
          style={{ background: 'rgba(167,139,250,0.2)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.3)' }}
        >
          {saving ? 'שומר...' : 'שמור'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-2 rounded-xl text-sm text-ink-muted hover:text-ink transition-colors"
        >
          ביטול
        </button>
      </div>
    </div>
    </GlowCard>
  )
}

// ── Credits Section ─────────────────────────────────────────

function CreditsSection({ credits }: { credits: CreditsInfo }) {
  const pct = credits.required > 0 ? Math.min(100, (credits.completed / credits.required) * 100) : 0
  const pctColor = pct >= 75 ? '#10b981' : pct >= 50 ? '#3b82f6' : '#a78bfa'

  return (
    <div className="p-4 space-y-3">
      {/* Main progress */}
      <div>
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-sm font-semibold text-ink">נק״ז שהושלמו</span>
          <span className="text-lg font-extrabold" style={{ color: pctColor }}>
            {credits.completed} <span className="text-xs font-normal text-ink-muted">/ {credits.required}</span>
          </span>
        </div>
        <div className="w-full h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-3 rounded-full"
            style={{ background: `linear-gradient(90deg, #6366f1, ${pctColor})` }}
          />
        </div>
        <p className="text-[10px] text-ink-subtle mt-1 text-left" dir="ltr">{Math.round(pct)}%</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-lg font-bold text-ink">{credits.remaining}</p>
          <p className="text-[10px] text-ink-muted">נותרו</p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-lg font-bold" style={{ color: '#a78bfa' }}>{credits.remaining_semesters}</p>
          <p className="text-[10px] text-ink-muted">סמסטרים</p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)' }}>
          <p className="text-lg font-bold" style={{ color: '#a78bfa' }}>{credits.recommended_per_semester}</p>
          <p className="text-[10px] text-ink-muted">מומלץ/סמסטר</p>
        </div>
      </div>
    </div>
  )
}

// ── Subjects Section ────────────────────────────────────────

function SubjectsSection({ courses, assignments, loading }: {
  courses: Course[]; assignments: Assignment[]; loading: boolean
}) {
  if (loading) {
    return <div className="grid sm:grid-cols-2 gap-3">{[1, 2].map(i => <div key={i} className="h-32 rounded-xl shimmer" />)}</div>
  }

  if (courses.length === 0) {
    return (
      <GlowCard className="text-center">
        <div className="p-6">
          <div className="text-2xl mb-1">📖</div>
          <p className="text-ink-muted text-sm">אין מקצועות ביום הזה</p>
          <Link href="/courses">
            <button className="mt-2 text-xs text-accent-400 hover:text-accent transition-colors">ראה את כל הקורסים</button>
          </Link>
        </div>
      </GlowCard>
    )
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {courses.map((course, i) => {
        const courseAssignments = assignments.filter(a => a.course_id === course.id)
        const pendingCount = courseAssignments.filter(a => a.status !== 'submitted' && a.status !== 'graded').length

        return (
          <motion.div key={course.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Link href={`/courses/${course.id}`}>
              <GlowCard className="group hover:scale-[1.02] transition-transform cursor-pointer"
                glowColor={course.progress_percentage >= 70 ? 'rgba(16,185,129,0.10)' : 'rgba(99,102,241,0.10)'}>
              <div className="relative overflow-hidden p-4">
                <div className="absolute top-0 left-0 right-0 h-1" style={{
                  background: `linear-gradient(90deg, ${course.progress_percentage >= 70 ? '#10b981' : '#6366f1'}, ${course.progress_percentage >= 70 ? '#34d399' : '#8b5cf6'})`
                }} />
                <div className="flex items-start justify-between mb-2">
                  <p className="font-semibold text-ink text-sm line-clamp-2 group-hover:text-accent-400 transition-colors flex-1 min-w-0">
                    {course.title}
                  </p>
                  <ArrowLeft size={14} className="text-ink-subtle group-hover:text-accent-400 transition-colors flex-shrink-0 mt-0.5 mr-2" />
                </div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {pendingCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
                      style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <FileText size={9} /> {pendingCount} מטלות
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
                    style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <PenLine size={9} /> סיכום
                  </span>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-ink-muted mb-1">
                    <span className="flex items-center gap-1"><TrendingUp size={9} /> התקדמות</span>
                    <span className="font-bold" style={{ color: course.progress_percentage >= 70 ? '#10b981' : '#a5b4fc' }}>
                      {Math.round(course.progress_percentage)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-1.5 rounded-full transition-all" style={{
                      width: `${course.progress_percentage}%`,
                      background: course.progress_percentage >= 70
                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                        : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                    }} />
                  </div>
                </div>
              </div>
              </GlowCard>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Todo Popup ─────────────────────────────────────────────

function TodoPopup({ isOpen, onClose, tasks, onToggle, onAdd, onDelete, todayStr }: {
  isOpen: boolean; onClose: () => void; tasks: StudyTask[]
  onToggle: (id: string, done: boolean) => void
  onAdd: (title: string) => Promise<void>
  onDelete: (id: string) => void
  todayStr: string
}) {
  const [newTask, setNewTask] = useState('')
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const handleAdd = async () => {
    if (!newTask.trim() || adding) return
    setAdding(true)
    await onAdd(newTask.trim())
    setNewTask('')
    setAdding(false)
    inputRef.current?.focus()
  }

  const pending = tasks.filter(t => !t.is_completed)
  const completed = tasks.filter(t => t.is_completed)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-sm rounded-2xl overflow-hidden pointer-events-auto shadow-2xl"
              style={{
                background: 'rgba(22,27,39,0.98)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 0 60px rgba(99,102,241,0.12), 0 25px 50px rgba(0,0,0,0.5)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    <ListTodo size={16} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-ink text-sm">המשימות שלי</h3>
                    <p className="text-[10px] text-ink-subtle">
                      {pending.length > 0 ? `${pending.length} ממתינות` : 'הכל הושלם!'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-ink-muted hover:text-ink transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Quick add input */}
              <div className="px-4 pb-3">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={newTask}
                    onChange={e => setNewTask(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="מה צריך לעשות?..."
                    dir="rtl"
                    className="flex-1 px-3.5 py-2.5 rounded-xl text-sm text-ink placeholder:text-ink-subtle focus:outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = 'rgba(99,102,241,0.4)'
                      e.target.style.background = 'rgba(255,255,255,0.07)'
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = 'rgba(255,255,255,0.08)'
                      e.target.style.background = 'rgba(255,255,255,0.05)'
                    }}
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAdd}
                    disabled={!newTask.trim() || adding}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-30"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                  >
                    {adding ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Plus size={18} />
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

              {/* Task list */}
              <div className="max-h-72 overflow-y-auto">
                {pending.length === 0 && completed.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                      style={{ background: 'rgba(99,102,241,0.1)' }}>
                      <Sparkles size={22} style={{ color: '#818cf8' }} />
                    </div>
                    <p className="text-ink-muted text-sm font-medium">הרשימה ריקה</p>
                    <p className="text-ink-subtle text-xs mt-0.5">הוסף משימה חדשה למעלה</p>
                  </div>
                ) : (
                  <>
                    {pending.length > 0 && (
                      <div className="px-4 pt-3 pb-1">
                        <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">
                          ממתינות · {pending.length}
                        </p>
                      </div>
                    )}
                    {pending.map((task, i) => (
                      <TodoRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} index={i} />
                    ))}
                    {completed.length > 0 && (
                      <>
                        <div className="px-4 pt-3 pb-1">
                          <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider">
                            הושלמו · {completed.length}
                          </p>
                        </div>
                        {completed.slice(0, 5).map((task, i) => (
                          <TodoRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} index={pending.length + i} />
                        ))}
                        {completed.length > 5 && (
                          <div className="px-4 py-2 text-center">
                            <span className="text-[10px] text-ink-subtle">+{completed.length - 5} נוספות</span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              {(pending.length > 0 || completed.length > 0) && (
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* Progress mini-bar */}
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: `${((completed.length) / (pending.length + completed.length)) * 100}%`,
                          background: 'linear-gradient(90deg, #6366f1, #10b981)',
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-ink-subtle">
                      {completed.length}/{pending.length + completed.length}
                    </span>
                  </div>
                  <Link href="/tasks" onClick={onClose}>
                    <button className="text-[10px] text-accent-400 hover:text-accent transition-colors flex items-center gap-1 font-medium">
                      כל המשימות <ArrowLeft size={10} />
                    </button>
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function TodoRow({ task, onToggle, onDelete, index }: {
  task: StudyTask; onToggle: (id: string, done: boolean) => void; onDelete: (id: string) => void; index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      className="flex items-center gap-3 px-4 py-2.5 group hover:bg-white/[0.03] transition-colors"
    >
      <motion.button
        onClick={() => onToggle(task.id, task.is_completed)}
        className="flex-shrink-0"
        whileTap={{ scale: 1.3 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      >
        {task.is_completed ? (
          <CheckCircle2 size={18} className="text-success" />
        ) : (
          <Circle size={18} className="text-ink-subtle hover:text-accent-400 transition-colors" />
        )}
      </motion.button>
      <span
        className={`flex-1 text-sm min-w-0 truncate transition-colors ${
          task.is_completed ? 'line-through text-ink-subtle' : 'text-ink'
        }`}
      >
        {task.title}
      </span>
      {task.scheduled_date && (
        <span className="text-[10px] text-ink-subtle flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {format(new Date(task.scheduled_date), 'd/M')}
        </span>
      )}
      <button
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/10 text-ink-subtle hover:text-red-400 transition-all flex-shrink-0"
      >
        <Trash2 size={13} />
      </button>
    </motion.div>
  )
}
