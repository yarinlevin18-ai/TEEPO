'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, ExternalLink, ArrowRight, CheckCircle2,
  FileText, Sparkles, Loader2, ChevronDown,
} from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api-client'
import ErrorAlert from '@/components/ui/ErrorAlert'
import type { Course, Lesson } from '@/types'

interface CourseDetail extends Course {
  lessons: Lesson[]
}

export default function CourseDetailPage() {
  const params = useParams()
  const courseId = params.id as string

  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    const load = async () => {
      try {
        const data = await api.courses.get(courseId)
        setCourse(data)
      } catch (e: any) {
        console.error(e)
        setError('שגיאה בטעינת הקורס.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [courseId])

  const handleSummarize = async (lesson: Lesson) => {
    if (!lesson.content && !lesson.title) return
    setSummarizing(lesson.id)
    try {
      const result = await api.lessons.summarize(
        lesson.content || lesson.title,
        lesson.title
      )
      // Update lesson with AI summary
      setCourse((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          lessons: prev.lessons.map((l) =>
            l.id === lesson.id
              ? { ...l, ai_summary: result.result || result.summary || result.answer }
              : l
          ),
        }
      })
    } catch (e: any) {
      console.error(e)
      setError('שגיאה ביצירת סיכום.')
    } finally {
      setSummarizing(null)
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="h-8 w-64 shimmer rounded-lg" />
        <div className="h-4 w-48 shimmer rounded-lg" />
        <div className="space-y-3 mt-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 shimmer rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="p-8 max-w-4xl mx-auto animate-fade-in">
        <ErrorAlert message={error || 'הקורס לא נמצא'} />
        <Link href="/courses" className="mt-4 inline-flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 transition-colors">
          <ArrowRight size={14} /> חזרה לקורסים
        </Link>
      </div>
    )
  }

  const completedLessons = course.lessons.filter((l) => l.is_completed).length
  const progress = course.lessons.length > 0
    ? Math.round((completedLessons / course.lessons.length) * 100)
    : 0

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Back link */}
      <Link href="/courses" className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors">
        <ArrowRight size={14} /> חזרה לקורסים
      </Link>

      {/* Course header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <BookOpen size={24} className="text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-ink">{course.title}</h1>
            {course.description && (
              <p className="text-sm text-ink-muted mt-1 line-clamp-2">{course.description}</p>
            )}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full ${
                course.source === 'bgu'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
              }`}>
                {course.source === 'bgu' ? 'BGU Moodle' : course.source}
              </span>
              {course.source_url && (
                <a
                  href={course.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300 transition-colors"
                >
                  <ExternalLink size={12} /> פתח ב-Moodle
                </a>
              )}
              <span className="text-xs text-ink-muted">
                {course.lessons.length} שיעורים
              </span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {course.lessons.length > 0 && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-ink-muted mb-2">
              <span>התקדמות בקורס</span>
              <span>{completedLessons}/{course.lessons.length} ({progress}%)</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/5">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Lessons list */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <FileText size={18} className="text-indigo-400" />
          שיעורים
        </h2>

        {course.lessons.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center">
            <FileText size={32} className="text-white/10 mx-auto mb-3" />
            <p className="text-ink-muted text-sm">אין שיעורים בקורס זה</p>
            {course.source === 'bgu' && course.source_url && (
              <a
                href={course.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent-400 hover:text-accent-300 transition-colors"
              >
                <ExternalLink size={14} /> צפה בתוכן ב-Moodle
              </a>
            )}
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden divide-y divide-white/5">
            {course.lessons.map((lesson, index) => (
              <div key={lesson.id}>
                <button
                  onClick={() =>
                    setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)
                  }
                  className="w-full flex items-center gap-3 p-4 text-right hover:bg-white/[0.03] transition-colors"
                >
                  {/* Lesson number */}
                  <span
                    className={`w-7 h-7 rounded-full text-xs flex items-center justify-center flex-shrink-0 font-medium ${
                      lesson.is_completed
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-white/5 text-ink-muted'
                    }`}
                  >
                    {lesson.is_completed ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      index + 1
                    )}
                  </span>

                  {/* Title */}
                  <span
                    className={`text-sm flex-1 text-right ${
                      lesson.is_completed ? 'text-ink-muted line-through' : 'text-ink'
                    }`}
                  >
                    {lesson.title}
                  </span>

                  {/* Duration */}
                  {lesson.duration_minutes && (
                    <span className="text-xs text-ink-subtle flex-shrink-0">
                      {lesson.duration_minutes} דק׳
                    </span>
                  )}

                  <ChevronDown
                    size={14}
                    className={`text-ink-subtle transition-transform flex-shrink-0 ${
                      expandedLesson === lesson.id ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Expanded content */}
                <AnimatePresence>
                  {expandedLesson === lesson.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pr-14 space-y-3">
                        {/* Content preview */}
                        {lesson.content && (
                          <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap line-clamp-6">
                            {lesson.content}
                          </p>
                        )}

                        {/* AI Summary */}
                        {lesson.ai_summary && (
                          <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                            <p className="text-xs font-semibold text-indigo-400 mb-1 flex items-center gap-1">
                              <Sparkles size={12} /> סיכום AI
                            </p>
                            <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap">
                              {lesson.ai_summary}
                            </p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2">
                          {!lesson.ai_summary && (
                            <button
                              onClick={() => handleSummarize(lesson)}
                              disabled={summarizing === lesson.id}
                              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
                            >
                              {summarizing === lesson.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Sparkles size={12} />
                              )}
                              {summarizing === lesson.id ? 'מסכם...' : 'סכם עם AI'}
                            </button>
                          )}
                          {course.source_url && (
                            <a
                              href={course.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 text-ink-muted hover:text-ink hover:bg-white/8 transition-colors"
                            >
                              <ExternalLink size={12} /> Moodle
                            </a>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
