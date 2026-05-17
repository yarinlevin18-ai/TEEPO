'use client'

/**
 * /tasks/mockup — Assignments Workspace v2 (design exploration).
 *
 * NOT WIRED TO REAL DATA. Self-contained, fully-interactive mockup so we
 * can react to the design before committing to backend changes. Renders
 * a "focus workspace" for the most-urgent assignment:
 *
 *   - Hero card with countdown, progress bar, course color
 *   - Subtask checklist with blocker tags + per-task hour estimates
 *   - Pomodoro focus timer
 *   - Notes panel
 *   - Resources panel (mock Drive links, Moodle deep-link)
 *   - "Submit" action
 *
 * Plus a horizontal rail of all the user's other assignments — picking
 * one swaps the workspace.
 *
 * Mock data lives in `MOCK_ASSIGNMENTS` at the bottom. Replace with real
 * useDB() wiring once the design is locked.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Clock, Flame, ExternalLink, FileText, BookOpen, Play, Pause, RotateCcw,
  Plus, AlertTriangle, CheckCircle2, Circle, Trash2, Send, Sparkles,
  CalendarDays, Timer, Brain, GripVertical, Link as LinkIcon, FolderOpen,
} from 'lucide-react'

// ── Types — match real shapes in types/index.ts ──────────────────────────

type Status = 'todo' | 'in_progress' | 'submitted' | 'graded'
type Priority = 'low' | 'medium' | 'high'

interface SubTask {
  id: string
  title: string
  is_completed: boolean
  estimated_hours?: number
  is_blocked?: boolean
  blocker_note?: string
}

interface MockAssignment {
  id: string
  course: { title: string; color: string; soft: string; code: string }
  title: string
  description: string
  deadline: string // ISO
  status: Status
  priority: Priority
  subtasks: SubTask[]
  notes: string
  resources: Array<{ kind: 'drive' | 'moodle' | 'link'; label: string; url: string }>
  weight_percent?: number  // % of course grade
  pomodoros_today: number
}

// ── Page ────────────────────────────────────────────────────────────────

export default function AssignmentWorkspaceMockup() {
  const [assignments, setAssignments] = useState<MockAssignment[]>(MOCK_ASSIGNMENTS)
  const [activeId, setActiveId] = useState<string>(MOCK_ASSIGNMENTS[0].id)
  const active = assignments.find(a => a.id === activeId) ?? assignments[0]

  // Update one assignment immutably
  const patchActive = (patch: Partial<MockAssignment>) =>
    setAssignments(prev => prev.map(a => (a.id === active.id ? { ...a, ...patch } : a)))
  const patchSubtask = (subId: string, patch: Partial<SubTask>) =>
    patchActive({ subtasks: active.subtasks.map(s => (s.id === subId ? { ...s, ...patch } : s)) })

  const progress = useMemo(() => {
    if (active.subtasks.length === 0) return 0
    const done = active.subtasks.filter(s => s.is_completed).length
    return Math.round((done / active.subtasks.length) * 100)
  }, [active.subtasks])

  return (
    <div className="cream-page asgn-wk">
      <main className="asgn-main">
        <DesignTag />
        <Header
          totalCount={assignments.length}
          activeFilter="all"
          onFilterChange={() => {/* mock — filter tabs */}}
        />

        <AssignmentRail
          assignments={assignments}
          activeId={active.id}
          onPick={setActiveId}
        />

        <FocusWorkspace
          assignment={active}
          progress={progress}
          onToggleSubtask={(subId) => patchSubtask(subId, {
            is_completed: !active.subtasks.find(s => s.id === subId)?.is_completed,
          })}
          onAddSubtask={(title) => patchActive({
            subtasks: [
              ...active.subtasks,
              { id: `sub_${Date.now()}`, title, is_completed: false, estimated_hours: 1 },
            ],
          })}
          onDeleteSubtask={(subId) => patchActive({
            subtasks: active.subtasks.filter(s => s.id !== subId),
          })}
          onToggleBlocked={(subId) => patchSubtask(subId, {
            is_blocked: !active.subtasks.find(s => s.id === subId)?.is_blocked,
          })}
          onUpdateNotes={(notes) => patchActive({ notes })}
          onSubmit={() => patchActive({ status: 'submitted' })}
          onPomodoroComplete={() => patchActive({ pomodoros_today: active.pomodoros_today + 1 })}
        />
      </main>
    </div>
  )
}

