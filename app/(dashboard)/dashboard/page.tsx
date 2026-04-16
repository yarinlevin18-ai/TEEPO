'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen, CheckSquare, Clock, TrendingUp,
  Calendar, ArrowLeft, Zap, Target, Flame, Star,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { api } from '@/lib/api-client'
import { useAuth } from '@/lib/auth-context'
import CalendarWidget from '@/components/CalendarWidget'
import ErrorAlert from '@/components/ui/ErrorAlert'
import type { StudyTask, Course, Assignment } from '@/types'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

/**
 * Detect current semester from date:
 *  Semester א = October–February  (months 10-12, 1-2)
 *  Semester ב = March–July        (months 3-7)
 *  Summer     = August–September  (months 8-9)
 */
function getCurrentSemester(): { semester: string; label: string } {
  const month = new Date().getMonth() + 1
  if (month >= 10 || month <= 2) return { semester: '1', label: "סמסטר א'" }
  if (month >= 3 && month <= 7) return { semester: '2', label: "סמסטר ב'" }
  return { semester: 'קיץ', label: 'קיץ' }
}

function isCourseCurrentSemester(title: string): boolean {
  const { semester } = getCurrentSemester()

  if (semester === '1') {
    if (/סמ['\s]*1|סמסטר\s*א|sem(?:ester)?\s*1|\bS1\b/i.test(title)) return true
  } else if (semester === '2') {
    if (/סמ['\s]*2|סמסטר\s*ב|sem(?:ester)?\s*2|\bS2\b/i.test(title)) return true
  } else {
    if (/קיץ|summer/i.test(title)) return true
  }

  if (!/סמ['\s]*[12]|סמסטר|sem(?:ester)?|summer|קיץ|\bS[12]\b/i.test(title)) return true

  return false
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'בוקר טוב'
  if (hour >= 12 && hour < 17) return 'צהריים טובים'
  if (hour >= 17 && hour < 21) return 'ערב טוב'
  return 'לילה טוב'
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<StudyTask[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const today = format(new Date(), 'yyyy-MM-dd')

  const displayName = user?.user_metadata?.display_name
    || user?.email?.split('@')[0]
    || ''

  useEffect(() => {
    Promise.all([api.tasks.list(today), api.courses.list(), api.assignments.list()])
      .then(([t, c, a]) => { setTasks(t); setCourses(c); setAssignments(a) })
      .catch((e) => {
        console.error(e)
        setError('שגיאה בטעינת הנתונים. נסה לרענן את העמוד.')
      })
      .finally(() => setLoading(false))
  }, [today])

  const completedToday = tasks.filter(t => t.is_completed).length
  const totalTasks = tasks.length
  const completionRate = totalTasks > 0 ? Math.round((completedToday / totalTasks) * 100) : 0
  const activeCourses = courses.filter(c => c.status === 'active')
  const avgProgress = activeCourses.length > 0
    ? Math.round(activeCourses.reduce((sum, c) => sum + c.progress_percentage, 0) / activeCourses.length)
    : 0
  const urgentAssignments = assignments.filter(
    a => a.deadline && new Date(a.deadline) < new Date(Date.now() + 3 * 86400000) && a.status !== 'submitted'
  )

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-8"
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.15) 50%, rgba(56,189,248,0.1) 100%)',
          border: '1px solid rgba(99,102,241,0.2)',
        }}
      >
        {/* Background decoration */}
        <div className="absolute top-0 left-0 w-64 h-64 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div className="absolute bottom-0 right-0 w-48 h-48 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.5) 0%, transparent 70%)', filter: 'blur(30px)' }} />

        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Image src="/logo-128.png" alt="SmartDesk" width={42} height={42} />
              <span className="text-sm font-bold px-3 py-1 rounded-full"
                style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
                MyDesk
              </span>
            </div>
            <h1 className="text-3xl font-extrabold mt-3">
              <span className="text-ink">{getGreeting()}, </span>
              <span className="gradient-text">{displayName}</span>
              <span className="ml-1">👋</span>
            </h1>
            <p className="text-ink-muted mt-2 flex items-center gap-2">
              <Calendar size={14} />
              {format(new Date(), 'EEEE, d בMMMM yyyy', { locale: he })}
              <span className="mx-1">·</span>
              <span className="text-accent-400">{getCurrentSemester().label}</span>
            </p>
          </div>

          {/* Daily Progress Ring */}
          <div className="hidden md:flex flex-col items-center gap-2">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke="url(#progressGrad)" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${completionRate * 2.64} 264`}
                  className="transition-all duration-1000"
                />
                <defs>
                  <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-ink">{completionRate}%</span>
              </div>
            </div>
            <span className="text-xs text-ink-muted">ביצוע יומי</span>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'קורסים פעילים', value: activeCourses.length, icon: BookOpen, color: '#6366f1', bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.2)' },
          { label: 'משימות להיום', value: totalTasks, icon: Target, color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.2)' },
          { label: 'הושלמו היום', value: completedToday, icon: Flame, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.2)' },
          { label: 'מטלות דחופות', value: urgentAssignments.length, icon: Zap, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.2)' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            className="relative overflow-hidden rounded-xl p-5 group hover:scale-[1.02] transition-transform"
            style={{ background: stat.bg, border: `1px solid ${stat.border}` }}
          >
            <div className="absolute top-3 left-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <stat.icon size={40} style={{ color: stat.color }} />
            </div>
            <div className="relative z-10">
              <stat.icon size={20} style={{ color: stat.color }} className="mb-3" />
              <p className="text-3xl font-extrabold text-ink">{stat.value}</p>
              <p className="text-xs text-ink-muted mt-1">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Overall Progress Bar */}
      {activeCourses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} style={{ color: '#8b5cf6' }} />
              <span className="text-sm font-semibold text-ink">התקדמות כללית</span>
            </div>
            <span className="text-sm font-bold gradient-text">{avgProgress}%</span>
          </div>
          <div className="w-full h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${avgProgress}%` }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="h-3 rounded-full"
              style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)' }}
            />
          </div>
          <p className="text-xs text-ink-muted mt-2">ממוצע על פני {activeCourses.length} קורסים פעילים</p>
        </motion.div>
      )}

      {/* Google Calendar */}
      <CalendarWidget />

      <div className="grid md:grid-cols-2 gap-6">
        {/* Today's Tasks */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)' }}>
                <CheckSquare size={14} style={{ color: '#818cf8' }} />
              </div>
              <h2 className="font-semibold text-ink">משימות היום</h2>
              {totalTasks > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                  {completedToday}/{totalTasks}
                </span>
              )}
            </div>
            <Link href="/tasks">
              <button className="text-xs text-accent-400 hover:text-accent flex items-center gap-1 transition-colors">
                הכל <ArrowLeft size={12} />
              </button>
            </Link>
          </div>
          <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
            {loading ? <LoadingSkeleton rows={3} /> : tasks.length === 0 ? (
              <EmptyState message="אין משימות להיום" action={{ href: '/tasks', label: 'הוסף משימה' }} icon={Star} />
            ) : (
              tasks.map(task => (
                <TaskRow key={task.id} task={task} onToggle={(id, done) => {
                  setTasks(prev => prev.map(t => t.id === id ? { ...t, is_completed: done } : t))
                  api.tasks.update(id, { is_completed: done }).catch((e) => {
                    console.error(e)
                    setTasks(prev => prev.map(t => t.id === id ? { ...t, is_completed: !done } : t))
                    setError('שגיאה בעדכון המשימה.')
                  })
                }} />
              ))
            )}
          </div>
        </motion.div>

        {/* Upcoming assignments */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)' }}>
                <Clock size={14} style={{ color: '#f59e0b' }} />
              </div>
              <h2 className="font-semibold text-ink">מטלות קרובות</h2>
              {urgentAssignments.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                  {urgentAssignments.length} דחופות
                </span>
              )}
            </div>
            <Link href="/assignments">
              <button className="text-xs text-accent-400 hover:text-accent flex items-center gap-1 transition-colors">
                הכל <ArrowLeft size={12} />
              </button>
            </Link>
          </div>
          <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
            {loading ? <LoadingSkeleton rows={3} /> : assignments.length === 0 ? (
              <EmptyState message="אין מטלות קרובות" action={{ href: '/assignments', label: 'הוסף מטלה' }} icon={Star} />
            ) : (
              assignments.slice(0, 5).map(a => {
                const daysLeft = a.deadline
                  ? Math.ceil((new Date(a.deadline).getTime() - Date.now()) / 86400000)
                  : null
                return (
                  <div key={a.id} className="p-4 flex justify-between items-center hover:bg-white/[0.02] transition-colors">
                    <div>
                      <p className="text-sm font-medium text-ink">{a.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {a.deadline && (
                          <span className="text-xs text-ink-muted">
                            {format(new Date(a.deadline), 'd בMMM', { locale: he })}
                          </span>
                        )}
                        {daysLeft !== null && daysLeft <= 3 && daysLeft >= 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                            {daysLeft === 0 ? 'היום!' : daysLeft === 1 ? 'מחר' : `עוד ${daysLeft} ימים`}
                          </span>
                        )}
                      </div>
                    </div>
                    <PriorityBadge priority={a.priority} />
                  </div>
                )
              })
            )}
          </div>
        </motion.div>
      </div>

      {/* Active Courses */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="glass overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)' }}>
              <BookOpen size={14} style={{ color: '#818cf8' }} />
            </div>
            <h2 className="font-semibold text-ink">קורסים פעילים</h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}>
              {getCurrentSemester().label}
            </span>
          </div>
          <Link href="/courses">
            <button className="text-xs text-accent-400 hover:text-accent flex items-center gap-1 transition-colors">
              כל הקורסים <ArrowLeft size={12} />
            </button>
          </Link>
        </div>
        {loading ? (
          <div className="p-5"><LoadingSkeleton rows={2} /></div>
        ) : courses.length === 0 ? (
          <EmptyState message="עדיין לא הוספת קורסים" action={{ href: '/bgu-connect', label: 'חבר BGU' }} icon={BookOpen} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {courses
              .filter(c => c.status === 'active' && isCourseCurrentSemester(c.title))
              .map((course, i) => (
                <motion.div
                  key={course.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8 + i * 0.05 }}
                >
                  <Link href={`/courses/${course.id}`}>
                    <div className="relative overflow-hidden rounded-xl p-4 group hover:scale-[1.02] transition-all cursor-pointer"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      {/* Accent top border */}
                      <div className="absolute top-0 left-0 right-0 h-0.5"
                        style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
                      <p className="font-medium text-ink text-sm line-clamp-2 group-hover:text-accent-400 transition-colors">{course.title}</p>
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-ink-muted mb-1.5">
                          <span>התקדמות</span>
                          <span className="font-semibold" style={{ color: course.progress_percentage >= 70 ? '#10b981' : '#a5b4fc' }}>
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
              ))
            }
            {courses.filter(c => c.status === 'active' && isCourseCurrentSemester(c.title)).length === 0 && (
              <div className="col-span-full p-6 text-center">
                <p className="text-ink-muted text-sm">אין קורסים פעילים לסמסטר הנוכחי</p>
                <Link href="/courses">
                  <button className="mt-2 text-sm text-accent-400 hover:text-accent transition-colors">
                    ראה את כל הקורסים
                  </button>
                </Link>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}

function TaskRow({ task, onToggle }: { task: StudyTask; onToggle: (id: string, done: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors">
      <button
        onClick={() => onToggle(task.id, !task.is_completed)}
        className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all hover:scale-110"
        style={task.is_completed
          ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderColor: '#6366f1' }
          : { borderColor: 'rgba(255,255,255,0.2)' }}
      >
        {task.is_completed && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className={`text-sm flex-1 transition-all ${task.is_completed ? 'line-through text-ink-muted' : 'text-ink'}`}>
        {task.title}
      </span>
      {task.duration_minutes && (
        <span className="text-xs px-2 py-0.5 rounded-full text-ink-muted" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {task.duration_minutes} דק׳
        </span>
      )}
    </div>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles = {
    high:   { bg: 'rgba(239,68,68,0.15)',  color: '#f87171', border: 'rgba(239,68,68,0.25)', label: 'דחוף' },
    medium: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: 'rgba(245,158,11,0.25)', label: 'בינוני' },
    low:    { bg: 'rgba(16,185,129,0.15)', color: '#34d399', border: 'rgba(16,185,129,0.25)', label: 'נמוך' },
  }
  const s = styles[priority as keyof typeof styles] || styles.medium
  return (
    <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  )
}

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 rounded-lg shimmer" />
      ))}
    </div>
  )
}

function EmptyState({ message, action, icon: Icon }: { message: string; action?: { href: string; label: string }; icon?: React.ElementType }) {
  return (
    <div className="p-8 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
          <Icon size={20} style={{ color: '#818cf8' }} />
        </div>
      )}
      <p className="text-ink-muted text-sm">{message}</p>
      {action && (
        <Link href={action.href}>
          <button className="mt-3 text-sm text-accent-400 hover:text-accent transition-colors">{action.label}</button>
        </Link>
      )}
    </div>
  )
}
