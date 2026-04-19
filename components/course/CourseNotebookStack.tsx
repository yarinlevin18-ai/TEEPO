'use client'

/**
 * CourseNotebookStack — cascading "notebook chapter" cards.
 *
 * Inspired by unveil.fr's diagonal card cascade, but dressed as a real
 * ruled notebook: warm off-white paper, red margin line, blue ruled lines.
 * Each lesson is a chapter. The first unfinished lesson sits at the apex.
 * Cards fan out to the bottom-left so earlier chapters peek from behind
 * the current one.
 *
 * Interaction:
 *   · subtle cursor parallax on the whole stack
 *   · hover → card lifts forward, siblings dim
 *   · click → navigate into that chapter
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
  onAddLesson: () => void
}

function pickFocusIndex(lessons: Lesson[]) {
  const idx = lessons.findIndex(l => !l.is_completed)
  return idx === -1 ? Math.max(0, lessons.length - 1) : idx
}

export default function CourseNotebookStack({ courseId, lessons, onAddLesson }: Props) {
  const router = useRouter()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)

  const mx = useMotionValue<number>(0)
  const my = useMotionValue<number>(0)
  const px = useSpring(mx, { stiffness: 120, damping: 22 })
  const py = useSpring(my, { stiffness: 120, damping: 22 })

  const onPointerMove = (e: React.PointerEvent) => {
    const r = wrapperRef.current?.getBoundingClientRect()
    if (!r) return
    mx.set(((e.clientX - r.left) / r.width) * 2 - 1)
    my.set(((e.clientY - r.top) / r.height) * 2 - 1)
  }
  const onPointerLeave = () => { mx.set(0); my.set(0) }

  const focusIdx = useMemo(() => pickFocusIndex(lessons), [lessons])
  const hasLessons = lessons.length > 0

  if (!hasLessons) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-[320px] rounded-3xl border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-3">
          <BookOpen size={26} className="text-indigo-400" />
        </div>
        <h3 className="text-base font-semibold text-ink mb-1">המחברת עוד ריקה</h3>
        <p className="text-xs text-ink-muted mb-4 max-w-xs text-center">
          כל שיעור הופך לפרק במחברת של הקורס. הוסף פרק ראשון כדי להתחיל.
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
      className="relative w-full overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-[#161328] via-[#100d1e] to-[#0e0b1c]"
      style={{ perspective: 1600, minHeight: 640 }}
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute top-10 right-10 w-72 h-72 rounded-full bg-indigo-500/[0.09] blur-[100px]" />
        <div className="absolute bottom-10 left-10 w-80 h-80 rounded-full bg-violet-500/[0.08] blur-[110px]" />
      </div>

      {/* Meta — top-left */}
      <div className="absolute top-5 left-6 z-30 pointer-events-none">
        <p className="text-[10px] uppercase tracking-[0.22em] text-ink-subtle font-semibold">Notebook</p>
        <p className="text-[13px] text-ink-muted mt-1">
          {lessons.length} פרקים
          {focusIdx >= 0 && <span className="mx-2 text-ink-subtle">·</span>}
          {focusIdx >= 0 && (
            <span className="text-indigo-300">פרק {focusIdx + 1} פתוח</span>
          )}
        </p>
      </div>

      {/* Add — top-right */}
      <button
        onClick={onAddLesson}
        className="absolute top-4 right-5 z-30 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/5 hover:bg-white/10 text-xs text-ink-muted hover:text-ink transition-colors border border-white/10"
      >
        <Plus size={13} /> פרק חדש
      </button>

      {/* Stack stage */}
      <div className="relative mx-auto flex items-center justify-center"
        style={{ minHeight: 640, paddingTop: 72, paddingBottom: 72 }}>
        <div className="relative w-[min(720px,92%)]" style={{ aspectRatio: '16 / 11' }}>
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

      {/* Caption */}
      {focusIdx >= 0 && lessons[focusIdx] && <FocusCaption lesson={lessons[focusIdx]} />}
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
  const offset = index - focusIdx
  const isFocus = offset === 0
  const isHovered = hoverId === lesson.id

  // Fan pattern: cards behind-and-below the focus (past chapters) peek up
  // from the bottom-left; future chapters float up-right with slight tilt.
  // Max 4 on each side before fading out, so very long courses still read.
  const d = Math.max(-4, Math.min(4, offset))
  const sign = Math.sign(d)
  const mag = Math.abs(d)

  const base = {
    x: sign * mag * 28,                   // wider horizontal fan
    y: sign * mag * -34,                  // past chapters below, future up
    rotate: sign * mag * 2.8,
    scale: 1 - mag * 0.035,
    opacity: mag > 4 ? 0 : 1 - mag * 0.16,
  }
  const zIndex = 100 - mag + (isHovered ? 50 : 0)

  // Parallax fades quickly with depth
  const parallaxStrength = Math.max(0, 1 - mag * 0.35)
  const tx = useTransform(parallaxX, v => v * 12 * parallaxStrength)
  const ty = useTransform(parallaxY, v => v * 10 * parallaxStrength)

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
        x: base.x + (isHovered ? -6 : 0),
        y: base.y + (isHovered ? -8 : 0),
        rotate: base.rotate + (isHovered ? -0.5 : 0),
        scale: base.scale * (isHovered ? 1.035 : 1),
      }}
      transition={{ type: 'spring', stiffness: 140, damping: 20, mass: 0.7 }}
      style={{
        zIndex,
        x: tx,
        y: ty,
        transformStyle: 'preserve-3d',
        transformOrigin: 'center center',
      }}
      className="absolute inset-0 m-auto text-right"
      dir="rtl"
    >
      {/* The paper itself */}
      <div
        className={[
          'relative w-full h-full rounded-[20px] overflow-hidden',
          'shadow-[0_24px_60px_-18px_rgba(0,0,0,0.75)]',
          isFocus ? 'ring-2 ring-indigo-400/60' : 'ring-1 ring-black/10',
        ].join(' ')}
        style={{
          // Warm notebook paper gradient
          background: isFocus
            ? 'linear-gradient(180deg, #fffdf6 0%, #fbf6e8 100%)'
            : 'linear-gradient(180deg, #fbf7ea 0%, #f3ecd4 100%)',
        }}
      >
        {/* Red left margin (RTL so it's visually on the right) */}
        <div className="absolute top-0 bottom-0 right-10 w-px bg-red-400/50" />
        {/* Double punch holes on the opposite spine */}
        <div className="absolute top-6 left-3 w-2 h-2 rounded-full bg-black/10" />
        <div className="absolute bottom-6 left-3 w-2 h-2 rounded-full bg-black/10" />

        {/* Blue ruled lines */}
        <div
          className="absolute inset-x-0 top-[78px] bottom-[46px] opacity-[0.35] pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0 31px, #8ab4e8 31px 32px)',
          }}
        />

        {/* Top edge tape for focus card */}
        {isFocus && (
          <div
            className="absolute top-0 inset-x-12 h-[4px]"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)' }}
          />
        )}

        {/* Content */}
        <div className="relative h-full flex flex-col px-8 pr-14 py-6">
          {/* Chapter label */}
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">
            פרק {index + 1} / {total}
          </p>

          {/* Title + status */}
          <div className="flex items-start gap-3 mt-1">
            <h3 className="text-[22px] sm:text-[26px] font-bold text-slate-900 leading-tight flex-1 min-w-0 line-clamp-2"
              style={{ fontFamily: '"David", "David Libre", Georgia, serif' }}
            >
              {lesson.title}
            </h3>
            {lesson.is_completed && (
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/90 text-white flex items-center justify-center mt-1">
                <Check size={14} strokeWidth={3} />
              </span>
            )}
          </div>

          {/* Preview text sitting on the ruled lines */}
          <div className="mt-4 flex-1 min-h-0 text-[15px] leading-[32px] text-slate-700"
            style={{ fontFamily: '"David", "David Libre", Georgia, serif' }}
          >
            {lesson.recap ? (
              <p className="line-clamp-5">{lesson.recap}</p>
            ) : lesson.ai_summary ? (
              <p className="line-clamp-5">{lesson.ai_summary}</p>
            ) : hasContent ? (
              <p className="line-clamp-5">
                {lesson.content!.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
              </p>
            ) : (
              <p className="text-slate-400 italic">
                הפרק ריק. לחץ כדי להתחיל לכתוב.
              </p>
            )}
          </div>

          {/* Badges along the bottom margin */}
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {files.length > 0 && (
              <span className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300/50">
                <FileUp size={10} /> {files.length}
              </span>
            )}
            {hasTranscript && (
              <span className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-300/50">
                <Mic size={10} /> תמלול
              </span>
            )}
            {lesson.ai_summary && (
              <span className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-300/50">
                <Sparkles size={10} /> AI
              </span>
            )}
            {hasContent && (
              <span className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-300/50">
                <FileText size={10} /> סיכום
              </span>
            )}
            {files.some(f => f.type === 'pptx') && (
              <span className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-300/50">
                <Presentation size={10} /> מצגת
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="absolute bottom-5 left-6 right-6 z-30 pointer-events-none flex items-end justify-between gap-3"
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.22em] text-ink-subtle font-semibold">
          הפרק הפתוח
        </p>
        <p className="text-sm text-ink font-medium truncate mt-1">{lesson.title}</p>
      </div>
      <p className="hidden sm:block text-[11px] text-ink-subtle">
        לחץ על פרק כדי להיכנס אליו
      </p>
    </motion.div>
  )
}
