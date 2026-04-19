'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Loader2, CheckCircle, BookOpen, AlertCircle, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useDB } from '@/lib/db-context'

export default function ExtractCoursePage() {
  const router = useRouter()
  const { createCourse, ready } = useDB()

  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [source, setSource] = useState<'udemy' | 'coursera' | 'custom_url'>('custom_url')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const detectSource = (u: string): typeof source => {
    const lower = u.toLowerCase()
    if (lower.includes('udemy.com')) return 'udemy'
    if (lower.includes('coursera.org')) return 'coursera'
    return 'custom_url'
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    setError('')
    try {
      const course = await createCourse({
        title: title.trim(),
        source: url.trim() ? detectSource(url) : source,
        source_url: url.trim() || undefined,
        description: description.trim() || undefined,
      })
      router.push(`/courses/${course.id}`)
    } catch (err: any) {
      setError(err.message || 'שגיאה ביצירת הקורס')
      setLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">הוסף קורס חדש</h1>
        <p className="text-ink-muted mt-1">
          צור קורס חדש ב-TEEPO. הקורס ישמר ב-Google Drive שלך.
        </p>
      </div>

      {/* Info card */}
      <div className="glass rounded-xl p-4 border border-indigo-500/10">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <BookOpen size={16} className="text-indigo-400" />
          </div>
          <div className="text-sm text-ink-muted">
            <p className="text-ink font-medium mb-1">הקורסים שלך מאוחסנים אצלך</p>
            <p className="text-xs">
              TEEPO שומר את כל הקורסים, שיעורים וסיכומים ב-Google Drive הפרטי שלך.
              אף אחד אחר לא יכול לראות אותם — גם לא אנחנו.
            </p>
          </div>
        </div>
      </div>

      {/* Create course form */}
      <form onSubmit={handleCreate} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink-muted">שם הקורס *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='לדוגמה: "מבני נתונים ואלגוריתמים"'
            className="input-dark w-full"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink-muted">קישור (אופציונלי)</label>
          <div className="relative">
            <Link2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.udemy.com/course/... או Moodle URL"
              dir="ltr"
              className="input-dark w-full pr-10"
            />
          </div>
          <p className="text-[11px] text-ink-subtle">
            קישור לאתר הקורס (Udemy, Coursera, Moodle, או כל אתר אחר)
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink-muted">תיאור (אופציונלי)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="תיאור קצר של הקורס..."
            rows={3}
            className="input-dark w-full resize-none"
          />
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
            >
              <AlertCircle size={16} />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || !ready || !title.trim()}
            className="btn-gradient flex-1 px-6 py-3 rounded-xl font-medium text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {loading ? 'יוצר...' : ready ? 'צור קורס' : 'טוען מסד נתונים...'}
          </button>
          <Link href="/courses">
            <button type="button" className="px-6 py-3 border border-white/8 rounded-xl text-sm text-ink-muted hover:text-ink hover:border-white/15 transition-colors">
              ביטול
            </button>
          </Link>
        </div>
      </form>
    </div>
  )
}
