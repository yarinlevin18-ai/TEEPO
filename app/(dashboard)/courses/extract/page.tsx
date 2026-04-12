'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Loader2, CheckCircle, BookOpen, ChevronDown, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api-client'
import Link from 'next/link'

type Section = { title: string; order: number; lessons?: { title: string }[] }
type ExtractResult = { course: { id: string; title: string }; sections: Section[] }

export default function ExtractCoursePage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ExtractResult | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await api.courses.extract(url.trim())
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'שגיאה בחילוץ הקורס')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">הוסף קורס חדש</h1>
        <p className="text-ink-muted mt-1">הדבק קישור מ-Udemy, Coursera, או כל אתר לימוד</p>
      </div>

      {/* Supported platforms */}
      <div className="flex gap-3 flex-wrap">
        {['Udemy', 'Coursera', 'כל אתר לימוד'].map((p) => (
          <span key={p} className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-full">
            {p}
          </span>
        ))}
      </div>

      {/* URL input form */}
      <form onSubmit={handleExtract} className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Link2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.udemy.com/course/..."
              dir="ltr"
              className="input-dark w-full pr-10"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="btn-gradient px-6 py-3 rounded-xl font-medium text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90 flex items-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <BookOpen size={16} />}
            {loading ? 'מחלץ...' : 'חלץ קורס'}
          </button>
        </div>
      </form>

      {/* Error */}
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

      {/* Loading animation */}
      {loading && (
        <div className="glass rounded-2xl p-8 text-center space-y-4">
          <div className="flex justify-center gap-2">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
          <p className="text-ink-muted text-sm">מנתח את הקורס ומחלץ את המבנה...</p>
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl overflow-hidden"
          >
            {/* Course header */}
            <div className="p-6 border-b border-white/5" style={{ background: 'rgba(99,102,241,0.08)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl btn-gradient flex items-center justify-center">
                  <BookOpen size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-ink">{result.course.title}</h2>
                  <p className="text-sm text-ink-muted">
                    {result.sections.length} פרקים נמצאו
                  </p>
                </div>
                <div className="mr-auto flex items-center gap-1.5 text-green-400 text-sm font-medium">
                  <CheckCircle size={16} />
                  נשמר בהצלחה
                </div>
              </div>
            </div>

            {/* Sections list */}
            <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
              {result.sections.length === 0 ? (
                <p className="p-6 text-center text-ink-muted text-sm">
                  לא נמצאו פרקים - התוכן נשמר כקורס מותאם אישית
                </p>
              ) : (
                result.sections.map((section, i) => (
                  <div key={i}>
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }))}
                      className="w-full flex items-center justify-between p-4 text-right hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-indigo-500/15 text-indigo-400 text-xs flex items-center justify-center font-medium">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-ink">{section.title}</span>
                      </div>
                      <ChevronDown
                        size={16}
                        className={`text-ink-muted transition-transform ${expanded[i] ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {expanded[i] && section.lessons && section.lessons.length > 0 && (
                      <div className="px-6 pb-3 space-y-1.5 bg-white/[0.02]">
                        {section.lessons.map((lesson, j) => (
                          <p key={j} className="text-xs text-ink-muted pr-4 border-r-2 border-white/8">
                            {lesson.title}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="p-5 border-t border-white/5 flex gap-3">
              <Link href={`/dashboard/courses/${result.course.id}`} className="flex-1">
                <button className="w-full btn-gradient px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90">
                  פתח את הקורס
                </button>
              </Link>
              <button
                onClick={() => { setResult(null); setUrl('') }}
                className="px-4 py-2.5 border border-white/8 rounded-xl text-sm text-ink-muted hover:text-ink hover:border-white/10 transition-colors"
              >
                הוסף עוד קורס
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