// ── Header ──────────────────────────────────────────────────────────────

function DesignTag() {
  return (
    <div className="asgn-design-tag">
      <Sparkles size={12} />
      <span>זה mockup — לא ניגש לנתונים אמיתיים. בנוי כדי לבדוק את התחושה. </span>
      <Link href="/tasks">חזרה ל-/tasks הנוכחי ←</Link>
    </div>
  )
}

function Header({
  totalCount,
  activeFilter,
  onFilterChange,
}: {
  totalCount: number
  activeFilter: string
  onFilterChange: (f: string) => void
}) {
  const FILTERS = [
    { key: 'all', label: 'הכל', count: totalCount },
    { key: 'overdue', label: 'באיחור', count: 1, urgent: true },
    { key: 'this-week', label: 'השבוע', count: 3 },
    { key: 'in-progress', label: 'בעבודה', count: 2 },
    { key: 'submitted', label: 'הוגשו', count: 4 },
  ]
  return (
    <header className="asgn-head">
      <div>
        <div className="asgn-eyebrow">Assignments · המטלות</div>
        <h1>המטלות שלי</h1>
        <p className="asgn-sub">חלל עבודה לכל מטלה — תת-משימות, טיימר פוקוס, חומרים, הערות, וכפתור הגשה אחד.</p>
      </div>
      <div className="asgn-head-actions">
        <button type="button" className="asgn-btn-secondary">
          <CalendarDays size={15} /> תצוגת timeline
        </button>
        <button type="button" className="asgn-btn-primary">
          <Plus size={15} /> מטלה חדשה
        </button>
      </div>

      <div className="asgn-filter-row">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`asgn-filter ${activeFilter === f.key ? 'active' : ''} ${f.urgent ? 'urgent' : ''}`}
            onClick={() => onFilterChange(f.key)}
          >
            <span>{f.label}</span>
            <span className="asgn-filter-count">{f.count}</span>
          </button>
        ))}
      </div>
    </header>
  )
}

// ── Assignment rail (all assignments, horizontal scroll) ───────────────

