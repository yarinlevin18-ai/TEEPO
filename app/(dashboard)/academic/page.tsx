'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { GraduationCap, Loader2, Sparkles, BookOpen } from 'lucide-react'
import { api } from '@/lib/api-client'

export default function AcademicPage() {
  const [courseName, setCourseName] = useState('')
  const [major, setMajor] = useState('')
  const [courses, setCourses] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ advice: string; bgu_resources: Record<string, string> } | null>(null)

  const getAdvice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!courseName && !major) return
    setLoading(true)
    setResult(null)
    try {
      const data = await api.academic.advise(
        courseName,
        major,
        courses.split('\n').filter(Boolean)
      )
      setResult(data)
    } catch (err: any) {
      alert('שגיאה: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
            <GraduationCap size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">יועץ אקדמי BGU</h1>
            <p className="text-slate-500 text-sm">אוניברסיטת בן-גוריון בנגב</p>
          </div>
        </div>
        <p className="text-slate-500 mt-2">
          קבל עצות אקדמיות מותאמות לקורסים, לדרישות האוניברסיטה, ולמחלקה שלך
        </p>
      </div>

      {/* Form */}
      <form onSubmit={getAdvice} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">שם הקורס</label>
            <input
              type="text"
              placeholder="לדוגמה: אלגוריתמים, חשבון דיפרנציאלי..."
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              className="w-full border border-surface-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">המחלקה שלי</label>
            <input
              type="text"
              placeholder="לדוגמה: מדעי המחשב, הנדסת תעשייה..."
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              className="w-full border border-surface-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">הקורסים שאני לומד כרגע (שורה לכל קורס)</label>
          <textarea
            placeholder="קורס 1&#10;קורס 2&#10;קורס 3"
            value={courses}
            onChange={(e) => setCourses(e.target.value)}
            rows={3}
            className="w-full border border-surface-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </div>
        <button
          type="submit"
          disabled={loading || (!courseName && !major)}
          className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
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
          className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden"
        >
          <div className="bg-amber-50 px-6 py-4 border-b border-amber-200 flex items-center gap-2">
            <Sparkles size={16} className="text-amber-500" />
            <h2 className="font-semibold text-slate-800">ייעוץ אקדמי</h2>
          </div>
          <div className="p-6">
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{result.advice}</p>

            {result.bgu_resources && (
              <div className="mt-6 border-t border-surface-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-2">
                  <BookOpen size={14} /> משאבי BGU
                </p>
                <div className="space-y-2">
                  {Object.entries(result.bgu_resources).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-500 w-20 flex-shrink-0">
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
