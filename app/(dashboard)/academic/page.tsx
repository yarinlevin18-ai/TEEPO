'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { GraduationCap, Loader2, Sparkles, BookOpen } from 'lucide-react'
import { api } from '@/lib/api-client'
import ErrorAlert from '@/components/ui/ErrorAlert'
import { useUniversityName } from '@/lib/use-university'

type AdviceResult = {
  advice: string
  // Legacy key name — backend may still return `bgu_resources`. Kept for
  // back-compat; newer backends should return `university_resources`.
  university_resources?: Record<string, string>
  bgu_resources?: Record<string, string>
}

export default function AcademicPage() {
  const [courseName, setCourseName] = useState('')
  const [major, setMajor] = useState('')
  const [courses, setCourses] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AdviceResult | null>(null)
  const universityName = useUniversityName()

  const getAdvice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!courseName && !major) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const data = await api.academic.advise(
        courseName,
        major,
        courses.split('\n').filter(Boolean)
      )
      setResult(data)
    } catch (err: any) {
      console.error(err)
      setError('שגיאה בקבלת ייעוץ אקדמי. נסה שוב.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
            <GraduationCap size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink">יועץ אקדמי</h1>
            <p className="text-ink-muted text-sm">{universityName}</p>
          </div>
        </div>
        <p className="text-ink-muted mt-2">
          קבל עצות אקדמיות מותאמות לקורסים, לדרישות האוניברסיטה, ולמחלקה שלך
        </p>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Form */}
      <form onSubmit={getAdvice} className="glass rounded-2xl p-6 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">שם הקורס</label>
            <input
              type="text"
              placeholder="לדוגמה: אלגוריתמים, חשבון דיפרנציאלי..."
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              className="input-dark w-full"
              style={{ '--focus-ring-color': '#f59e0b' } as React.CSSProperties}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">המחלקה שלי</label>
            <input
              type="text"
              placeholder="לדוגמה: מדעי המחשב, הנדסת תעשייה..."
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              className="input-dark w-full"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">הקורסים שאני לומד כרגע (שורה לכל קורס)</label>
          <textarea
            placeholder="קורס 1&#10;קורס 2&#10;קורס 3"
            value={courses}
            onChange={(e) => setCourses(e.target.value)}
            rows={3}
            className="input-dark w-full resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || (!courseName && !major)}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {loading ? 'מייעץ...' : 'קבל ייעוץ אישי'}
        </button>
      </form>

      {/* Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl overflow-hidden border-amber-500/20"
          style={{ borderColor: 'rgba(245,158,11,0.2)' }}
        >
          <div className="px-6 py-4 border-b border-amber-500/15 flex items-center gap-2" style={{ background: 'rgba(245,158,11,0.07)' }}>
            <Sparkles size={16} className="text-amber-400" />
            <h2 className="font-semibold text-ink">ייעוץ אקדמי</h2>
          </div>
          <div className="p-6">
            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{result.advice}</p>

            {(result.university_resources || result.bgu_resources) && (
              <div className="mt-6 border-t border-white/5 pt-4">
                <p className="text-xs font-semibold text-ink-muted mb-3 flex items-center gap-2">
                  <BookOpen size={14} className="text-amber-400" /> משאבי האוניברסיטה
                </p>
                <div className="space-y-2">
                  {Object.entries(result.university_resources || result.bgu_resources || {}).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-xs text-ink-muted">
                      <span className="font-medium text-amber-400/80 w-20 flex-shrink-0">
                        {key === 'moodle' ? 'Moodle' : key === 'registration' ? 'רישום' : key === 'library' ? 'ספרייה' : key}:
                      </span>
                      <span dir="ltr">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
