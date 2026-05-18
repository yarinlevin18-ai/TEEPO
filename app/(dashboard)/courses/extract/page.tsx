'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Loader2, BookOpen, AlertCircle, Plus } from 'lucide-react'
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
    <div className="cream-page extract-v2">
      <div className="extract-v2-main animate-fade-in" dir="rtl">
        {/* Header */}
        <header className="extract-v2-head">
          <h1>הוסף קורס חדש</h1>
          <p>צור קורס חדש ב-TEEPO. הקורס ישמר ב-Google Drive שלך.</p>
        </header>

        {/* Info card */}
        <div className="extract-v2-card extract-v2-info">
          <div className="extract-v2-info-icon">
            <BookOpen size={16} />
          </div>
          <div className="extract-v2-info-body">
            <p className="title">הקורסים שלך מאוחסנים אצלך</p>
            <p className="msg">
              TEEPO שומר את כל הקורסים, שיעורים וסיכומים ב-Google Drive הפרטי שלך.
              אף אחד אחר לא יכול לראות אותם — גם לא אנחנו.
            </p>
          </div>
        </div>

        {/* Create course form */}
        <form onSubmit={handleCreate} className="extract-v2-form">
          <div className="extract-v2-field">
            <label htmlFor="extract-title">שם הקורס *</label>
            <input
              id="extract-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='לדוגמה: "מבני נתונים ואלגוריתמים"'
              className="extract-v2-input"
              required
            />
          </div>

          <div className="extract-v2-field">
            <label htmlFor="extract-url">קישור (אופציונלי)</label>
            <div className="extract-v2-input-wrap">
              <Link2 size={16} className="extract-v2-input-icon" />
              <input
                id="extract-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.udemy.com/course/... או Moodle URL"
                dir="ltr"
                className="extract-v2-input has-icon"
              />
            </div>
            <p className="extract-v2-hint">
              קישור לאתר הקורס (Udemy, Coursera, Moodle, או כל אתר אחר)
            </p>
          </div>

          <div className="extract-v2-field">
            <label htmlFor="extract-desc">תיאור (אופציונלי)</label>
            <textarea
              id="extract-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="תיאור קצר של הקורס..."
              rows={3}
              className="extract-v2-input extract-v2-textarea"
            />
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="extract-v2-error"
              >
                <AlertCircle size={16} />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="extract-v2-actions">
            <button
              type="submit"
              disabled={loading || !ready || !title.trim()}
              className="extract-v2-btn primary"
            >
              {loading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
              {loading ? 'יוצר...' : ready ? 'צור קורס' : 'טוען מסד נתונים...'}
            </button>
            <Link href="/courses" className="extract-v2-btn">
              ביטול
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
