'use client'

/**
 * AI Tools — curated toolkit for BGU students.
 * Data lives in `data/ai-tools.json` so it's easy to extend without touching code.
 */

import { motion } from 'framer-motion'
import {
  Sparkles, ExternalLink, Lightbulb, AlertCircle,
  Search, Presentation, PenLine, Clock,
} from 'lucide-react'
import toolkitData from '@/data/ai-tools.json'

// ── Icon mapping per category (falls back to Sparkles) ────────
const CATEGORY_ICON: Record<string, any> = {
  'חיפוש מאמרים וסקירה אקדמית': Search,
  'בניית מצגות ועיצוב':           Presentation,
  'כתיבת עבודות וניסוח':          PenLine,
  'ניהול זמן ופרודוקטיביות':      Clock,
}

const CATEGORY_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  'חיפוש מאמרים וסקירה אקדמית': { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/20' },
  'בניית מצגות ועיצוב':           { bg: 'bg-violet-500/10',  text: 'text-violet-400',  border: 'border-violet-500/20' },
  'כתיבת עבודות וניסוח':          { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  'ניהול זמן ופרודוקטיביות':      { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
}

interface Tool {
  name: string
  use_case: string
  pro_tip: string
  url?: string
}

interface Category {
  category_name: string
  tools: Tool[]
}

export default function AIToolsPage() {
  const { categories, general_guidelines, metadata } = toolkitData.student_ai_toolkit as {
    categories: Category[]
    general_guidelines: string[]
    metadata: { version: string; last_updated: string }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center flex-shrink-0">
          <Sparkles size={22} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink">
            <span className="gradient-text">כלי AI</span> לסטודנט
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            ארגז כלים מומלץ לחיפוש אקדמי, כתיבה, מצגות וניהול זמן.
          </p>
        </div>
      </div>

      {/* ─── Categories ─── */}
      <div className="space-y-6">
        {categories.map((cat, ci) => {
          const Icon = CATEGORY_ICON[cat.category_name] || Sparkles
          const color = CATEGORY_COLOR[cat.category_name] || {
            bg: 'bg-white/5', text: 'text-ink', border: 'border-white/10',
          }

          return (
            <motion.section
              key={cat.category_name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: ci * 0.05 }}
              className="space-y-3"
            >
              {/* Category header */}
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${color.bg} flex items-center justify-center`}>
                  <Icon size={17} className={color.text} />
                </div>
                <h2 className="text-base font-bold text-ink">{cat.category_name}</h2>
                <span className="text-xs text-ink-subtle">
                  {cat.tools.length} כלים
                </span>
              </div>

              {/* Tools grid */}
              <div className="grid sm:grid-cols-2 gap-3">
                {cat.tools.map((tool, ti) => (
                  <motion.div
                    key={tool.name}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: ci * 0.05 + ti * 0.04 }}
                    className="glass rounded-2xl p-4 flex flex-col gap-2.5 hover:bg-white/[0.06] transition-colors group"
                  >
                    {/* Name + external link */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink leading-snug">{tool.name}</h3>
                      {tool.url && (
                        <a
                          href={tool.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`p-1.5 rounded-lg ${color.bg} ${color.text} opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0`}
                          title={`פתח את ${tool.name}`}
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>

                    {/* Use case */}
                    <p className="text-xs text-ink-muted leading-relaxed">
                      {tool.use_case}
                    </p>

                    {/* Pro tip */}
                    <div className={`flex items-start gap-2 text-[11px] p-2.5 rounded-lg border ${color.border} ${color.bg} leading-relaxed mt-auto`}>
                      <Lightbulb size={12} className={`${color.text} flex-shrink-0 mt-0.5`} />
                      <span className="text-ink-muted">
                        <span className={`font-semibold ${color.text}`}>טיפ: </span>
                        {tool.pro_tip}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )
        })}
      </div>

      {/* ─── General guidelines ─── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-2xl p-5 space-y-3"
        style={{
          background: 'rgba(245,158,11,0.05)',
          border: '1px solid rgba(245,158,11,0.15)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <AlertCircle size={16} className="text-amber-400" />
          </div>
          <h3 className="text-sm font-bold text-amber-300">הנחיות כלליות לשימוש אחראי</h3>
        </div>
        <ul className="space-y-2 mr-2">
          {general_guidelines.map((g, i) => (
            <li key={i} className="text-xs text-ink-muted leading-relaxed flex items-start gap-2">
              <span className="text-amber-400/60 flex-shrink-0 mt-0.5">•</span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      {/* ─── Footer ─── */}
      <p className="text-[10px] text-ink-subtle text-center pt-2">
        גרסה {metadata.version} · עודכן {metadata.last_updated}
      </p>
    </div>
  )
}
