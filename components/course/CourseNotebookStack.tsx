'use client'

/**
 * CourseNotebookStack — cascading lesson cards inspired by unveil.fr.
 *
 * Each lesson is a chapter in the course's "notebook". We fan them out
 * diagonally from bottom-left → top-right so the eye naturally reads
 * "past → present → future" and the first unfinished lesson sits at the
 * apex. A subtle mouse parallax makes the stack feel three-dimensional
 * without the weight of a real 3D engine.
 *
 * Hovering a card brings it forward and dims its neighbours. Clicking
 * navigates to that lesson's notebook page.
 */

import { useRouter } from 'next/navigation'
import { useRef, useState, useMemo } from 'react'
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion'
import {
  BookOpen, Sparkles, Mic, FileUp, Check,
  FileText, Plus, Presentation,
} from 'lucide-react'
import type { Lesson } from '@/types'

interface Props {
  courseId: string
  lessons: Lesson[]
  /** Fires when the user clicks the floating "+" in the stack */
  onAddLesson: () => void
}

// Pick the "focus" chapter — the first unfinished lesson, or the last one
// if everything is done. This is the card that sits at the front of the
// stack.
function pickFocusIndex(lessons: Lesson[]) {
  const idx = lessons.findIndex(l => !l.is_completed)
  return idx === -1 ? Math.max(0, lessons.length - 1) : idx
}

