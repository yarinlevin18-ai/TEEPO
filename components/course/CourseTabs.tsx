'use client'

/**
 * Course workspace tabs — everything you can do inside a course.
 * Each panel is scoped to a single courseId.
 */

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckSquare, FileText, StickyNote, MessageCircle, Plus, Trash2,
  Loader2, Calendar, Send, Sparkles, Pencil, X,
  Download, Check, FileDown,
} from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import { useDB } from '@/lib/db-context'
import { useAuth } from '@/lib/auth-context'
import { exportNoteToWord } from '@/lib/export-to-word'
import type { Assignment, StudyTask, CourseNote, ChatMessage } from '@/types'
import { format } from 'date-fns'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

export type CourseTab = 'tasks' | 'assignments' | 'notes' | 'ai'

export const COURSE_TAB_META: { id: CourseTab; label: string; icon: any }[] = [
  { id: 'tasks',       label: 'משימות',   icon: CheckSquare  },
  { id: 'assignments', label: 'מטלות',    icon: FileText     },
  { id: 'notes',       label: 'סיכומים',  icon: StickyNote   },
  { id: 'ai',          label: 'עוזר AI',  icon: MessageCircle },
]

interface Props {
  courseId: string
  activeTab: CourseTab
  courseTitle: string
}

export default function CourseTabs({ courseId, activeTab, courseTitle }: Props) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18 }}
      >
        {activeTab === 'tasks'       && <TasksPanel courseId={courseId} />}
        {activeTab === 'assignments' && <AssignmentsPanel courseId={courseId} />}
        {activeTab === 'notes'       && <NotesPanel courseId={courseId} />}
        {activeTab === 'ai'          && <AIPanel courseId={courseId} courseTitle={courseTitle} />}
      </motion.div>
    </AnimatePresence>
  )
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED WORKSPACE — renders ALL panels stacked in one view
// ═══════════════════════════════════════════════════════════════

/**
 * Responsive 2-column workspace. On desktop: Lessons on the left (primary),
 * stacked Tasks/Assignments/AI on the right. Notes span full width beneath.
 * On mobile: everything stacks vertically.
 *
 * `lessonsSlot` is rendered as-is — we pass the existing lessons UI from
 * the course page so we don't have to re-implement it here.
 */
