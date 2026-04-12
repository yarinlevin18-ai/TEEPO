'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen, CheckSquare, Clock, TrendingUp,
  Calendar, ArrowLeft, Plus,
} from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api-client'
import type { StudyTask, Course, Assignment } from '@/types'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

export default function DashboardPage() {
  const [tasks, setTasks] = useState<StudyTask[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    Promise.all([
      api.tasks.list(today),
      api.courses.list(),
      api.assignments.list(),
    ])
      .then(([t, c, a]) => {
        setTasks(t)
        setCourses(c)
        setAssignments(a)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [today])

  const completedToday = tasks.filter((t) => t.is_completed).length
  const urgentAssignments = assignments.filter(
    (a) => a.deadline && new Date(a.deadline) < new Date(Date.now() + 3 * 86400000) && a.status !== 'submitted'
  )

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          שלום! בוא נלמד היום 📚
        </h1>
        <p className="text-slate-500 mt-1">
          {format(new Date(), 'EEEE, d בMMMM yyyy', { locale: he })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'קורסים פעילים', value: courses.filter(c => c.status === 'active').length, icon: BookOpen, color: 'bg-blue-50 text-blue-600' },
          { label: 'משימות להיום', value: tasks.length, icon: CheckSquare, color: 'bg-green-50 text-green-600' },
          { label: 'הושלמו היום', value: completedToday, icon: TrendingUp, color: 'bg-purple-50 text-purple-600' },
          { label: 'מטלות דחופות', value: urgentAssignments.length, icon: Clock, color: 'bg-red-50 text-red-600' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-white rounded-2xl p-5 border border-surface-200 shadow-sm"
          >
            <div className={`inline-flex p-2.5 rounded-xl mb-3 ${stat.color}`}>
              <stat.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Today's Tasks */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-surface-100">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-primary-500" />
              <h2 className="font-semibold text-slate-800">משימות היום</h2>
            </div>
            <Link href="/tasks">
              <button className="text-xs text-primary-500 hover:underline flex items-center gap-1">
                הכל <ArrowLeft size={12} />
              </button>
            </Link>
          </div>
          <div className="divide-y divide-surface-100 max-h-72 overflow-y-auto">
            {loading ? (
              <LoadingSkeleton rows={3} />
            ) : tasks.length === 0 ? (
              <EmptyState
                message="אין משימות להיום"
                action={{ href: '/tasks', label: 'הוסף משימה' }}
              />
            ) : (
              tasks.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={(id, done) => {
                  setTasks(prev => prev.map(t => t.id === id ? { ...t, is_completed: done } : t))
                  api.tasks.update(id, { is_completed: done }).catch(console.error)
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
          className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-surface-100">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-amber-500" />
              <h2 className="font-semibold text-slate-800">מטלות קרובות</h2>
            </div>
            <Link href="/assignments">
              <button className="text-xs text-primary-500 hover:underline flex items-center gap-1">
                הכל <ArrowLeft size={12} />
              </button>
            </Link>
          </div>
          <div className="divide-y divide-surface-100 max-h-72 overflow-y-auto">
            {loading ? (
              <LoadingSkeleton rows={3} />
            ) : assignments.length === 0 ? (
              <EmptyState
                message="אין מטלות קרובות"
                action={{ href: '/assignments', label: 'הוסף מטלה' }}
              />
            ) : (
              assignments.slice(0, 5).map((a) => (
                <div key={a.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{a.title}</p>
                    {a.deadline && (
                      <p className="text-xs text-slate-400 mt-0.5">
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

      {/* Active Courses */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-surface-100">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-primary-500" />
            <h2 className="font-semibold text-slate-800">קורסים פעילים</h2>
          </div>
          <Link href="/courses/extract">
            <button className="text-xs text-primary-500 hover:underline flex items-center gap-1">
              <Plus size={12} /> הוסף קורס
            </button>
          </Link>
        </div>
        {loading ? (
          <div className="p-5"><LoadingSkeleton rows={2} /></div>
        ) : courses.length === 0 ? (
          <EmptyState
            message="עדיין לא הוספת קורסים"
            action={{ href: '/courses/extract', label: 'הוסף קורס ראשון' }}
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {courses.filter(c => c.status === 'active').map((course) => (
              <Link key={course.id} href={`/courses/${course.id}`}>
                <div className="border border-surface-200 rounded-xl p-4 hover:border-primary-300 hover:shadow-md transition-all cursor-pointer">
                  <p className="font-medium text-slate-800 text-sm line-clamp-2">{course.title}</p>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>התקדמות</span>
                      <span>{Math.round(course.progress_percentage)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-200 rounded-full">
                      <div
                        className="h-1.5 bg-primary-500 rounded-full transition-all"
                        style={{ width: `${course.progress_percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}

// ---- Sub-components ----

function TaskRow({ task, onToggle }: { task: StudyTask; onToggle: (id: string, done: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <button
        onClick={() => onToggle(task.id, !task.is_completed)}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          task.is_completed
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-slate-300 hover:border-primary-400'
        }`}
      >
        {task.is_completed && <CheckSquare size={12} />}
      </button>
      <span className={`text-sm flex-1 ${task.is_completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
        {task.title}
      </span>
      {task.duration_minutes && (
        <span className="text-xs text-slate-400">{task.duration_minutes} דק׳</span>
      )}
    </div>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors = { high: 'bg-red-100 text-red-600', medium: 'bg-amber-100 text-amber-600', low: 'bg-green-100 text-green-600' }
  const labels = { high: 'דחוף', medium: 'בינוני', low: 'נמוך' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[priority as keyof typeof colors] || colors.medium}`}>
      {labels[priority as keyof typeof labels] || priority}
    </span>
  )
}

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-surface-100 rounded-lg animate-pulse" />
      ))}
    </div>
  )
}

function EmptyState({ message, action }: { message: string; action?: { href: string; label: string } }) {
  return (
    <div className="p-8 text-center">
      <p className="text-slate-400 text-sm">{message}</p>
      {action && (
        <Link href={action.href}>
          <button className="mt-3 text-sm text-primary-500 hover:underline">{action.label}</button>
        </Link>
      )}
    </div>
  )
}
