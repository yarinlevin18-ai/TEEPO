/**
 * PipelineDemo — visual demonstration of the TEEPO file pipeline, shown
 * in the /summaries ("המוח") empty state so a user with no data yet sees
 * how the workflow moves material end-to-end instead of a blank card:
 *
 *   Moodle / extension → TEEPO (Drive) → תואר → סמסטר → קורס → תיקיות
 *
 * Static markup + CSS animation (pulsing flow dots between stages, RTL
 * direction), no client hooks — renders as a server-safe fragment inside
 * the client page. Styles live under `.sum-pipeline-*` in globals.css.
 */

import {
  Puzzle, HardDrive, GraduationCap, CalendarDays, BookOpen,
  Presentation, ClipboardList, NotebookPen, ChevronLeft,
} from 'lucide-react'

const STAGES = [
  { icon: <Puzzle size={20} strokeWidth={1.9} />, label: 'Moodle + התוסף', sub: 'הקבצים נאספים' },
  { icon: <HardDrive size={20} strokeWidth={1.9} />, label: 'TEEPO ב-Drive', sub: 'הכל בענן שלך' },
  { icon: <GraduationCap size={20} strokeWidth={1.9} />, label: 'תואר', sub: 'לפי שנה' },
  { icon: <CalendarDays size={20} strokeWidth={1.9} />, label: 'סמסטר', sub: 'א׳ / ב׳ / קיץ' },
  { icon: <BookOpen size={20} strokeWidth={1.9} />, label: 'קורס', sub: 'תיקייה לכל קורס' },
] as const

const LEAVES = [
  { icon: <Presentation size={15} strokeWidth={2} />, label: 'שיעורים' },
  { icon: <ClipboardList size={15} strokeWidth={2} />, label: 'מטלות' },
  { icon: <NotebookPen size={15} strokeWidth={2} />, label: 'סיכומים' },
] as const

export default function PipelineDemo() {
  return (
    <div className="sum-pipeline" aria-label="איך הזרימה עובדת: מ-Moodle דרך Drive עד תיקיות הקורס">
      <div className="sum-pipeline-head">
        <h3>ככה זה עובד</h3>
        <p>ברגע שתוסיף קורסים, כל קובץ יזרום מהמקור עד התיקייה הנכונה — אוטומטית.</p>
      </div>

      <div className="sum-pipeline-flow">
        {STAGES.map((s, i) => (
          <div className="sum-pipeline-step-wrap" key={s.label}>
            {i > 0 && (
              <span className="sum-pipeline-arrow" aria-hidden>
                <span className="dot" />
                <ChevronLeft size={14} strokeWidth={2.4} />
              </span>
            )}
            <div className="sum-pipeline-step">
              <span className="sum-pipeline-ico">{s.icon}</span>
              <span className="sum-pipeline-label">{s.label}</span>
              <span className="sum-pipeline-sub">{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="sum-pipeline-leaves" aria-hidden>
        {LEAVES.map((l) => (
          <span className="sum-pipeline-leaf" key={l.label}>
            {l.icon}
            {l.label}
          </span>
        ))}
      </div>

      <p className="sum-pipeline-cta">בחר סמסטר בעץ משמאל — או הגדר תואר כדי להתחיל.</p>
    </div>
  )
}
