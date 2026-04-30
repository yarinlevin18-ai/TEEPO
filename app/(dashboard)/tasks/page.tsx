'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import {
  Plus, CheckSquare, Trash2, Calendar, Sparkles,
  Target, Flame, Coffee, ChevronLeft, ChevronRight,
  Clock, BookOpen, Dumbbell, Star, Zap, Pencil,
} from 'lucide-react'
import { useDB } from '@/lib/db-context'
import Modal from '@/components/ui/Modal'
import GlowCard from '@/components/ui/GlowCard'
import ErrorAlert from '@/components/ui/ErrorAlert'
import type { StudyTask } from '@/types'
import { format, addDays, subDays, isToday, isTomorrow, isYesterday } from 'date-fns'
import { he } from 'date-fns/locale'

const CATEGORIES = [
  { key: 'study',    label: 'לימודים', icon: BookOpen,  color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
  { key: 'exercise', label: 'ספורט',   icon: Dumbbell,  color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  { key: 'personal', label: 'אישי',    icon: Star,      color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  { key: 'urgent',   label: 'דחוף',    icon: Zap,       color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
]

function getCategoryInfo(cat?: string) {
  return CATEGORIES.find(c => c.key === cat) || CATEGORIES[0]
}

const CATEGORY_GLOW: Record<string, string> = {
  urgent:   'rgba(239,68,68,0.10)',
  personal: 'rgba(245,158,11,0.10)',
  exercise: 'rgba(16,185,129,0.10)',
  // study uses the default indigo glow
}

function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  if (isToday(d)) return 'היום'
  if (isTomorrow(d)) return 'מחר'
  if (isYesterday(d)) return 'אתמול'
  return format(d, 'EEEE, d בMMM', { locale: he })
}

function getMotivation(completed: number, total: number): { text: string; icon: any } {
  if (total === 0) return { text: 'יום חדש, הזדמנויות חדשות!', icon: Coffee }
  const pct = (completed / total) * 100
  if (pct === 100) return { text: 'מדהים! סיימת הכל היום!', icon: Flame }
  if (pct >= 75) return { text: 'כמעט שם! עוד קצת!', icon: Target }
  if (pct >= 50) return { text: 'חצי מהדרך! ממשיכים!', icon: Sparkles }
  if (pct >= 25) return { text: 'התחלה טובה! קדימה!', icon: Zap }
  return { text: 'בוא נתחיל את היום!', icon: Coffee }
}

export default function TasksPage() {
  const {
    db, loading: dbLoading, ready: dbReady, error: dbError,
    createTask, updateTask, deleteTask: dbDeleteTask,
  } = useDB()

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('study')
  const [addingTask, setAddingTask] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateOffset, setDateOffset] = useState(0)
  const [editingTask, setEditingTask] = useState<StudyTask | null>(null)
  const [editForm, setEditForm] = useState({ title: '', category: 'study', duration_minutes: '' })
  const [saving, setSaving] = useState(false)

  const loading = dbLoading || !dbReady
  const tasks = db.tasks.filter(t => t.scheduled_date === selectedDate)

  useEffect(() => {
    if (dbError) setError(dbError)
  }, [dbError])

  const addTask = async () => {
    if (!newTitle.trim()) return
    setError(null)
    try {
      await createTask({
        title: newTitle.trim(),
        scheduled_date: selectedDate,
        category: newCategory as StudyTask['category'],
      })
      setNewTitle('')
      setAddingTask(false)
    } catch {
      setError('שגיאה בהוספת המשימה. נסה שוב.')
    }
  }

  const toggleTask = async (id: string, done: boolean) => {
    try {
      await updateTask(id, { is_completed: done })
    } catch {
      setError('שגיאה בעדכון המשימה. נסה שוב.')
    }
  }

  const deleteTask = async (id: string) => {
    try {
      await dbDeleteTask(id)
    } catch {
      setError('שגיאה במחיקת המשימה. נסה שוב.')
    }
  }

  const openEdit = (task: StudyTask) => {
    setEditForm({
      title: task.title,
      category: task.category || 'study',
      duration_minutes: task.duration_minutes?.toString() || '',
    })
    setEditingTask(task)
  }

  const saveEdit = async () => {
    if (!editingTask) return
    setSaving(true)
    try {
      await updateTask(editingTask.id, {
        title: editForm.title,
        category: editForm.category as StudyTask['category'],
        duration_minutes: editForm.duration_minutes ? parseInt(editForm.duration_minutes) : undefined,
      })
      setEditingTask(null)
    } catch {
      setError('שגיאה בשמירת השינויים. נסה שוב.')
    } finally {
      setSaving(false)
    }
  }

  // Build a 7-day strip
  const today = new Date()
  const baseDate = addDays(today, dateOffset)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(subDays(baseDate, 3), i)
    return {
      date: format(d, 'yyyy-MM-dd'),
      label: format(d, 'EEE', { locale: he }),
      num: format(d, 'd'),
      isToday: isToday(d),
    }
  })

  const completed = tasks.filter((t) => t.is_completed).length
  const pct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0
  const motivation = getMotivation(completed, tasks.length)
  const MotivIcon = motivation.icon

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-6 animate-fade-in">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <CheckSquare size={18} className="text-indigo-400" />
            </div>
            המשימות שלי
          </h1>
          <p className="text-sm text-ink-muted mt-1">{getDateLabel(selectedDate)}</p>
        </div>
        <button
          onClick={() => setAddingTask(true)}
          className="btn-gradient px-4 py-2.5 rounded-xl text-sm text-white font-medium flex items-center gap-2 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all"
        >
          <Plus size={16} />
          משימה חדשה
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Date navigation */}
      <div className="flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setDateOffset(o => o - 30)}
          className="p-2.5 rounded-xl glass text-ink-muted hover:text-ink hover:bg-white/[0.08] transition-colors"
          title="חודש קודם"
        >
          <ChevronRight size={16} />
        </motion.button>

        <LayoutGroup>
          <div className="flex gap-2 flex-1 overflow-x-auto pb-1 justify-center">
            <AnimatePresence mode="popLayout">
              {days.map((d, i) => {
                const isSelected = d.date === selectedDate
                return (
                  <motion.button
                    key={d.date}
                    layout
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: isSelected ? 1.08 : 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.8 }}
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 25,
                      delay: i * 0.04,
                    }}
                    whileHover={!isSelected ? { scale: 1.06, y: -2 } : {}}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedDate(d.date)}
                    className={`relative flex flex-col items-center min-w-[56px] py-3 px-3.5 rounded-2xl transition-colors ${
                      isSelected
                        ? 'text-white'
                        : d.isToday
                          ? 'glass text-indigo-400 border-indigo-500/30'
                          : 'glass text-ink-muted hover:text-ink'
                    }`}
                  >
                    {/* Animated gradient background for selected */}
                    {isSelected && (
                      <motion.div
                        layoutId="dateHighlight"
                        className="absolute inset-0 rounded-2xl"
                        style={{
                          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
                          boxShadow: '0 8px 32px rgba(99,102,241,0.35), 0 0 60px rgba(139,92,246,0.15)',
                        }}
                        transition={{
                          type: 'spring',
                          stiffness: 350,
                          damping: 30,
                        }}
                      />
                    )}

                    {/* Pulse ring on today */}
                    {d.isToday && !isSelected && (
                      <motion.div
                        className="absolute inset-0 rounded-2xl border border-indigo-500/40"
                        animate={{
                          boxShadow: [
                            '0 0 0 0 rgba(99,102,241,0.3)',
                            '0 0 0 6px rgba(99,102,241,0)',
                          ]
                        }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                      />
                    )}

                    <span className="relative z-10 text-[10px] uppercase tracking-wider opacity-80 font-medium">
                      {d.label}
                    </span>
                    <span className="relative z-10 text-lg font-bold mt-0.5">{d.num}</span>

                    {/* Today dot indicator */}
                    {d.isToday && !isSelected && (
                      <motion.div
                        className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-indigo-400"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                  </motion.button>
                )
              })}
            </AnimatePresence>
          </div>
        </LayoutGroup>

        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setDateOffset(o => o + 30)}
          className="p-2.5 rounded-xl glass text-ink-muted hover:text-ink hover:bg-white/[0.08] transition-colors"
          title="חודש הבא"
        >
          <ChevronLeft size={16} />
        </motion.button>
      </div>

      {/* Today button */}
      <AnimatePresence>
        {dateOffset !== 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            className="flex justify-center"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setDateOffset(0); setSelectedDate(format(new Date(), 'yyyy-MM-dd')) }}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-full glass"
              title="חזרה להיום"
            >
              <Calendar size={12} /> חזרה להיום
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress card */}
      {tasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlowCard glowColor={pct === 100 ? "rgba(16,185,129,0.10)" : undefined}>
            <div className="p-5 relative">
              {/* Background glow on completion */}
              {pct === 100 && (
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-indigo-500/5" />
              )}
              <div className="relative flex items-center gap-5">
                {/* Circular progress */}
                <div className="relative w-16 h-16 flex-shrink-0">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
                    <circle
                      cx="32" cy="32" r="28" fill="none"
                      stroke="url(#progressGrad)" strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${pct * 1.76} 176`}
                      className="transition-all duration-700"
                    />
                    <defs>
                      <linearGradient id="progressGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold gradient-text">{pct}%</span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <MotivIcon size={16} className="text-indigo-400" />
                    <p className="text-sm font-medium text-ink">{motivation.text}</p>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {completed} מתוך {tasks.length} משימות הושלמו
                  </p>
                  <div className="mt-2.5 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </GlowCard>
        </motion.div>
      )}

      {/* New task input */}
      <AnimatePresence>
        {addingTask && (
          <motion.div
            initial={{ height: 0, opacity: 0, scale: 0.95 }}
            animate={{ height: 'auto', opacity: 1, scale: 1 }}
            exit={{ height: 0, opacity: 0, scale: 0.95 }}
            className="overflow-hidden"
          >
            <GlowCard>
              <div className="p-5 space-y-4">
                <p className="text-sm font-semibold text-ink flex items-center gap-2">
                  <Sparkles size={14} className="text-indigo-400" />
                  משימה חדשה
                </p>
                <input
                  autoFocus
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAddingTask(false) }}
                  placeholder="מה צריך לעשות?"
                  className="input-dark w-full text-sm"
                  dir="rtl"
                />
                {/* Category picker */}
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.key}
                      onClick={() => setNewCategory(cat.key)}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all ${
                        newCategory === cat.key
                          ? 'ring-1 ring-offset-0'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{
                        background: cat.bg,
                        color: cat.color,
                        ...(newCategory === cat.key ? { ringColor: cat.color } : {}),
                      }}
                    >
                      <cat.icon size={12} />
                      {cat.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setAddingTask(false)}
                    className="px-4 py-2 border border-white/10 rounded-xl text-sm text-ink-muted hover:text-ink hover:border-white/15 transition-colors"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={addTask}
                    className="btn-gradient px-5 py-2 rounded-lg text-sm text-white font-medium"
                  >
                    הוסף משימה
                  </button>
                </div>
              </div>
            </GlowCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task list */}
      <div className="space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <GlowCard key={i}>
                <div className="p-4 flex items-center gap-3">
                  <div className="w-5 h-5 shimmer rounded-md" />
                  <div className="flex-1 h-4 shimmer rounded-lg" />
                </div>
              </GlowCard>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          /* Beautiful empty state */
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <GlowCard>
              <div className="p-10 text-center relative">
                {/* Decorative background */}
                <div className="absolute inset-0 opacity-30">
                  <div className="absolute top-6 right-10 w-20 h-20 rounded-full bg-indigo-500/10 blur-2xl" />
                  <div className="absolute bottom-8 left-12 w-16 h-16 rounded-full bg-violet-500/10 blur-2xl" />
                </div>

                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
                    <Coffee size={28} className="text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-ink mb-1">אין משימות {isToday(new Date(selectedDate + 'T00:00:00')) ? 'להיום' : 'ליום זה'}</h3>
                  <p className="text-sm text-ink-muted mb-5 max-w-xs mx-auto">
                    {isToday(new Date(selectedDate + 'T00:00:00'))
                      ? 'היום יום מצוין להתחיל משהו חדש! הוסף משימה ותתחיל להתקדם.'
                      : 'הוסף משימות כדי לתכנן את היום שלך.'}
                  </p>
                  <button
                    onClick={() => setAddingTask(true)}
                    className="btn-gradient px-5 py-2.5 rounded-xl text-sm text-white font-medium inline-flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                  >
                    <Plus size={16} />
                    הוסף משימה ראשונה
                  </button>
                </div>
              </div>
            </GlowCard>
          </motion.div>
        ) : (
          <AnimatePresence>
            {/* Pending tasks first, then completed */}
            {[...tasks].sort((a, b) => Number(a.is_completed) - Number(b.is_completed)).map((task, i) => {
              const cat = getCategoryInfo(task.category)
              const CatIcon = cat.icon
              return (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12, height: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={task.is_completed ? 'opacity-60' : ''}
                >
                  <GlowCard glowColor={task.is_completed ? undefined : CATEGORY_GLOW[task.category || 'study']}>
                    <div className={`p-4 flex items-center gap-3 group transition-all ${
                      task.is_completed ? '' : 'hover:border-white/10'
                    }`}>
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleTask(task.id, !task.is_completed)}
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          task.is_completed
                            ? 'border-indigo-500 bg-indigo-500 shadow-sm shadow-indigo-500/30'
                            : 'border-white/20 hover:border-indigo-400 hover:shadow-sm hover:shadow-indigo-500/20'
                        }`}
                      >
                        {task.is_completed && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                            <CheckSquare size={12} className="text-white" />
                          </motion.div>
                        )}
                      </button>

                      {/* Category icon */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: cat.bg }}
                      >
                        <CatIcon size={14} style={{ color: cat.color }} />
                      </div>

                      {/* Title */}
                      <span className={`flex-1 text-sm transition-all ${
                        task.is_completed ? 'line-through text-ink-muted' : 'text-ink'
                      }`}>
                        {task.title}
                      </span>

                      {/* Duration */}
                      {task.duration_minutes && (
                        <span className="text-[11px] text-ink-subtle flex items-center gap-1 flex-shrink-0">
                          <Clock size={10} />
                          {task.duration_minutes} דק׳
                        </span>
                      )}

                      {/* Edit */}
                      <button
                        onClick={() => openEdit(task)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-ink-muted hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
                        title="ערוך משימה"
                      >
                        <Pencil size={14} />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-ink-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="מחק משימה"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </GlowCard>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Completed summary at bottom */}
      {tasks.length > 0 && completed > 0 && completed < tasks.length && (
        <p className="text-center text-xs text-ink-subtle">
          {completed} משימות הושלמו מתוך {tasks.length}
        </p>
      )}

      {/* Quick-edit modal */}
      <Modal
        open={!!editingTask}
        onClose={() => setEditingTask(null)}
        title="עריכת משימה"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setEditingTask(null)}
              className="px-4 py-2 border border-white/10 rounded-xl text-sm text-ink-muted hover:text-ink hover:border-white/15 transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="btn-gradient px-5 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50"
            >
              {saving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        }
      >
        <div className="space-y-4" dir="rtl">
          <input
            autoFocus
            type="text"
            value={editForm.title}
            onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit() }}
            placeholder="כותרת המשימה"
            className="input-dark w-full text-sm"
          />

          <div className="space-y-1.5">
            <label className="text-xs text-ink-muted">קטגוריה</label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setEditForm(f => ({ ...f, category: cat.key }))}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all ${
                    editForm.category === cat.key
                      ? 'ring-1 ring-offset-0'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                  style={{
                    background: cat.bg,
                    color: cat.color,
                    ...(editForm.category === cat.key ? { ringColor: cat.color } : {}),
                  }}
                >
                  <cat.icon size={12} />
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-ink-muted">משך (דקות)</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={editForm.duration_minutes}
              onChange={(e) => setEditForm(f => ({ ...f, duration_minutes: e.target.value }))}
              className="input-dark w-full text-sm"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
