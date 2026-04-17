'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, FileText, ChevronDown, Loader2, Sparkles, Search, Pencil } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useDB } from '@/lib/db-context'
import ErrorAlert from '@/components/ui/ErrorAlert'
import GlowCard from '@/components/ui/GlowCard'
import Modal from '@/components/ui/Modal'
import type { Assignment } from '@/types'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

type StatusFilter = 'all' | 'todo' | 'in_progress' | 'submitted' | 'graded'
type PriorityFilter = 'all' | 'high' | 'medium' | 'low'
type SortOption = 'deadline' | 'priority' | 'name' | 'progress'

export default function AssignmentsPage() {
  const {
    db, loading: dbLoading, ready: dbReady, error: dbError,
    createAssignment, updateAssignment,
  } = useDB()

  const assignments = db.assignments
  const loading = dbLoading || !dbReady

  const [showAdd, setShowAdd] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [breaking, setBreaking] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', deadline: '' })
  const [error, setError] = useState<string | null>(null)
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', deadline: '', status: '', priority: '' })
  const [saving, setSaving] = useState(false)

  // Filter & sort state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('deadline')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (dbError) setError(dbError)
  }, [dbError])

  const breakdownAssignment = async () => {
    if (!form.title) return
    setBreaking(true)
    try {
      // Call AI backend to break down the assignment into subtasks
      let subtasks: any[] = []
      try {
        const result = await api.assignments.breakdown(form.title, form.description, form.deadline)
        subtasks = result?.tasks || []
      } catch {
        // AI unavailable — create without breakdown
      }

      const created = await createAssignment({
        title: form.title,
        description: form.description,
        deadline: form.deadline,
        status: 'todo',
        priority: 'medium',
        assignment_tasks: subtasks.map((t: any, i: number) => ({
          id: `at_${Date.now()}_${i}`,
          assignment_id: '', // filled in below
          title: t.title,
          description: t.description,
          order_index: t.order || i + 1,
          is_completed: false,
          estimated_hours: t.estimated_hours,
        })),
      })
      setForm({ title: '', description: '', deadline: '' })
      setShowAdd(false)
      setExpanded(created.id)
    } catch {
      setError('שגיאה בפירוק המטלה. נסה שוב.')
    } finally {
      setBreaking(false)
    }
  }

  const openEdit = (a: Assignment) => {
    setEditForm({
      title: a.title,
      description: a.description || '',
      deadline: a.deadline || '',
      status: a.status,
      priority: a.priority,
    })
    setEditingAssignment(a)
  }

  const saveEdit = async () => {
    if (!editingAssignment) return
    setSaving(true)
    try {
      await updateAssignment(editingAssignment.id, {
        title: editForm.title,
        description: editForm.description,
        deadline: editForm.deadline || undefined,
        status: editForm.status as Assignment['status'],
        priority: editForm.priority as Assignment['priority'],
      })
      setEditingAssignment(null)
    } catch {
      setError('שגיאה בשמירת השינויים. נסה שוב.')
    } finally {
      setSaving(false)
    }
  }

  const priorityLabels = { high: 'דחוף', medium: 'בינוני', low: 'נמוך' }
  const priorityBadgeColors: Record<string, string> = {
    high: 'bg-red-500/10 text-red-400 border border-red-500/20',
    medium: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    low: 'bg-green-500/10 text-green-400 border border-green-500/20',
  }
  const statusColors: Record<string, string> = {
    todo: 'bg-white/5 text-ink-muted',
    in_progress: 'bg-blue-500/10 text-blue-400',
    submitted: 'bg-green-500/10 text-green-400',
    graded: 'bg-violet-500/10 text-violet-400',
  }
  const statusLabels: Record<string, string> = { todo: 'לא התחלתי', in_progress: 'בתהליך', submitted: 'הוגש', graded: 'נבדק' }

  const statusFilterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'הכל' },
    { value: 'todo', label: 'לא התחלתי' },
    { value: 'in_progress', label: 'בתהליך' },
    { value: 'submitted', label: 'הוגש' },
    { value: 'graded', label: 'נבדק' },
  ]

  const priorityFilterOptions: { value: PriorityFilter; label: string }[] = [
    { value: 'all', label: 'הכל' },
    { value: 'high', label: 'גבוהה' },
    { value: 'medium', label: 'בינונית' },
    { value: 'low', label: 'נמוכה' },
  ]

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'deadline', label: 'תאריך הגשה' },
    { value: 'priority', label: 'עדיפות' },
    { value: 'name', label: 'שם' },
    { value: 'progress', label: 'התקדמות' },
  ]

  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }

  const filteredAssignments = useMemo(() => {
    return assignments
      .filter(a => statusFilter === 'all' || a.status === statusFilter)
      .filter(a => priorityFilter === 'all' || a.priority === priorityFilter)
      .filter(a => !searchQuery || a.title.includes(searchQuery))
      .sort((a, b) => {
        switch (sortBy) {
          case 'deadline': {
            if (!a.deadline) return 1
            if (!b.deadline) return -1
            return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
          }
          case 'priority':
            return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1)
          case 'name':
            return a.title.localeCompare(b.title, 'he')
          case 'progress': {
            const progA = a.assignment_tasks?.length
              ? a.assignment_tasks.filter(t => t.is_completed).length / a.assignment_tasks.length
              : 0
            const progB = b.assignment_tasks?.length
              ? b.assignment_tasks.filter(t => t.is_completed).length / b.assignment_tasks.length
              : 0
            return progB - progA
          }
          default:
            return 0
        }
      })
  }, [assignments, statusFilter, priorityFilter, searchQuery, sortBy])

  const pillClass = (active: boolean) =>
    active
      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
      : 'bg-white/5 text-slate-400 border border-white/[0.08] hover:bg-white/[0.08]'

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">מטלות</h1>
        <button
          onClick={() => setShowAdd((p) => !p)}
          className="btn-gradient flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={16} /> מטלה חדשה
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Filter / Sort Bar */}
      {!loading && assignments.length > 0 && (
        <div
          dir="rtl"
          className="rounded-2xl border border-white/[0.08] p-4 space-y-3"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          {/* Row 1: Status filter */}
          <div className="flex flex-wrap gap-3 items-center min-h-[36px]">
            <span className="text-xs font-medium text-slate-400 ml-1">סטטוס:</span>
            {statusFilterOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${pillClass(statusFilter === opt.value)}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Row 2: Priority filter */}
          <div className="flex flex-wrap gap-3 items-center min-h-[36px]">
            <span className="text-xs font-medium text-slate-400 ml-1">עדיפות:</span>
            {priorityFilterOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPriorityFilter(opt.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${pillClass(priorityFilter === opt.value)}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Row 3: Sort + Search */}
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-xs font-medium text-slate-400 ml-1">מיון:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              className="bg-white/5 border border-white/[0.08] text-slate-300 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500/40 transition-colors"
              style={{ color: '#f1f5f9' }}
            >
              {sortOptions.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                  {opt.label}
                </option>
              ))}
            </select>

            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="חיפוש מטלה..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/[0.08] text-sm rounded-lg pr-9 pl-3 py-1.5 outline-none placeholder:text-slate-500 focus:border-indigo-500/40 transition-colors"
                style={{ color: '#f1f5f9' }}
              />
            </div>
          </div>

          {/* Result count */}
          <p className="text-xs" style={{ color: '#64748b' }}>
            מציג {filteredAssignments.length} מתוך {assignments.length} מטלות
          </p>
        </div>
      )}

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <GlowCard>
              <div className="p-6 space-y-4">
                <h2 className="font-semibold text-ink">מטלה חדשה + פירוק AI</h2>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="שם המטלה *"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="input-dark w-full"
                  />
                  <textarea
                    placeholder="תיאור המטלה (אופציונלי)"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    className="input-dark w-full resize-none"
                  />
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    className="input-dark w-full"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={breakdownAssignment}
                    disabled={!form.title || breaking}
                    className="btn-gradient flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                  >
                    {breaking ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {breaking ? 'מפרק...' : 'פרק למשימות עם AI'}
                  </button>
                  <button
                    onClick={() => setShowAdd(false)}
                    className="px-4 py-2 border border-white/10 rounded-xl text-sm text-ink-muted hover:text-ink hover:border-white/15 transition-colors"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            </GlowCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 shimmer rounded-2xl" />)}
        </div>
      ) : filteredAssignments.length === 0 && assignments.length === 0 ? (
        <GlowCard>
          <div className="p-12 text-center">
            <FileText size={36} className="text-white/10 mx-auto mb-3" />
            <p className="text-ink-muted">אין מטלות עדיין</p>
            <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 hover:underline transition-colors">
              הוסף מטלה ראשונה
            </button>
          </div>
        </GlowCard>
      ) : filteredAssignments.length === 0 ? (
        <GlowCard>
          <div className="p-12 text-center">
            <Search size={36} className="text-white/10 mx-auto mb-3" />
            <p className="text-ink-muted">לא נמצאו מטלות תואמות לסינון</p>
            <button
              onClick={() => { setStatusFilter('all'); setPriorityFilter('all'); setSearchQuery('') }}
              className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
            >
              נקה סינונים
            </button>
          </div>
        </GlowCard>
      ) : (
        <div className="space-y-3">
          {filteredAssignments.map((a) => (
            <GlowCard
              key={a.id}
              glowColor={
                a.priority === 'high'
                  ? 'rgba(239,68,68,0.10)'
                  : a.priority === 'low'
                  ? 'rgba(16,185,129,0.10)'
                  : 'rgba(245,158,11,0.10)'
              }
            >
              <button
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                className="group w-full p-5 flex items-center gap-4 text-right hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-ink text-sm">{a.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${priorityBadgeColors[a.priority] || priorityBadgeColors.medium}`}>
                      {priorityLabels[a.priority] || a.priority}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[a.status] || statusColors.todo}`}>
                      {statusLabels[a.status] || a.status}
                    </span>
                  </div>
                  {a.deadline && (
                    <p className="text-xs text-ink-muted mt-1">
                      הגשה: {format(new Date(a.deadline), 'd בMMM yyyy', { locale: he })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {a.assignment_tasks && (
                    <span className="text-xs text-ink-muted">
                      {a.assignment_tasks.filter((t) => t.is_completed).length}/{a.assignment_tasks.length} ✓
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(a) }}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-ink-subtle hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="ערוך מטלה"
                  >
                    <Pencil size={14} />
                  </button>
                  <ChevronDown
                    size={16}
                    className={`text-ink-muted transition-transform ${expanded === a.id ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>

              <AnimatePresence>
                {expanded === a.id && a.assignment_tasks && a.assignment_tasks.length > 0 && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden border-t border-white/5"
                  >
                    <div className="p-4 space-y-2">
                      {a.assignment_tasks.map((task, i) => (
                        <div key={task.id} className="flex items-start gap-3 p-3 bg-white/[0.03] rounded-xl border border-white/5">
                          <span className="w-6 h-6 rounded-full bg-indigo-500/15 text-indigo-400 text-xs flex items-center justify-center flex-shrink-0 font-medium">
                            {i + 1}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-ink">{task.title}</p>
                            {task.description && (
                              <p className="text-xs text-ink-muted mt-0.5">{task.description}</p>
                            )}
                          </div>
                          {task.estimated_hours && (
                            <span className="text-xs text-ink-muted flex-shrink-0">{task.estimated_hours}ש׳</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlowCard>
          ))}
        </div>
      )}

      {/* Edit Assignment Modal */}
      <Modal
        open={!!editingAssignment}
        onClose={() => setEditingAssignment(null)}
        title="עריכת מטלה"
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setEditingAssignment(null)}
              className="px-4 py-2 border border-white/10 rounded-xl text-sm text-ink-muted hover:text-ink hover:border-white/15 transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="btn-gradient flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              שמור שינויים
            </button>
          </div>
        }
      >
        <div className="space-y-4" dir="rtl">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">כותרת</label>
            <input
              type="text"
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="input-dark w-full"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">תיאור</label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              rows={3}
              className="input-dark w-full resize-none"
            />
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">תאריך הגשה</label>
            <input
              type="date"
              value={editForm.deadline}
              onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
              className="input-dark w-full"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">סטטוס</label>
            <div className="flex gap-2">
              {(['todo', 'in_progress', 'submitted', 'graded'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, status: s })}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${statusColors[s]} ${
                    editForm.status === s
                      ? 'ring-2 ring-offset-0 ring-offset-[#0f1117] ' +
                        (s === 'todo' ? 'ring-white/20' : s === 'in_progress' ? 'ring-blue-400' : s === 'submitted' ? 'ring-green-400' : 'ring-violet-400')
                      : ''
                  }`}
                >
                  {statusLabels[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">עדיפות</label>
            <div className="flex gap-2">
              {(['high', 'medium', 'low'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, priority: p })}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${priorityBadgeColors[p]} ${
                    editForm.priority === p
                      ? 'ring-2 ring-offset-0 ring-offset-[#0f1117] ' +
                        (p === 'high' ? 'ring-red-400' : p === 'medium' ? 'ring-amber-400' : 'ring-green-400')
                      : ''
                  }`}
                >
                  {priorityLabels[p]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
