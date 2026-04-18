'use client'

/**
 * Notebooks list — NotebookLM-style collections of sources for grounded Q&A.
 *
 * Each notebook holds PDFs / pasted text / URLs. The chat is scoped to those
 * sources so the bot answers only from what the user uploaded.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  BookMarked, Plus, FileText, MessageSquare, Trash2, X, Sparkles, BookOpen,
} from 'lucide-react'
import { useDB } from '@/lib/db-context'

export default function NotebooksPage() {
  const router = useRouter()
  const { db, ready, createNotebook, deleteNotebook } = useDB()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [courseId, setCourseId] = useState('')

  const notebooks = (db.notebooks || []).slice().sort(
    (a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''),
  )

  const handleCreate = async () => {
    if (!title.trim()) return
    const nb = await createNotebook({
      title: title.trim(),
      description: description.trim() || undefined,
      course_id: courseId || undefined,
    })
    setCreating(false)
    setTitle('')
    setDescription('')
    setCourseId('')
    router.push(`/notebooks/${nb.id}`)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`למחוק את המחברת "${name}"? כל המקורות והשיחה יימחקו.`)) return
    await deleteNotebook(id)
  }

  if (!ready) {
    return (
      <div className="p-8 text-center text-ink-muted">טוען מסד נתונים...</div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto" style={{ direction: 'rtl' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
            <span className="gradient-text">מחברות AI</span>
            <Sparkles className="text-indigo-400" size={28} />
          </h1>
          <p className="text-ink-muted text-sm">
            העלו PDF, סיכומים או הערות — הבוט יענה רק על סמך מה שהעליתם, עם ציטוטים למקור.
          </p>
        </div>

        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2.5 rounded-xl text-white font-medium flex items-center gap-2 transition-transform hover:scale-105"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
          <Plus size={18} /> מחברת חדשה
        </button>
      </div>

      {/* Empty state */}
      {notebooks.length === 0 && !creating && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-10 text-center"
        >
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <BookMarked size={32} className="text-white" />
          </div>
          <h2 className="text-xl font-semibold mb-2">אין עדיין מחברות</h2>
          <p className="text-ink-muted text-sm mb-6 max-w-md mx-auto">
            מחברת היא אוסף של מקורות (PDFים, סיכומים, הערות) שעליהם הבוט לומד ועונה.
            מושלם לבחינה, לפרויקט, או לעבודה אקדמית.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="px-5 py-2.5 rounded-xl text-white font-medium inline-flex items-center gap-2"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <Plus size={18} /> צור מחברת ראשונה
          </button>
        </motion.div>
      )}

      {/* Create modal */}
      {creating && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-5 mb-6"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">מחברת חדשה</h3>
            <button
              onClick={() => setCreating(false)}
              className="text-ink-muted hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
          <div className="space-y-3">
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="שם המחברת (למשל: מבחן באלגברה לינארית)"
              className="w-full text-sm rounded-xl px-3 py-2.5"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f1f5f9',
                outline: 'none',
              }}
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="תיאור קצר (אופציונלי)"
              className="w-full text-sm rounded-xl px-3 py-2.5"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f1f5f9',
                outline: 'none',
              }}
            />
            {db.courses.length > 0 && (
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full text-sm rounded-xl px-3 py-2.5"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#f1f5f9',
                  outline: 'none',
                }}
              >
                <option value="" style={{ background: '#1a1f2e' }}>
                  ללא שיוך לקורס
                </option>
                {db.courses.map((c) => (
                  <option key={c.id} value={c.id} style={{ background: '#1a1f2e' }}>
                    {c.title}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCreating(false)}
                className="px-4 py-2 text-sm rounded-xl text-ink-muted hover:text-ink hover:bg-white/5 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleCreate}
                disabled={!title.trim()}
                className="px-4 py-2 text-sm rounded-xl text-white font-medium disabled:opacity-40 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                צור ופתח
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Grid of notebooks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {notebooks.map((nb, i) => {
          const sources = (db.notebook_sources || []).filter((s) => s.notebook_id === nb.id)
          const msgCount = nb.chat_history?.length || 0
          const course = nb.course_id ? db.courses.find((c) => c.id === nb.course_id) : null

          return (
            <motion.div
              key={nb.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass rounded-2xl p-5 group relative overflow-hidden cursor-pointer"
              whileHover={{ y: -2 }}
            >
              <Link href={`/notebooks/${nb.id}`} className="block">
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                  >
                    <BookMarked size={18} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate" title={nb.title}>
                      {nb.title}
                    </h3>
                    {course && (
                      <div className="text-[11px] text-indigo-400 flex items-center gap-1 mt-0.5 truncate">
                        <BookOpen size={10} /> {course.title}
                      </div>
                    )}
                  </div>
                </div>
                {nb.description && (
                  <p className="text-xs text-ink-muted line-clamp-2 mb-3">
                    {nb.description}
                  </p>
                )}
                <div className="flex items-center gap-3 text-[11px] text-ink-muted">
                  <span className="flex items-center gap-1">
                    <FileText size={12} /> {sources.length} מקורות
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare size={12} /> {msgCount} הודעות
                  </span>
                </div>
              </Link>

              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleDelete(nb.id, nb.title)
                }}
                className="absolute top-3 left-3 p-1.5 rounded-lg text-ink-muted hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                title="מחק מחברת"
              >
                <Trash2 size={14} />
              </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
