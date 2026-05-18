'use client'

/**
 * Course workspace mini-cards — `TasksMini` and `AssignmentsMini`.
 *
 * Originally this file held a full tabbed workspace (tasks / assignments /
 * notes / AI chat). The notes tab moved to per-lesson summaries, and the
 * AI chat panel was retired together with the lesson notebook page. The
 * course detail page now embeds just the two compact lists below.
 *
 * Both cards are inline-add: type → Enter → row appears. No modals, no
 * "+ click → form → submit" flows. Empty states are one-line hints.
 */

import { CheckSquare, FileText, Trash2, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { useDB } from '@/lib/db-context'
import QuickAddInput from './QuickAddInput'
import type { Assignment, StudyTask } from '@/types'

// ═══════════════════════════════════════════════════════════════
// TASKS MINI — inline quick-add, compact list
// ═══════════════════════════════════════════════════════════════

export function TasksMini({ courseId }: { courseId: string }) {
  const { db, createTask, updateTask, deleteTask } = useDB()
  const tasks = db.tasks.filter(t => t.course_id === courseId)
  const pending = tasks.filter(t => !t.is_completed)
  const done = tasks.filter(t => t.is_completed)

  return (
    <div className="glass rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
          <CheckSquare size={14} className="text-indigo-400" />
          משימות
          {pending.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-medium">
              {pending.length}
            </span>
          )}
        </h3>
      </div>

      <QuickAddInput
        placeholder="משימה חדשה…"
        accent="indigo"
        onAdd={text =>
          createTask({
            title: text,
            course_id: courseId,
            scheduled_date: format(new Date(), 'yyyy-MM-dd'),
            category: 'study',
          })
        }
      />

      {tasks.length === 0 ? (
        <p className="text-[11px] text-ink-subtle text-center py-3">
          הוסף משימה — חזרה, תרגול, פרויקט…
        </p>
      ) : (
        <div className="space-y-1">
          {pending.map(t => (
            <TaskRow key={t.id} task={t} onToggle={updateTask} onDelete={deleteTask} />
          ))}
          {done.length > 0 && (
            <details className="pt-1">
              <summary className="text-[11px] text-ink-subtle cursor-pointer hover:text-ink px-1 py-1">
                הושלמו ({done.length})
              </summary>
              <div className="space-y-1 mt-1">
                {done.map(t => <TaskRow key={t.id} task={t} onToggle={updateTask} onDelete={deleteTask} />)}
              </div>
            </details>
          )}
        </div>
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
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 group transition-colors">
      <button
        onClick={() => onToggle(task.id, { is_completed: !task.is_completed })}
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${
          task.is_completed ? 'bg-emerald-500/80 border-emerald-500' : 'border-white/15 hover:border-indigo-400'
        }`}
      />
      <span className={`text-sm flex-1 truncate ${task.is_completed ? 'text-ink-muted line-through' : 'text-ink'}`}>
        {task.title}
      </span>
      <button
        onClick={() => onDelete(task.id)}
        className="p-0.5 rounded text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ASSIGNMENTS MINI
// ═══════════════════════════════════════════════════════════════

export function AssignmentsMini({ courseId }: { courseId: string }) {
  const { db, createAssignment, updateAssignment, deleteAssignment } = useDB()
  const assignments = db.assignments.filter(a => a.course_id === courseId)

  return (
    <div className="glass rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
          <FileText size={14} className="text-amber-400" />
          מטלות
          {assignments.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium">
              {assignments.length}
            </span>
          )}
        </h3>
      </div>

      <QuickAddInput
        placeholder='מטלה חדשה (למשל "תרגיל 3")…'
        accent="amber"
        onAdd={text =>
          createAssignment({
            title: text,
            course_id: courseId,
            priority: 'medium',
          })
        }
      />

      {assignments.length === 0 ? (
        <p className="text-[11px] text-ink-subtle text-center py-3">
          תרגילים, מבחנים, פרויקטים…
        </p>
      ) : (
        <div className="space-y-1">
          {assignments.map(a => (
            <AssignmentRow key={a.id} a={a} onUpdate={updateAssignment} onDelete={deleteAssignment} />
          ))}
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
  const priorityDot: Record<string, string> = {
    high:   '#ef4444',
    medium: '#f59e0b',
    low:    '#10b981',
  }
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 group transition-colors">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: priorityDot[a.priority] }}
        title={a.priority === 'high' ? 'דחוף' : a.priority === 'medium' ? 'בינוני' : 'רגיל'}
      />
      <span className="text-sm flex-1 truncate text-ink">{a.title}</span>
      {a.deadline && (
        <span className="text-[10px] text-ink-subtle flex items-center gap-0.5 flex-shrink-0">
          <Calendar size={9} /> {a.deadline.slice(5)}
        </span>
      )}
      <select
        value={a.status}
        onChange={e => onUpdate(a.id, { status: e.target.value as Assignment['status'] })}
        className="text-[10px] bg-transparent border-0 cursor-pointer text-ink-muted hover:text-ink outline-none"
      >
        <option value="todo">לא התחיל</option>
        <option value="in_progress">בתהליך</option>
        <option value="submitted">הוגש</option>
        <option value="graded">נבדק</option>
      </select>
      <button
        onClick={() => onDelete(a.id)}
        className="p-0.5 rounded text-ink-subtle hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}
