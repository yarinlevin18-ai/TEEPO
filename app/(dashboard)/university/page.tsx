'use client'

/**
 * University info page — reads from `data/university-info.json`.
 * Displays faculties, academic calendar, graduation requirements, awards.
 */

import { motion } from 'framer-motion'
import {
  GraduationCap, Calendar, Users, Award, BookOpen, Globe,
  Languages, ShieldCheck, Heart, Building2, MapPin, Crown, UserCog,
} from 'lucide-react'
import info from '@/data/university-info.json'
import { getSemesterStatus } from '@/lib/academic-calendar'

export default function UniversityPage() {
  const data = info.shnaton_general_2026
  const semester = getSemesterStatus()

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center flex-shrink-0">
          <Building2 size={22} className="text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-ink">
            <span className="gradient-text">{data.university_overview.name}</span>
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            נוסדה ב-{data.university_overview.establishment.founded_year} ·
            {' '}{data.university_overview.campuses.length} קמפוסים
          </p>
        </div>
      </div>

      {/* ─── Current semester snapshot ─── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-5"
      >
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Calendar size={18} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">{semester.label}</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                {semester.weekNumber
                  ? `שבוע ${semester.weekNumber} מתוך ${semester.totalWeeks}`
                  : semester.daysUntilNext
                    ? `עוד ${semester.daysUntilNext} ימים ל${semester.nextLabel}`
                    : 'חופשה'}
              </p>
            </div>
          </div>
          {semester.daysRemaining != null && (
            <div className="text-right">
              <p className="text-2xl font-bold gradient-text">{semester.daysRemaining}</p>
              <p className="text-[10px] text-ink-muted">ימים לסוף הסמסטר</p>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {semester.progress != null && (
          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(semester.progress * 100).toFixed(0)}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
            />
          </div>
        )}

        {/* Next event */}
        {semester.nextEvent && (
          <div className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
            <MapPin size={12} className="text-amber-400" />
            <span>
              הבא: <span className="text-amber-300 font-medium">{semester.nextEvent.name}</span>
              {' '}· עוד {semester.nextEvent.daysUntil} ימים
            </span>
          </div>
        )}
      </motion.section>

      {/* ─── Leadership ─── */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink flex items-center gap-2">
          <Crown size={15} className="text-violet-400" />
          הנהגה אקדמית
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { role: 'נשיא האוניברסיטה', name: data.academic_leadership_2026.president, icon: Crown },
            { role: 'רקטור', name: data.academic_leadership_2026.rector, icon: GraduationCap },
            { role: 'דיקן הסטודנטים', name: data.academic_leadership_2026.student_dean, icon: Users },
            { role: 'מזכירה אקדמית', name: data.academic_leadership_2026.academic_secretary, icon: UserCog },
          ].map(({ role, name, icon: Icon }) => (
            <div key={role} className="glass rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                <Icon size={15} className="text-violet-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-ink-subtle">{role}</p>
                <p className="text-sm text-ink font-medium truncate">{name}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Faculties ─── */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink flex items-center gap-2">
          <BookOpen size={15} className="text-indigo-400" />
          פקולטות ({data.academic_faculties.length})
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {data.academic_faculties.map((f: any, i: number) => {
            const duration =
              f.study_duration_bsc ||
              f.study_duration_ba ||
              f.medicine_program_duration
            return (
              <motion.div
                key={f.faculty_name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass rounded-xl p-4 space-y-2"
              >
                <h3 className="text-sm font-semibold text-ink leading-snug">{f.faculty_name}</h3>
                <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                  <Users size={11} />
                  <span>{f.dean}</span>
                </div>
                {duration && (
                  <div className="flex items-center gap-2 text-[11px] text-indigo-400">
                    <Calendar size={11} />
                    <span>משך לימודים: {duration}</span>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ─── Requirements ─── */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink flex items-center gap-2">
          <ShieldCheck size={15} className="text-emerald-400" />
          דרישות אקדמיות
        </h2>
        <div className="grid md:grid-cols-3 gap-3">
          <RequirementCard
            icon={Globe}
            title="אנגלית"
            color="emerald"
            lines={[
              data.academic_requirements.english_language.mandatory_courses,
              data.academic_requirements.english_language.exemption_level,
              data.academic_requirements.english_language.time_limit,
            ]}
          />
          <RequirementCard
            icon={Languages}
            title="עברית"
            color="indigo"
            lines={[
              data.academic_requirements.hebrew_language.exemption_score,
              data.academic_requirements.hebrew_language.mandatory_continuance,
            ]}
          />
          <RequirementCard
            icon={ShieldCheck}
            title="מניעת הטרדה מינית"
            color="amber"
            lines={[
              data.academic_requirements.sexual_harassment_prevention.requirement_type,
              data.academic_requirements.sexual_harassment_prevention.deadline,
            ]}
          />
        </div>
      </section>

      {/* ─── Awards ─── */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink flex items-center gap-2">
          <Award size={15} className="text-amber-400" />
          פרסי הצטיינות
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { title: 'פרס הרקטור', data: data.excellence_and_awards.rector_award, color: 'from-amber-500/20 to-yellow-500/10', border: 'border-amber-500/30', text: 'text-amber-300' },
            { title: "פרס הדיקן", data: data.excellence_and_awards.dean_award, color: 'from-violet-500/20 to-indigo-500/10', border: 'border-violet-500/30', text: 'text-violet-300' },
            { title: 'פרס ראש המחלקה', data: data.excellence_and_awards.department_head_award, color: 'from-indigo-500/20 to-sky-500/10', border: 'border-indigo-500/30', text: 'text-indigo-300' },
          ].map((a) => (
            <div
              key={a.title}
              className={`rounded-2xl p-4 border ${a.border}`}
              style={{ background: `linear-gradient(135deg, rgba(245,158,11,0.08), rgba(139,92,246,0.04))` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Award size={14} className={a.text} />
                <h3 className={`text-sm font-bold ${a.text}`}>{a.title}</h3>
              </div>
              <p className="text-2xl font-bold text-ink">{a.data.threshold_avg}<span className="text-sm text-ink-muted">+</span></p>
              <p className="text-[11px] text-ink-muted mt-1">{a.data.quota}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Services ─── */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink flex items-center gap-2">
          <Heart size={15} className="text-pink-400" />
          דיקאנט ושירותי סטודנט
        </h2>
        <div className="glass rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-[11px] font-semibold text-pink-300 mb-1.5">סיוע כלכלי</p>
            <p className="text-xs text-ink-muted leading-relaxed">{data.student_services_and_dekanat.financial_aid}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-pink-300 mb-1.5">תמיכה אקדמית</p>
            <ul className="space-y-1">
              {data.student_services_and_dekanat.academic_support.map((s: string) => (
                <li key={s} className="text-xs text-ink-muted flex items-start gap-2">
                  <span className="text-pink-400/60 mt-0.5">•</span><span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-pink-300 mb-1.5">שירותים פסיכולוגיים</p>
            <p className="text-xs text-ink-muted leading-relaxed">{data.student_services_and_dekanat.psychological_services}</p>
          </div>
        </div>
      </section>

      {/* ─── Campuses ─── */}
      <section className="flex items-center gap-3 text-xs text-ink-subtle justify-center pt-2">
        <MapPin size={12} />
        <span>קמפוסים: {data.university_overview.campuses.join(' · ')}</span>
      </section>
    </div>
  )
}

// ── Reusable requirement card ──
function RequirementCard({
  icon: Icon, title, color, lines,
}: {
  icon: any; title: string; color: 'emerald' | 'indigo' | 'amber'; lines: string[]
}) {
  const colors = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    indigo:  { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/20' },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
  }[color]

  return (
    <div className={`glass rounded-xl p-4 border ${colors.border} space-y-3`}>
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center`}>
          <Icon size={14} className={colors.text} />
        </div>
        <h3 className="text-sm font-bold text-ink">{title}</h3>
      </div>
      <ul className="space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className="text-[11px] text-ink-muted leading-relaxed flex items-start gap-1.5">
            <span className={`${colors.text} mt-1 flex-shrink-0`}>▸</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
