'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen, CheckSquare, Clock, TrendingUp,
  Calendar, ArrowLeft, Plus, Zap,
} from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api-client'
import { useAuth } from '@/lib/auth-context'
import ErrorAlert from '@/components/ui/ErrorAlert'
import type { StudyTask, Course, Assignment } from '@/types'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

const STATS = [
  { key: 'courses', label: 'קורסים פעילים', icon: BookOpen, color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
  { key: 'tasks',   label: 'משימות להיום',  icon: CheckSquare, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  { key: 'done',    label: 'הושלמו היום',   icon: TrendingUp,  color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
  { key: 'urgent',  label: 'מטלות דחופות', icon: Zap,         color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
]

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
  const t = title.toLowerCase()

  // Explicit semester markers
  if (semester === '1') {
    if (/סמ['\s]*1|סמסטר\s*א|sem(?:ester)?\s*1|\bS1\b/i.test(title)) return true
  } else if (semester === '2') {
    if (/סמ['\s]*2|סמסטר\s*ב|sem(?:ester)?\s*2|\bS2\b/i.test(title)) return true
  } else {
    if (/קיץ|summer/i.test(title)) return true
  }

  // Courses without semester marker — include them (could be year-long)
  if (!/סמ['\s]*[12]|סמסטר|sem(?:ester)?|summer|קיץ|\bS[12]\b/i.test(title)) return true

  return false
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<StudyTask[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const today = format(new Date(), 'yyyy-MM-dd')

  // Extract user display name
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
  const urgentAssignments = assignments.filter(
    a => a.deadline && new Date(a.deadline) < new Date(Date.now() + 3 * 86400000) && a.status !== 'submitted'
  )

  const statValues = {
    courses: courses.filter(c => c.status === 'active').length,
    tasks: tasks.length,
    done: completedToday,
    urgent: urgentAssignments.length,
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">
          <span className="text-ink">שלום {displayName}! </span>
          <span className="gradient-text">בוא נלמד היום</span>
          <span className="ml-2">📚</span>
        </h1>
        <p className="text-ink-muted mt-1.5">
          {format(new Date(), 'EEEE, d בMMMM yyyy', { locale: he })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATS.map(({ key, label, icon: Icon, color, bg }, i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass p-5"
          >
            <div className="inline-flex p-2.5 rounded-xl mb-3" style={{ background: bg }}>
              <Icon size={20} style={{ color }} />
            </div>
            <p className="text-2xl font-bold text-ink">{statValues[key as keyof typeof statValues]}</p>
            <p className="text-sm text-ink-muted mt-0.5">{label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Today's Tasks */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Calendar size={17} style={{ color: '#818cf8' }} />
              <h2 className="font-semibold text-ink">משימות היום</h2>
            </div>
            <Link href="/tasks">
              <button className="text-xs text-accent-400 hover:text-accent flex items-center gap-1 transition-colors">
                הכל <ArrowLeft size={12} />
              </button>
            </Link>
          </div>
          <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
            {loading ? <LoadingSkeleton rows={3} /> : tasks.length === 0 ? (
              <EmptyState message="אין משימות להיום" action={{ href: '/tasks', label: 'הוסף משימה' }} />
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
          transition={{ delay: 0.4 }}
          className="glass overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Clock size={17} style={{ color: '#f59e0b' }} />
              <h2 className="font-semibold text-ink">מטלות קרובות</h2>
            </div>
            <Link href="/assignments">
              <button className="text-xs text-accent-400 hover:text-accent flex items-center gap-1 transition-colors">
                הכל <ArrowLeft size={12} />
              </button>
            </Link>
          </div>
          <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
            {loading ? <LoadingSkeleton rows={3} /> : assignments.length === 0 ? (
              <EmptyState message="אין מטלות קרובות" action={{ href: '/assignments', label: 'הוסף מטלה' }} />
            ) : (
              assignments.slice(0, 5).map(a => (
                <div key={a.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-ink">{a.title}</p>
                    {a.deadline && (
                      <p className="text-xs text-ink-muted mt-0.5">
                        {format(new Date(a.deadline), 'd בMMM', { locale: he })}
                      </p>
                    )}
                  </div>
                  <PriorityBadge priority={a.priority} />
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* Active Courses — current semester only */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <BookOpen size={17} style={{ color: '#818cf8' }} />
            <h2 className="font-semibold text-ink">קורסים פעילים — {getCurrentSemester().label}</h2>
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
          <EmptyState message="עדיין לא הוספת קורסים" action={{ href: '/bgu-connect', label: 'חבר BGU' }} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {courses
              .filter(c => c.status === 'active' && isCourseCurrentSemester(c.title))
              .map(course => (
                <Link key={course.id} href={`/courses/${course.id}`}>
                  <div className="glass-sm p-4 hover:border-accent/40 transition-all cursor-pointer group">
                    <p className="font-medium text-ink text-sm line-clamp-2 group-hover:text-accent-400 transition-colors">{course.title}</p>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-ink-muted mb-1.5">
                        <span>התקדמות</span>
                        <span>{Math.round(course.progress_percentage)}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${course.progress_percentage}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
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
    <div className="flex items-center gap-3 p-4">
      <button
        onClick={() => onToggle(task.id, !task.is_completed)}
        className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
        style={task.is_completed
          ? { background: '#6366f1', borderColor: '#6366f1' }
          : { borderColor: 'rgba(255,255,255,0.2)' }}
      >
        {task.is_completed && <CheckSquare size={11} className="text-white" />}
      </button>
      <span className={`text-sm flex-1 transition-all ${task.is_completed ? 'line-through text-ink-muted' : 'text-ink'}`}>
        {task.title}
      </span>
      {task.duration_minutes && (
        <span className="text-xs text-ink-muted">{task.duration_minutes} דק׳</span>
      )}
    </div>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles = {
    high:   { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444', label: 'דחוף' },
    medium: { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b', label: 'בינוני' },
    low:    { bg: 'rgba(16,185,129,0.15)',  color: '#10b981', label: 'נמוך' },
  }
  const s = styles[priority as keyof typeof styles] || styles.medium
  return (
    <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: s.bg, color: s.color }}>
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

function EmptyState({ message, action }: { message: string; action?: { href: string; label: string } }) {
  return (
    <div className="p-8 text-center">
      <p className="text-ink-muted text-sm">{message}</p>
      {action && (
        <Link href={action.href}>
          <button className="mt-3 text-sm text-accent-400 hover:text-accent transition-colors">{action.label}</button>
        </Link>
      )}
    </div>
  )
}