export function CourseWorkspace({
  courseId,
  courseTitle,
  lessonsSlot,
}: {
  courseId: string
  courseTitle: string
  lessonsSlot: React.ReactNode
}) {
  return (
    <div className="space-y-5">
      {/* Top grid: Lessons (left, wider) + side widgets */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* LEFT — Lessons */}
        <section className="min-w-0">{lessonsSlot}</section>

        {/* RIGHT — stacked side panels */}
        <aside className="space-y-5 min-w-0">
          <TasksPanel courseId={courseId} compact />
          <AssignmentsPanel courseId={courseId} compact />
          <AIPanel courseId={courseId} courseTitle={courseTitle} compact />
        </aside>
      </div>

      {/* Bottom — Notes (full width with rich editor) */}
      <section>
        <NotesPanel courseId={courseId} />
      </section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TASKS PANEL
// ═══════════════════════════════════════════════════════════════

function TasksPanel({ courseId, compact = false }: { courseId: string; compact?: boolean }) {
  const { db, createTask, updateTask, deleteTask } = useDB()
  const tasks = db.tasks.filter(t => t.course_id === courseId)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [scheduledDate, setScheduledDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const handleAdd = async () => {
    const t = title.trim()
    if (!t) return
    await createTask({
      title: t,
      course_id: courseId,
      scheduled_date: scheduledDate,
      category: 'study',
    })
    setTitle('')
    setAdding(false)
  }

  const pending = tasks.filter(t => !t.is_completed)
  const done = tasks.filter(t => t.is_completed)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <CheckSquare size={16} className="text-indigo-400" />
          משימות לקורס הזה
        </h2>
        <button onClick={() => setAdding(a => !a)}
          className="btn-gradient px-3.5 py-2 rounded-xl text-sm text-white font-medium flex items-center gap-1.5 shadow-lg shadow-indigo-500/20">
          <Plus size={15} /> משימה חדשה
        </button>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="glass rounded-xl p-4 space-y-3">
              <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
                placeholder="כותרת המשימה, למשל: לחזור על שיעור 3"
                className="input-dark w-full text-sm" />
              <div className="flex items-center gap-2">
                <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                  className="input-dark text-xs" dir="ltr" />
                <div className="flex-1" />
                <button onClick={() => { setAdding(false); setTitle('') }}
                  className="px-3 py-2 text-xs text-ink-muted hover:text-ink">ביטול</button>
                <button onClick={handleAdd} disabled={!title.trim()}
                  className="btn-gradient px-4 py-2 rounded-lg text-xs text-white font-medium disabled:opacity-40">הוסף</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="אין משימות לקורס הזה" hint="הוסף משימות ספציפיות שקשורות לקורס — חזרה, תרגול, פרויקט." />
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-1.5">
              {pending.map(t => <TaskRow key={t.id} task={t} onToggle={updateTask} onDelete={deleteTask} />)}
            </div>
          )}
          {done.length > 0 && (
            <details className="pt-2">
              <summary className="text-xs text-ink-muted cursor-pointer hover:text-ink">הושלמו ({done.length})</summary>
              <div className="space-y-1.5 mt-2">
                {done.map(t => <TaskRow key={t.id} task={t} onToggle={updateTask} onDelete={deleteTask} />)}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle, onDelete }: {
  task: StudyTask
  onToggle: (id: string, patch: Partial<StudyTask>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  return (
    <div className="glass rounded-xl px-3 py-2.5 flex items-center gap-3 group">
      <button
        onClick={() => onToggle(task.id, { is_completed: !task.is_completed })}
        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all ${
          task.is_completed ? 'bg-emerald-500/80 border-emerald-500' : 'border-white/15 hover:border-indigo-400'
        }`}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${task.is_completed ? 'text-ink-muted line-through' : 'text-ink'}`}>
          {task.title}
        </p>
        {task.scheduled_date && (
          <p className="text-[11px] text-ink-subtle flex items-center gap-1 mt-0.5">
            <Calendar size={10} /> {task.scheduled_date}
          </p>
        )}
      </div>
      <button onClick={() => onDelete(task.id)}
        className="p-1 rounded text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ASSIGNMENTS PANEL
// ═══════════════════════════════════════════════════════════════

function AssignmentsPanel({ courseId, compact = false }: { courseId: string; compact?: boolean }) {
  const { db, createAssignment, updateAssignment, deleteAssignment } = useDB()
  const assignments = db.assignments.filter(a => a.course_id === courseId)

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', deadline: '', priority: 'medium' as Assignment['priority'] })

  const handleAdd = async () => {
    if (!form.title.trim()) return
    await createAssignment({
      title: form.title.trim(),
      course_id: courseId,
      deadline: form.deadline || undefined,
      priority: form.priority,
    })
    setForm({ title: '', deadline: '', priority: 'medium' })
    setAdding(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <FileText size={16} className="text-indigo-400" />
          מטלות לקורס הזה
        </h2>
        <button onClick={() => setAdding(a => !a)}
          className="btn-gradient px-3.5 py-2 rounded-xl text-sm text-white font-medium flex items-center gap-1.5 shadow-lg shadow-indigo-500/20">
          <Plus size={15} /> מטלה חדשה
        </button>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="glass rounded-xl p-4 space-y-3">
              <input autoFocus type="text" value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder='שם המטלה, למשל "תרגיל בית 3"'
                className="input-dark w-full text-sm" />
              <div className="flex items-center gap-2">
                <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })}
                  className="input-dark text-xs" dir="ltr" />
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as Assignment['priority'] })}
                  className="text-xs bg-[#1e2330] border border-white/10 rounded-lg px-3 py-2 text-ink">
                  <option value="low">נמוכה</option>
                  <option value="medium">בינונית</option>
                  <option value="high">דחוף</option>
                </select>
                <div className="flex-1" />
                <button onClick={() => setAdding(false)} className="px-3 py-2 text-xs text-ink-muted hover:text-ink">ביטול</button>
                <button onClick={handleAdd} disabled={!form.title.trim()}
                  className="btn-gradient px-4 py-2 rounded-lg text-xs text-white font-medium disabled:opacity-40">הוסף</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {assignments.length === 0 ? (
        <EmptyState icon={FileText} title="אין מטלות לקורס הזה" hint="הוסף תרגילים, מבחנים ופרויקטים — TEEPO יזכיר לך לפני הדד-ליין." />
      ) : (
        <div className="space-y-2">
          {assignments.map(a => <AssignmentRow key={a.id} a={a} onUpdate={updateAssignment} onDelete={deleteAssignment} />)}
        </div>
      )}
    </div>
  )
}