function AssignmentRail({
  assignments,
  activeId,
  onPick,
}: {
  assignments: MockAssignment[]
  activeId: string
  onPick: (id: string) => void
}) {
  return (
    <div className="asgn-rail-wrap">
      <div className="asgn-rail">
        {assignments.map(a => {
          const progress = a.subtasks.length === 0 ? 0 :
            Math.round((a.subtasks.filter(s => s.is_completed).length / a.subtasks.length) * 100)
          const urgency = computeUrgency(a.deadline, a.status)
          return (
            <button
              key={a.id}
              type="button"
              className={`asgn-card ${activeId === a.id ? 'active' : ''} urgency-${urgency.level}`}
              onClick={() => onPick(a.id)}
            >
              <div className="asgn-card-strip" style={{ background: a.course.color }} />
              <div className="asgn-card-head">
                <div className="asgn-card-course" style={{ color: a.course.color }}>{a.course.code}</div>
                <div className={`asgn-card-urgency urgency-${urgency.level}`} title={urgency.label}>
                  {urgency.icon}
                  <span>{urgency.label}</span>
                </div>
              </div>
              <div className="asgn-card-title">{a.title}</div>
              <div className="asgn-card-progress">
                <div className="bar"><div className="fill" style={{ width: `${progress}%` }} /></div>
                <span>{progress}%</span>
              </div>
              <div className="asgn-card-meta">
                {a.status === 'submitted' || a.status === 'graded' ? (
                  <span className="meta-pill submitted"><CheckCircle2 size={12} /> הוגש</span>
                ) : (
                  <>
                    <span className="meta-pill"><Clock size={12} /> {urgency.relative}</span>
                    {a.subtasks.filter(s => s.is_blocked).length > 0 && (
                      <span className="meta-pill blocked"><AlertTriangle size={12} /> תקוע</span>
                    )}
                  </>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Focus workspace (the active assignment in detail) ──────────────────

function FocusWorkspace({
  assignment,
  progress,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onToggleBlocked,
  onUpdateNotes,
  onSubmit,
  onPomodoroComplete,
}: {
  assignment: MockAssignment
  progress: number
  onToggleSubtask: (id: string) => void
  onAddSubtask: (title: string) => void
  onDeleteSubtask: (id: string) => void
  onToggleBlocked: (id: string) => void
  onUpdateNotes: (s: string) => void
  onSubmit: () => void
  onPomodoroComplete: () => void
}) {
  const urgency = computeUrgency(assignment.deadline, assignment.status)
  const hoursLeftEst = assignment.subtasks
    .filter(s => !s.is_completed)
    .reduce((acc, s) => acc + (s.estimated_hours ?? 0), 0)

  return (
    <section
      className="asgn-focus"
      style={{
        // Course color creeps in via the strip + a faint paint at the top
        ['--course-color' as any]: assignment.course.color,
        ['--course-soft' as any]: assignment.course.soft,
      }}
    >
      <div className="focus-edge" />
      <header className="focus-head">
        <div className="focus-title">
          <div className="focus-course" style={{ color: assignment.course.color }}>
            <BookOpen size={14} /> {assignment.course.title}
          </div>
          <h2>{assignment.title}</h2>
          <p className="focus-desc">{assignment.description}</p>
        </div>
        <div className="focus-meta">
          <div className={`focus-countdown urgency-${urgency.level}`}>
            {urgency.icon}
            <div>
              <strong>{urgency.relative}</strong>
              <small>{formatDeadline(assignment.deadline)}</small>
            </div>
          </div>
          {assignment.weight_percent && (
            <div className="focus-weight">
              <strong>{assignment.weight_percent}%</strong>
              <small>מהציון הסופי</small>
            </div>
          )}
          {hoursLeftEst > 0 && (
            <div className="focus-hours">
              <Timer size={14} />
              <strong>~{hoursLeftEst}ש</strong>
              <small>נותר משוער</small>
            </div>
          )}
        </div>
      </header>

      <div className="focus-progress">
        <div className="focus-progress-label">
          <span>התקדמות</span>
          <strong>{progress}%</strong>
        </div>
        <div className="focus-progress-bar">
          <div className="fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="focus-progress-meta">
          <span>{assignment.subtasks.filter(s => s.is_completed).length} מתוך {assignment.subtasks.length} תת-משימות</span>
          <button type="button" className="focus-submit" onClick={onSubmit} disabled={assignment.status === 'submitted'}>
            <Send size={14} />
            {assignment.status === 'submitted' ? 'הוגש' : 'סמן כהוגש'}
          </button>
        </div>
      </div>

      <div className="focus-grid">
        <SubtasksPanel
          subtasks={assignment.subtasks}
          onToggle={onToggleSubtask}
          onAdd={onAddSubtask}
          onDelete={onDeleteSubtask}
          onToggleBlocked={onToggleBlocked}
        />
        <PomodoroPanel
          pomodorosToday={assignment.pomodoros_today}
          onComplete={onPomodoroComplete}
        />
        <NotesPanel
          value={assignment.notes}
          onChange={onUpdateNotes}
        />
        <ResourcesPanel resources={assignment.resources} />
      </div>
    </section>
  )
}

// ── Subtasks ────────────────────────────────────────────────────────────

function SubtasksPanel({
  subtasks, onToggle, onAdd, onDelete, onToggleBlocked,
}: {
  subtasks: SubTask[]
  onToggle: (id: string) => void
  onAdd: (title: string) => void
  onDelete: (id: string) => void
  onToggleBlocked: (id: string) => void
}) {
  const [newTitle, setNewTitle] = useState('')
  const submit = () => {
    if (!newTitle.trim()) return
    onAdd(newTitle.trim())
    setNewTitle('')
  }
  return (
    <div className="focus-panel panel-subtasks">
      <div className="panel-head">
        <div className="panel-title">
          <CheckCircle2 size={16} /> תת-משימות
        </div>
        <span className="panel-count">{subtasks.length}</span>
      </div>
      <ul className="subtask-list">
        {subtasks.map(s => (
          <li key={s.id} className={`subtask ${s.is_completed ? 'done' : ''} ${s.is_blocked ? 'blocked' : ''}`}>
            <button
              type="button"
              className="subtask-check"
              onClick={() => onToggle(s.id)}
              aria-label={s.is_completed ? 'בטל סימון' : 'סמן כהושלם'}
            >
              {s.is_completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            </button>
            <GripVertical className="subtask-grip" size={14} />
            <div className="subtask-text">
              <span className="subtask-title">{s.title}</span>
              {s.estimated_hours && (
                <small className="subtask-hours"><Clock size={11} /> {s.estimated_hours}ש</small>
              )}
              {s.is_blocked && s.blocker_note && (
                <small className="subtask-blocker"><AlertTriangle size={11} /> {s.blocker_note}</small>
              )}
            </div>
            <button
              type="button"
              className={`subtask-action ${s.is_blocked ? 'on' : ''}`}
              onClick={() => onToggleBlocked(s.id)}
              title={s.is_blocked ? 'בטל סימון תקוע' : 'סמן כתקוע'}
              aria-label="סמן כתקוע"
            >
              <AlertTriangle size={14} />
            </button>
            <button
              type="button"
              className="subtask-action danger"
              onClick={() => onDelete(s.id)}
              aria-label="מחק"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="subtask-add">
        <Plus size={16} />
        <input
          type="text"
          value={newTitle}
          placeholder="הוסף תת-משימה — הקלד ולחץ Enter"
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
      </div>
    </div>
  )
}

// ── Pomodoro ────────────────────────────────────────────────────────────

const POMODORO_SECONDS = 25 * 60

function PomodoroPanel({
  pomodorosToday,
  onComplete,
}: {
  pomodorosToday: number
  onComplete: () => void
}) {
  const [secondsLeft, setSecondsLeft] = useState(POMODORO_SECONDS)
  const [running, setRunning] = useState(false)
  const completedRef = useRef(false)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          if (!completedRef.current) {
            completedRef.current = true
            onComplete()
          }
          setRunning(false)
          return POMODORO_SECONDS
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [running, onComplete])

  const reset = () => { setRunning(false); setSecondsLeft(POMODORO_SECONDS); completedRef.current = false }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const pct = ((POMODORO_SECONDS - secondsLeft) / POMODORO_SECONDS) * 100

  return (
    <div className="focus-panel panel-pomodoro">
      <div className="panel-head">
        <div className="panel-title">
          <Timer size={16} /> טיימר פוקוס
        </div>
        <span className="panel-count">{pomodorosToday} היום</span>
      </div>
      <div className="pomo-clock">
        <svg viewBox="0 0 140 140" className="pomo-ring">
          <circle cx="70" cy="70" r="60" className="track" />
          <circle
            cx="70" cy="70" r="60"
            className="progress"
            style={{
              strokeDasharray: 2 * Math.PI * 60,
              strokeDashoffset: 2 * Math.PI * 60 * (1 - pct / 100),
            }}
          />
        </svg>
        <div className="pomo-time">{mm}:{ss}</div>
      </div>
      <div className="pomo-controls">
        <button
          type="button"
          className={`pomo-btn primary ${running ? 'paused' : ''}`}
          onClick={() => setRunning(r => !r)}
        >
          {running ? <><Pause size={14} /> השהה</> : <><Play size={14} /> התחל פוקוס</>}
        </button>
        <button type="button" className="pomo-btn ghost" onClick={reset}>
          <RotateCcw size={14} />
        </button>
      </div>
      <p className="pomo-hint">25 דקות עבודה ממוקדת. אחרי 4 פומודורו → הפסקה ארוכה.</p>
    </div>
  )
}

// ── Notes ───────────────────────────────────────────────────────────────

function NotesPanel({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <div className="focus-panel panel-notes">
      <div className="panel-head">
        <div className="panel-title">
          <Brain size={16} /> הערות וחסמים
        </div>
      </div>
      <textarea
        className="notes-area"
        value={value}
        placeholder="איפה אני תקוע? שאלות ל-TA? רעיונות?"
        onChange={(e) => onChange(e.target.value)}
        rows={7}
      />
      <p className="notes-hint">נשמר אוטומטית. המוח אוהב לפנות מקום — כתוב הכל החוצה.</p>
    </div>
  )
}

// ── Resources (Drive + Moodle + links) ─────────────────────────────────

function ResourcesPanel({ resources }: { resources: MockAssignment['resources'] }) {
  return (
    <div className="focus-panel panel-resources">
      <div className="panel-head">
        <div className="panel-title">
          <FolderOpen size={16} /> חומרים מקושרים
        </div>
        <span className="panel-count">{resources.length}</span>
      </div>
      <ul className="resources-list">
        {resources.map((r, i) => (
          <li key={i}>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="resource-link">
              {r.kind === 'drive' && <FileText size={15} />}
              {r.kind === 'moodle' && <BookOpen size={15} />}
              {r.kind === 'link' && <LinkIcon size={15} />}
              <span className="resource-label">{r.label}</span>
              <span className={`resource-kind kind-${r.kind}`}>{r.kind}</span>
              <ExternalLink size={13} className="resource-arrow" />
            </a>
          </li>
        ))}
        <li>
          <button type="button" className="resource-add">
            <Plus size={14} /> צרף חומר מ-Drive או מ-Moodle
          </button>
        </li>
      </ul>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────

function computeUrgency(deadlineISO: string, status: Status): {
  level: 'overdue' | 'today' | 'soon' | 'later' | 'done'
  label: string
  icon: React.ReactNode
  relative: string
} {
  if (status === 'submitted' || status === 'graded') {
    return { level: 'done', label: 'הוגש', icon: <CheckCircle2 size={14} />, relative: 'הוגש' }
  }
  const now = Date.now()
  const dl = new Date(deadlineISO).getTime()
  const diffH = Math.round((dl - now) / 1000 / 60 / 60)
  const diffD = Math.round(diffH / 24)
  if (diffH < 0) return { level: 'overdue', label: 'באיחור', icon: <Flame size={14} />, relative: 'באיחור' }
  if (diffH < 24) return { level: 'today', label: 'דחוף', icon: <Flame size={14} />, relative: `בעוד ${diffH}ש` }
  if (diffD <= 3) return { level: 'soon', label: 'קרוב', icon: <Clock size={14} />, relative: `בעוד ${diffD} ימים` }
  return { level: 'later', label: 'יש זמן', icon: <Clock size={14} />, relative: `בעוד ${diffD} ימים` }
}

function formatDeadline(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('he-IL', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ── Mock data ───────────────────────────────────────────────────────────

const today = new Date()
const addDays = (n: number, h: number = 0) => {
  const d = new Date(today)
  d.setDate(d.getDate() + n)
  d.setHours(h, 0, 0, 0)
  return d.toISOString()
}

const MOCK_ASSIGNMENTS: MockAssignment[] = [
  {
    id: 'a1',
    course: { title: "חדו\"א 1", color: '#0d9488', soft: '#ccfbf1', code: '201-1-9821' },
    title: 'תרגיל בית 3 — אינטגרלים לא רגילים',
    description: 'פתרון של 6 שאלות מפרק 5 + הוכחת משפט ההתכנסות. הגשה אישית, בכתב יד מותר.',
    deadline: addDays(2, 23),
    status: 'in_progress',
    priority: 'high',
    weight_percent: 12,
    pomodoros_today: 3,
    subtasks: [
      { id: 's1', title: 'קריאת פרק 5 + סיכום הוכחות', is_completed: true, estimated_hours: 1.5 },
      { id: 's2', title: 'שאלה 1 — אינטגרלים לא רגילים מסוג ראשון', is_completed: true, estimated_hours: 0.5 },
      { id: 's3', title: 'שאלה 2 — מבחני התכנסות', is_completed: true, estimated_hours: 1 },
      { id: 's4', title: 'שאלה 3 — הוכחת התכנסות', is_completed: false, estimated_hours: 1.5, is_blocked: true, blocker_note: 'לא ברור איך מוכיחים את החסם — שאלתי TA במייל' },
      { id: 's5', title: 'שאלה 4 — חישוב שטחים', is_completed: false, estimated_hours: 1 },
      { id: 's6', title: 'שאלות 5-6 — נפח גוף סיבוב', is_completed: false, estimated_hours: 2 },
      { id: 's7', title: 'עריכה, סריקה והעלאה ל-Moodle', is_completed: false, estimated_hours: 0.5 },
    ],
    notes: 'שאלה 3: יש כאן משהו מוזר עם הגבול ב-1/x²ln(x). בדוק את הדוגמה בכיתה ביום שלישי. אם לא — תשאל את הסטודנט שאני יושב לידו.',
    resources: [
      { kind: 'drive', label: 'hw3.pdf (תרגיל)', url: '#' },
      { kind: 'drive', label: 'chapter5_summary.pdf', url: '#' },
      { kind: 'drive', label: 'הקלטת תרגול שבוע 5.mp4', url: '#' },
      { kind: 'moodle', label: 'פתח את הקורס ב-Moodle', url: '#' },
      { kind: 'link', label: 'Wolfram Alpha — חישוב סימבולי', url: 'https://www.wolframalpha.com' },
    ],
  },
  {
    id: 'a2',
    course: { title: 'אלגברה לינארית', color: '#8b5cf6', soft: '#ede9fe', code: '201-1-9531' },
    title: 'בוחן שבועי 5 — וקטורים עצמיים',
    description: 'בוחן 30 דקות ב-Moodle. פתוח 24 שעות. ניתן להיעזר בסיכומים.',
    deadline: addDays(3, 20),
    status: 'todo',
    priority: 'medium',
    weight_percent: 5,
    pomodoros_today: 0,
    subtasks: [
      { id: 's1', title: 'חזרה על וקטורים עצמיים', is_completed: false, estimated_hours: 1 },
      { id: 's2', title: 'תרגול 3 דוגמאות', is_completed: false, estimated_hours: 1 },
      { id: 's3', title: 'בוחן עצמו (30 דק)', is_completed: false, estimated_hours: 0.5 },
    ],
    notes: '',
    resources: [
      { kind: 'drive', label: 'סיכום שיעור 11.pdf', url: '#' },
      { kind: 'moodle', label: 'פתח ב-Moodle', url: '#' },
    ],
  },
  {
    id: 'a3',
    course: { title: 'מבוא לתכנות', color: '#16a34a', soft: '#dcfce7', code: '201-1-1011' },
    title: 'פרויקט סוף קורס — מערכת ניהול ספריה',
    description: 'פרויקט בזוגות. Python + SQLite. בוחר נושא בעצמך מהרשימה.',
    deadline: addDays(14, 23),
    status: 'in_progress',
    priority: 'high',
    weight_percent: 30,
    pomodoros_today: 0,
    subtasks: [
      { id: 's1', title: 'בחירת נושא + שותף', is_completed: true, estimated_hours: 1 },
      { id: 's2', title: 'אפיון: schema + use cases', is_completed: true, estimated_hours: 3 },
      { id: 's3', title: 'CRUD על ספרים', is_completed: false, estimated_hours: 4 },
      { id: 's4', title: 'מערכת השאלות', is_completed: false, estimated_hours: 5 },
      { id: 's5', title: 'CLI', is_completed: false, estimated_hours: 2 },
      { id: 's6', title: 'בדיקות + README', is_completed: false, estimated_hours: 3 },
      { id: 's7', title: 'מצגת', is_completed: false, estimated_hours: 2 },
    ],
    notes: 'שותף: יוסי. החלטנו שהוא לוקח את ה-CRUD ואני את מערכת ההשאלות.',
    resources: [
      { kind: 'drive', label: 'אפיון.docx', url: '#' },
      { kind: 'link', label: 'GitHub repo', url: '#' },
      { kind: 'moodle', label: 'מסמך הנחיות', url: '#' },
    ],
  },
  {
    id: 'a4',
    course: { title: 'פיזיקה 1', color: '#e11d48', soft: '#fce7f3', code: '203-1-1391' },
    title: 'תרגיל 4 — חוקי שימור',
    description: 'הוגש ב-12.05',
    deadline: addDays(-3),
    status: 'submitted',
    priority: 'medium',
    weight_percent: 8,
    pomodoros_today: 0,
    subtasks: [
      { id: 's1', title: 'הכל', is_completed: true, estimated_hours: 4 },
    ],
    notes: '',
    resources: [
      { kind: 'drive', label: 'תרגיל4_מוגש.pdf', url: '#' },
    ],
  },
  {
    id: 'a5',
    course: { title: 'מבוא להסתברות', color: '#d97706', soft: '#fef3c7', code: '201-1-9421' },
    title: 'תרגיל בית 2',
    description: 'התפלגויות בדידות.',
    deadline: addDays(-1),
    status: 'todo',
    priority: 'high',
    weight_percent: 8,
    pomodoros_today: 0,
    subtasks: [
      { id: 's1', title: 'לקרוא פרק 2', is_completed: false, estimated_hours: 1 },
      { id: 's2', title: 'לפתור 5 שאלות', is_completed: false, estimated_hours: 3 },
    ],
    notes: 'שכחתי מזה לגמרי. כנראה אצטרך הארכה.',
    resources: [
      { kind: 'moodle', label: 'תרגיל ב-Moodle', url: '#' },
    ],
  },
]