export default function CourseNotebookStack({ courseId, lessons, onAddLesson }: Props) {
  const router = useRouter()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)

  // Pointer-driven parallax (spring-smoothed) — each card reads these
  const mx = useMotionValue<number>(0)
  const my = useMotionValue<number>(0)
  const px = useSpring(mx, { stiffness: 120, damping: 22 })
  const py = useSpring(my, { stiffness: 120, damping: 22 })

  const onPointerMove = (e: React.PointerEvent) => {
    const r = wrapperRef.current?.getBoundingClientRect()
    if (!r) return
    // Normalize to [-1, 1]
    mx.set(((e.clientX - r.left) / r.width) * 2 - 1)
    my.set(((e.clientY - r.top) / r.height) * 2 - 1)
  }
  const onPointerLeave = () => { mx.set(0); my.set(0) }

  const focusIdx = useMemo(() => pickFocusIndex(lessons), [lessons])
  const hasLessons = lessons.length > 0

  if (!hasLessons) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-[280px] rounded-3xl border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-3">
          <BookOpen size={26} className="text-indigo-400" />
        </div>
        <h3 className="text-base font-semibold text-ink mb-1">המחברת עוד ריקה</h3>
        <p className="text-xs text-ink-muted mb-4 max-w-xs text-center">
          כל שיעור הופך לפרק במחברת של הקורס. הוסיף שיעור ראשון כדי להתחיל.
        </p>
        <button
          onClick={onAddLesson}
          className="btn-gradient px-4 py-2 rounded-xl text-sm text-white font-medium inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> פרק ראשון
        </button>
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="relative w-full h-[520px] sm:h-[560px] overflow-hidden rounded-3xl bg-gradient-to-br from-white/[0.015] via-transparent to-indigo-500/[0.04] border border-white/5"
      style={{ perspective: 1600 }}
    >
      {/* Ambient glows so the black canvas has life */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute top-6 right-8 w-64 h-64 rounded-full bg-indigo-500/[0.07] blur-[80px]" />
        <div className="absolute bottom-10 left-8 w-72 h-72 rounded-full bg-violet-500/[0.06] blur-[90px]" />
      </div>

      {/* Top-left meta */}
      <div className="absolute top-4 left-5 z-30 pointer-events-none">
        <p className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-semibold">Notebook</p>
        <p className="text-xs text-ink-muted mt-0.5">
          {lessons.length} פרקים
          {focusIdx >= 0 && (
            <span className="mx-1.5 text-ink-subtle">·</span>
          )}
          {focusIdx >= 0 && (
            <span className="text-indigo-300">
              פרק {focusIdx + 1} פתוח
            </span>
          )}
        </p>
      </div>

      {/* Top-right "add chapter" */}
      <button
        onClick={onAddLesson}
        className="absolute top-3.5 right-4 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs text-ink-muted hover:text-ink transition-colors border border-white/5"
      >
        <Plus size={12} /> פרק חדש
      </button>

      {/* The stack */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-[82%] max-w-[820px] h-[76%]">
          {lessons.map((lesson, i) => (
            <StackCard
              key={lesson.id}
              lesson={lesson}
              index={i}
              focusIdx={focusIdx}
              total={lessons.length}
              hoverId={hoverId}
              setHoverId={setHoverId}
              parallaxX={px}
              parallaxY={py}
              onOpen={() => router.push(`/courses/${courseId}/lessons/${lesson.id}`)}
            />
          ))}
        </div>
      </div>

      {/* Bottom caption — the focused chapter */}
      {focusIdx >= 0 && lessons[focusIdx] && (
        <FocusCaption lesson={lessons[focusIdx]} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────

function StackCard({
  lesson, index, focusIdx, total, hoverId, setHoverId, parallaxX, parallaxY, onOpen,
}: {
  lesson: Lesson
  index: number
  focusIdx: number
  total: number
  hoverId: string | null
  setHoverId: (v: string | null) => void
  parallaxX: MotionValue<number>
  parallaxY: MotionValue<number>
  onOpen: () => void
}) {
  // Offset relative to the focus chapter. Negative = earlier chapters
  // (stacked behind + up-right), positive = later chapters (down-left).
  const offset = index - focusIdx
  const isFocus = offset === 0
  const isHovered = hoverId === lesson.id

  // Fan out with progressive translate + rotate + scale. Depth is clamped so
  // the stack still reads as a stack even in very long courses.
  const d = Math.max(-6, Math.min(6, offset))
  const base = {
    x: d * -64,                       // later chapters slide to the LEFT
    y: d * 36,                        // and DOWN
    rotate: d * -3.2,                 // with a subtle counter-rotation
    scale: 1 - Math.abs(d) * 0.05,
    z: -Math.abs(d) * 80,
    opacity: Math.abs(d) > 4 ? 0 : 1 - Math.abs(d) * 0.12,
  }

  // Front-of-stack order: focus should sit on top, then alternating
  const zIndex = 100 - Math.abs(offset) + (isHovered ? 50 : 0)

  // Parallax read — only the focus + near-neighbours feel the cursor
  const parallaxStrength = Math.max(0, 1 - Math.abs(offset) * 0.3)
  const tx = useTransform(parallaxX, v => v * 10 * parallaxStrength)
  const ty = useTransform(parallaxY, v => v * 8 * parallaxStrength)

  const files = lesson.files || []
  const hasContent = !!(lesson.content && lesson.content.replace(/<[^>]*>/g, '').trim())
  const hasTranscript = !!lesson.transcript

  return (
    <motion.button
      onClick={onOpen}
      onPointerEnter={() => setHoverId(lesson.id)}
      onPointerLeave={() => setHoverId(null)}
      initial={{ opacity: 0, y: 40, scale: 0.9 }}
      animate={{
        opacity: base.opacity,
        x: base.x + (isHovered ? -10 : 0),
        y: base.y + (isHovered ? -10 : 0),
        rotate: base.rotate + (isHovered ? 1 : 0),
        scale: base.scale * (isHovered ? 1.04 : 1),
      }}
      transition={{ type: 'spring', stiffness: 140, damping: 20, mass: 0.7 }}
      style={{
        zIndex,
        x: tx,
        y: ty,
        transformStyle: 'preserve-3d',
        transformOrigin: 'center center',
      }}
      className="absolute inset-0 m-auto w-[min(560px,90%)] h-[min(320px,86%)] text-right"
    >
      <div
        className={[
          'relative w-full h-full rounded-2xl overflow-hidden border backdrop-blur-sm',
          isFocus
            ? 'bg-[#1a1530]/95 border-indigo-400/25 shadow-[0_30px_60px_-20px_rgba(99,102,241,0.35)]'
            : 'bg-[#141222]/85 border-white/8 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.6)]',
        ].join(' ')}
      >
        {/* Edge tape — gives the "notebook page" vibe */}
        <div className="absolute top-0 inset-x-0 h-[3px]"
          style={{
            background: isFocus
              ? 'linear-gradient(90deg, transparent, rgba(139,127,240,0.55), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
          }}
        />

        {/* Faint ruled lines so it reads as a page */}
        <div
          className="pointer-events-none absolute inset-x-6 top-16 bottom-14 opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(to bottom, transparent 0, transparent 27px, rgba(255,255,255,0.65) 28px)',
            backgroundSize: '100% 28px',
          }}
        />

        <div className="relative h-full flex flex-col p-5 sm:p-6">
          {/* Header row */}
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              lesson.is_completed
                ? 'bg-emerald-500/15 text-emerald-300'
                : isFocus ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/5 text-ink-muted'
            }`}>
              {lesson.is_completed ? <Check size={16} /> : <span className="text-sm font-semibold">{index + 1}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.15em] text-ink-subtle">
                פרק {index + 1} / {total}
              </p>
              <h3 className="text-base sm:text-lg font-bold text-ink mt-0.5 line-clamp-2">
                {lesson.title}
              </h3>
            </div>
          </div>

          {/* Body — preview of content/recap */}
          <div className="mt-3 flex-1 min-h-0 text-[13px] leading-relaxed text-ink-muted">
            {lesson.recap ? (
              <p className="line-clamp-4">{lesson.recap}</p>
            ) : lesson.ai_summary ? (
              <p className="line-clamp-4">{lesson.ai_summary}</p>
            ) : hasContent ? (
              <p className="line-clamp-4">
                {lesson.content!.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
              </p>
            ) : (
              <p className="text-ink-subtle italic">
                לא נרשם עוד כלום לפרק הזה.
              </p>
            )}
          </div>

          {/* Footer badges */}
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {files.length > 0 && (
              <span className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300">
                <FileUp size={9} /> {files.length}
              </span>
            )}
            {hasTranscript && (
              <span className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300">
                <Mic size={9} /> תמלול
              </span>
            )}
            {lesson.ai_summary && (
              <span className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300">
                <Sparkles size={9} /> AI
              </span>
            )}
            {hasContent && (
              <span className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300">
                <FileText size={9} /> סיכום
              </span>
            )}
            {files.some(f => f.type === 'pptx') && (
              <span className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-300">
                <Presentation size={9} /> מצגת
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  )
}

// ─────────────────────────────────────────────────────────────────

function FocusCaption({ lesson }: { lesson: Lesson }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="absolute bottom-4 left-5 right-5 z-30 pointer-events-none flex items-end justify-between gap-3"
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-semibold">
          הפרק הפתוח
        </p>
        <p className="text-sm text-ink font-medium truncate mt-0.5">{lesson.title}</p>
      </div>
      <p className="hidden sm:block text-[11px] text-ink-subtle">
        לחץ על פרק כדי להיכנס אליו
      </p>
    </motion.div>
  )
}