function AssignmentRow({ a, onUpdate, onDelete }: {
  a: Assignment
  onUpdate: (id: string, patch: Partial<Assignment>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const priorityColors: Record<string, string> = {
    high: 'bg-red-500/10 text-red-400 border-red-500/20',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  }
  const statusColors: Record<string, string> = {
    todo: 'text-ink-muted',
    in_progress: 'text-indigo-400',
    submitted: 'text-emerald-400',
    graded: 'text-violet-400',
  }
  const statusLabels: Record<string, string> = {
    todo: 'לא התחיל',
    in_progress: 'בתהליך',
    submitted: 'הוגש',
    graded: 'נבדק',
  }

  return (
    <div className="glass rounded-xl p-4 group">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">{a.title}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${priorityColors[a.priority]}`}>
              {a.priority === 'high' ? 'דחוף' : a.priority === 'medium' ? 'בינוני' : 'רגיל'}
            </span>
            <select value={a.status} onChange={e => onUpdate(a.id, { status: e.target.value as Assignment['status'] })}
              className={`text-[10px] bg-transparent border-0 cursor-pointer ${statusColors[a.status]}`}>
              <option value="todo">לא התחיל</option>
              <option value="in_progress">בתהליך</option>
              <option value="submitted">הוגש</option>
              <option value="graded">נבדק</option>
            </select>
            {a.deadline && (
              <span className="text-[11px] text-ink-subtle flex items-center gap-1">
                <Calendar size={10} /> {a.deadline}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => onDelete(a.id)}
          className="p-1.5 rounded text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// NOTES PANEL
// ═══════════════════════════════════════════════════════════════

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function NotesPanel({ courseId }: { courseId: string }) {
  const { db, createNote, updateNote, deleteNote } = useDB()
  const notes = db.notes
    .filter(n => n.course_id === courseId)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  const [editing, setEditing] = useState<CourseNote | null>(null)
  const [newNote, setNewNote] = useState(false)
  const [form, setForm] = useState({ title: '', content: '' })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-save when editing an existing note (debounced 1.5s)
  useEffect(() => {
    if (!editing || !newNote) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Only auto-save if the content actually changed
    const unchanged = form.title === editing.title && form.content === editing.content
    if (unchanged || !form.title.trim()) return

    setSaveState('saving')
    debounceRef.current = setTimeout(async () => {
      try {
        await updateNote(editing.id, { title: form.title, content: form.content })
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2000)
      } catch {
        setSaveState('error')
      }
    }, 1500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title, form.content, editing?.id])

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaveState('saving')
    try {
      if (editing) {
        await updateNote(editing.id, { title: form.title, content: form.content })
      } else {
        await createNote(courseId, { title: form.title, content: form.content })
      }
      setSaveState('saved')
      setTimeout(() => {
        setForm({ title: '', content: '' })
        setNewNote(false)
        setEditing(null)
        setSaveState('idle')
      }, 700)
    } catch {
      setSaveState('error')
    }
  }

  const handleClose = () => {
    setNewNote(false)
    setEditing(null)
    setForm({ title: '', content: '' })
    setSaveState('idle')
  }

  const openEdit = (n: CourseNote) => {
    setEditing(n)
    setForm({ title: n.title, content: n.content })
    setNewNote(true)
    setSaveState('idle')
  }

  const handleExport = (n: CourseNote) => {
    exportNoteToWord({
      title: n.title,
      html: n.content,
      rtl: true,
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <StickyNote size={16} className="text-indigo-400" />
          סיכומים לקורס
          {notes.length > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-ink-muted font-normal">
              {notes.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => { setNewNote(true); setEditing(null); setForm({ title: '', content: '' }); setSaveState('idle') }}
          className="btn-gradient px-3.5 py-2 rounded-xl text-sm text-white font-medium flex items-center gap-1.5 shadow-lg shadow-indigo-500/20"
        >
          <Plus size={15} /> סיכום חדש
        </button>
      </div>

      <AnimatePresence>
        {newNote && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-2xl p-4 space-y-3">
              {/* Title + status row */}
              <div className="flex items-center gap-3">
                <input
                  autoFocus
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="כותרת הסיכום"
                  className="input-dark flex-1 text-base font-semibold"
                />
                <SaveIndicator state={saveState} />
              </div>

              {/* Rich text editor (replaces plain textarea) */}
              <RichTextEditor
                content={form.content}
                onChange={content => setForm(f => ({ ...f, content }))}
                placeholder="התחל לכתוב את הסיכום שלך כאן. אפשר להשתמש בכותרות, רשימות, הדגשות..."
              />

              {/* Action bar */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-[11px] text-ink-subtle flex items-center gap-1.5">
                  {editing ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      שמירה אוטומטית פעילה
                    </>
                  ) : (
                    <span>הסיכום יישמר כשתלחץ "צור"</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  {editing && form.content && (
                    <button
                      onClick={() => handleExport({ ...editing, ...form } as CourseNote)}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors"
                      title="הורד כמסמך Word"
                    >
                      <FileDown size={13} />
                      הורד כ-Word
                    </button>
                  )}
                  <button
                    onClick={handleClose}
                    className="px-3 py-2 text-xs text-ink-muted hover:text-ink"
                  >
                    סגור
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!form.title.trim() || saveState === 'saving'}
                    className="btn-gradient px-4 py-2 rounded-lg text-xs text-white font-medium disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {saveState === 'saving' ? <Loader2 size={12} className="animate-spin" /> : null}
                    {editing ? 'שמור' : 'צור סיכום'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {notes.length === 0 && !newNote ? (
        <EmptyState
          icon={StickyNote}
          title="אין סיכומים"
          hint="כתוב סיכומים חופשיים לקורס. לסיכומים לכל שיעור — השתמש ב'שיעורים'."
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {notes.map(n => {
            const plainText = n.content.replace(/<[^>]*>/g, '').trim()
            return (
              <div
                key={n.id}
                className="glass rounded-xl p-4 group hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <button
                    onClick={() => openEdit(n)}
                    className="text-sm font-semibold text-ink flex-1 text-right hover:text-indigo-300 transition-colors"
                  >
                    {n.title}
                  </button>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => handleExport(n)}
                      className="p-1.5 rounded text-ink-subtle hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                      title="הורד כ-Word"
                    >
                      <FileDown size={12} />
                    </button>
                    <button
                      onClick={() => deleteNote(n.id)}
                      className="p-1.5 rounded text-ink-subtle hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="מחק"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <p
                  className="text-xs text-ink-muted line-clamp-3 cursor-pointer"
                  onClick={() => openEdit(n)}
                >
                  {plainText || <span className="italic text-ink-subtle">סיכום ריק</span>}
                </p>
                <p className="text-[10px] text-ink-subtle mt-2">
                  עודכן {new Date(n.updated_at).toLocaleDateString('he-IL')}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Tiny pill that animates through saving → saved → idle. */
function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null

  const config: Record<Exclude<SaveState, 'idle'>, { icon: any; label: string; color: string; bg: string }> = {
    saving: { icon: Loader2, label: 'שומר…', color: '#B8A9FF', bg: 'rgba(139,127,240,0.15)' },
    saved:  { icon: Check,   label: 'נשמר',  color: '#4ADE80', bg: 'rgba(74,222,128,0.15)' },
    error:  { icon: X,       label: 'שגיאה', color: '#FF6B6B', bg: 'rgba(255,107,107,0.15)' },
  }
  const c = config[state]
  const Icon = c.icon

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-medium flex-shrink-0"
      style={{ color: c.color, background: c.bg }}
    >
      <Icon size={11} className={state === 'saving' ? 'animate-spin' : ''} />
      {c.label}
    </motion.span>
  )
}

// ═══════════════════════════════════════════════════════════════
// AI PANEL — inline chat scoped to this course
// ═══════════════════════════════════════════════════════════════

function AIPanel({ courseId, courseTitle, compact = false }: { courseId: string; courseTitle: string; compact?: boolean }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const socket = io(BACKEND, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join', { user_id: user?.id || 'anonymous', agent_type: 'study_buddy' })
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connected', () => {
      if (messages.length === 0) {
        setMessages([{ role: 'assistant', content: `היי! אני כאן כדי לעזור לך עם "${courseTitle}". תשאל כל שאלה על החומר, בקש הסבר, או עזרה בתרגיל.` }])
      }
    })
    socket.on('history_loaded', ({ messages: hist }) => {
      if (hist && hist.length > 0) setMessages(hist)
    })
    socket.on('typing', () => setTyping(true))
    socket.on('reply', ({ text }: { text: string }) => {
      setTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', content: text }])
    })
    socket.on('error', ({ message }: { message: string }) => {
      setTyping(false)
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${message}` }])
    })

    return () => { socket.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  const send = () => {
    const text = input.trim()
    if (!text || !socketRef.current) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    socketRef.current.emit('message', { text, agent_type: 'study_buddy', course_id: courseId })
    setInput('')
    setTyping(true)
  }

  return (
    <div
      className="glass rounded-2xl overflow-hidden flex flex-col"
      style={{ height: compact ? 'min(55vh, 420px)' : 'min(70vh, 560px)' }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg btn-gradient flex items-center justify-center">
            <Sparkles size={14} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">TEEPO AI</p>
            <p className="text-[10px] text-ink-muted">
              {connected ? 'מוכן לעזור' : 'מתחבר...'}
            </p>
          </div>
        </div>
        <button onClick={() => setMessages([])} className="text-[11px] text-ink-subtle hover:text-ink">נקה שיחה</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
              m.role === 'user'
                ? 'bg-indigo-500/20 text-ink border border-indigo-500/20'
                : 'bg-white/5 text-ink border border-white/5'
            }`} style={{ whiteSpace: 'pre-wrap' }}>
              {m.content}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-end">
            <div className="bg-white/5 border border-white/5 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/5 flex items-end gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="שאל שאלה על הקורס..."
          rows={1}
          className="input-dark flex-1 text-sm resize-none max-h-28"
        />
        <button
          onClick={send}
          disabled={!input.trim() || !connected}
          className="btn-gradient p-2.5 rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════

function EmptyState({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-10 text-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-6 right-10 w-20 h-20 rounded-full bg-indigo-500/10 blur-2xl" />
        <div className="absolute bottom-8 left-12 w-16 h-16 rounded-full bg-violet-500/10 blur-2xl" />
      </div>
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-3">
          <Icon size={24} className="text-indigo-400" />
        </div>
        <h3 className="text-base font-semibold text-ink mb-1">{title}</h3>
        <p className="text-xs text-ink-muted max-w-sm mx-auto">{hint}</p>
      </div>
    </motion.div>
  )
}
