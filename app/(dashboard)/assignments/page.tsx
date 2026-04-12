'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, FileText, ChevronDown, Loader2, Sparkles } from 'lucide-react'
import { api } from '@/lib/api-client'
import type { Assignment } from '@/types'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [breaking, setBreaking] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', deadline: '' })

  useEffect(() => {
    api.assignments.list()
      .then(setAssignments)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const breakdownAssignment = async () => {
    if (!form.title) return
    setBreaking(true)
    try {
      const result = await api.assignments.breakdown(form.title, form.description, form.deadline)
      const newAssignment: Assignment = {
        id: result.assignment_id,
        user_id: '',
        title: form.title,
        description: form.description,
        deadline: form.deadline,
        status: 'todo',
        priority: 'medium',
        assignment_tasks: result.tasks?.map((t: any, i: number) => ({
          id: `temp-${i}`,
          assignment_id: result.assignment_id,
          title: t.title,
          description: t.description,
          order_index: t.order || i + 1,
          is_completed: false,
          estimated_hours: t.estimated_hours,
        })),
      }
      setAssignments((prev) => [newAssignment, ...prev])
      setForm({ title: '', description: '', deadline: '' })
      setShowAdd(false)
      setExpanded(newAssignment.id)
    } catch (e: any) {
      alert('שגיאה: ' + e.message)
    } finally {
      setBreaking(false)
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

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">מטלות</h1>
        <button
          onClick={() => setShowAdd((p) => !p)}
          className="btn-gradient flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={16} /> מטלה חדשה
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass rounded-2xl p-6 space-y-4"
          >
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
                className="px-4 py-2.5 border border-white/8 rounded-xl text-sm text-ink-muted hover:text-ink hover:border-white/10 transition-colors"
              >
                ביטול
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 shimmer rounded-2xl" />)}
        </div>
      ) : assignments.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <FileText size={36} className="text-white/10 mx-auto mb-3" />
          <p className="text-ink-muted">אין מטלות עדיין</p>
          <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 hover:underline transition-colors">
            הוסף מטלה ראשונה
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <div
              key={a.id}
              className={`glass rounded-2xl overflow-hidden ${
                a.priority === 'high' ? 'priority-high' : a.priority === 'low' ? 'priority-low' : 'priority-medium'
              }`}
            >
              <button
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                className="w-full p-5 flex items-center gap-4 text-right hover:bg-white/[0.03] transition-colors"
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
