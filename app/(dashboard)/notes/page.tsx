'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { FileText, Search, BookOpen, Calendar } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api-client'
import { useAuth } from '@/lib/auth-context'
import GlowCard from '@/components/ui/GlowCard'
import type { Course, CourseNote } from '@/types'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

interface NoteWithCourse extends CourseNote {
  courseName: string
}

export default function NotesPage() {
  const { user } = useAuth()
  const [allNotes, setAllNotes] = useState<NoteWithCourse[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCourse, setSelectedCourse] = useState<string>('all')

  useEffect(() => {
    if (!user) return

    const load = async () => {
      try {
        const coursesList = await api.courses.list()
        setCourses(coursesList)

        const notesPerCourse = await Promise.all(
          coursesList.map(async (course: Course) => {
            try {
              const notes = await api.notes.list(course.id)
              return notes.map((note: CourseNote) => ({
                ...note,
                courseName: course.title,
              }))
            } catch {
              return []
            }
          })
        )

        const merged = notesPerCourse
          .flat()
          .sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )

        setAllNotes(merged)
      } catch (e) {
        console.error('Failed to load notes:', e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user])

  // Courses that actually have notes (for filter chips)
  const coursesWithNotes = useMemo(() => {
    const ids = new Set(allNotes.map((n) => n.course_id))
    return courses.filter((c) => ids.has(c.id))
  }, [courses, allNotes])

  // Filtered notes
  const filteredNotes = useMemo(() => {
    let result = allNotes

    if (selectedCourse !== 'all') {
      result = result.filter((n) => n.course_id === selectedCourse)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          stripHtml(n.content).toLowerCase().includes(q)
      )
    }

    return result
  }, [allNotes, selectedCourse, searchQuery])

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shimmer rounded-xl" />
          <div className="h-7 w-48 shimmer rounded-lg" />
        </div>
        <div className="h-11 shimmer rounded-xl" />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-20 shimmer rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 shimmer rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
          <FileText size={22} className="text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">הסיכומים שלי</h1>
      </motion.div>

      {/* Search bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="relative"
      >
        <Search
          size={16}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="חיפוש בכותרות ותוכן..."
          className="input-dark w-full pr-10 text-sm"
          dir="rtl"
        />
      </motion.div>

      {/* Course filter chips */}
      {coursesWithNotes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-2"
        >
          <button
            onClick={() => setSelectedCourse('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              selectedCourse === 'all'
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'bg-white/5 text-ink-muted border border-white/5 hover:bg-white/8 hover:text-white'
            }`}
          >
            הכל
          </button>
          {coursesWithNotes.map((course) => (
            <button
              key={course.id}
              onClick={() =>
                setSelectedCourse(selectedCourse === course.id ? 'all' : course.id)
              }
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedCourse === course.id
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'bg-white/5 text-ink-muted border border-white/5 hover:bg-white/8 hover:text-white'
              }`}
            >
              {course.title}
            </button>
          ))}
        </motion.div>
      )}

      {/* Result count */}
      <p className="text-xs text-ink-muted">
        {filteredNotes.length} סיכומים
      </p>

      {/* Notes grid */}
      {filteredNotes.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note, i) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
            >
              <Link href={`/courses/${note.course_id}`}>
                <GlowCard className="h-full">
                  <div className="p-5 flex flex-col gap-3 h-full">
                    {/* Course badge */}
                    <span className="self-start text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 truncate max-w-full">
                      {note.courseName}
                    </span>

                    {/* Title */}
                    <h3 className="text-sm font-semibold text-white line-clamp-2">
                      {note.title || 'ללא כותרת'}
                    </h3>

                    {/* Content preview */}
                    <p className="text-xs text-ink-muted leading-relaxed line-clamp-3 flex-1">
                      {stripHtml(note.content).slice(0, 100) || 'ללא תוכן'}
                    </p>

                    {/* Date */}
                    <div className="flex items-center gap-1.5 text-ink-muted mt-auto pt-2 border-t border-white/5">
                      <Calendar size={11} />
                      <span className="text-[10px]">
                        {format(
                          new Date(note.created_at),
                          'd בMMM yyyy',
                          { locale: he }
                        )}
                      </span>
                    </div>
                  </div>
                </GlowCard>
              </Link>
            </motion.div>
          ))}
        </div>
      ) : allNotes.length > 0 ? (
        /* No results after filtering */
        <GlowCard>
          <div className="p-12 text-center">
            <Search size={32} className="text-white/10 mx-auto mb-3" />
            <p className="text-ink-muted text-sm">לא נמצאו סיכומים מתאימים</p>
            <button
              onClick={() => {
                setSearchQuery('')
                setSelectedCourse('all')
              }}
              className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
            >
              נקה חיפוש
            </button>
          </div>
        </GlowCard>
      ) : (
        /* Empty state — no notes at all */
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlowCard>
            <div className="p-12 text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-6 right-10 w-20 h-20 rounded-full bg-indigo-500/10 blur-2xl" />
                <div className="absolute bottom-8 left-12 w-16 h-16 rounded-full bg-violet-500/10 blur-2xl" />
              </div>
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
                  <FileText size={32} className="text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1">
                  עדיין אין סיכומים
                </h3>
                <p className="text-sm text-ink-muted mb-5 max-w-sm mx-auto">
                  כתוב סיכום ראשון בתוך אחד הקורסים שלך, והוא יופיע כאן.
                </p>
                <Link
                  href="/courses"
                  className="btn-gradient inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-white font-medium shadow-lg shadow-indigo-500/20"
                >
                  <BookOpen size={15} />
                  עבור לקורסים
                </Link>
              </div>
            </div>
          </GlowCard>
        </motion.div>
      )}
    </div>
  )
}
