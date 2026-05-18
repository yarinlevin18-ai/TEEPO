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
    <div className="cream-page uni-v2">
      <div className="uni-v2-main animate-fade-in" dir="rtl">
        {/* ─── Header ─── */}
        <header className="uni-v2-head">
          <div className="uni-v2-head-icon">
            <Building2 size={22} />
          </div>
          <div className="uni-v2-head-info">
            <h1>{data.university_overview.name}</h1>
            <p>
              נוסדה ב-{data.university_overview.establishment.founded_year} ·
              {' '}{data.university_overview.campuses.length} קמפוסים
            </p>
          </div>
        </header>

        {/* ─── Current semester snapshot ─── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="uni-v2-card uni-v2-semester"
        >
          <div className="uni-v2-semester-head">
            <div className="uni-v2-semester-left">
              <div className="uni-v2-semester-icon">
                <Calendar size={18} />
              </div>
              <div>
                <h2>{semester.label}</h2>
                <p>
                  {semester.weekNumber
                    ? `שבוע ${semester.weekNumber} מתוך ${semester.totalWeeks}`
                    : semester.daysUntilNext
                      ? `עוד ${semester.daysUntilNext} ימים ל${semester.nextLabel}`
                      : 'חופשה'}
                </p>
              </div>
            </div>
            {semester.daysRemaining != null && (
              <div className="uni-v2-semester-remaining">
                <p className="value">{semester.daysRemaining}</p>
                <p className="label">ימים לסוף הסמסטר</p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {semester.progress != null && (
            <div className="uni-v2-progress">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(semester.progress * 100).toFixed(0)}%` }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="uni-v2-progress-fill"
              />
            </div>
          )}

          {/* Next event */}
          {semester.nextEvent && (
            <div className="uni-v2-next-event">
              <MapPin size={12} />
              <span>
                הבא: <strong>{semester.nextEvent.name}</strong>
                {' '}· עוד {semester.nextEvent.daysUntil} ימים
              </span>
            </div>
          )}
        </motion.section>

        {/* ─── Leadership ─── */}
        <section className="uni-v2-section">
          <h2 className="uni-v2-section-title">
            <Crown size={15} />
            הנהגה אקדמית
          </h2>
          <div className="uni-v2-leader-grid">
            {[
              { role: 'נשיא האוניברסיטה', name: data.academic_leadership_2026.president, icon: Crown },
              { role: 'רקטור', name: data.academic_leadership_2026.rector, icon: GraduationCap },
              { role: 'דיקן הסטודנטים', name: data.academic_leadership_2026.student_dean, icon: Users },
              { role: 'מזכירה אקדמית', name: data.academic_leadership_2026.academic_secretary, icon: UserCog },
            ].map(({ role, name, icon: Icon }) => (
              <div key={role} className="uni-v2-card uni-v2-leader">
                <div className="uni-v2-leader-icon">
                  <Icon size={15} />
                </div>
                <div className="uni-v2-leader-info">
                  <p className="role">{role}</p>
                  <p className="name">{name}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Faculties ─── */}
        <section className="uni-v2-section">
          <h2 className="uni-v2-section-title">
            <BookOpen size={15} />
            פקולטות ({data.academic_faculties.length})
          </h2>
          <div className="uni-v2-faculty-grid">
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
                  className="uni-v2-card uni-v2-faculty"
                >
                  <h3>{f.faculty_name}</h3>
                  <div className="uni-v2-faculty-meta">
                    <Users size={11} />
                    <span>{f.dean}</span>
                  </div>
                  {duration && (
                    <div className="uni-v2-faculty-duration">
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
        <section className="uni-v2-section">
          <h2 className="uni-v2-section-title">
            <ShieldCheck size={15} />
            דרישות אקדמיות
          </h2>
          <div className="uni-v2-req-grid">
            <RequirementCard
              icon={Globe}
              title="אנגלית"
              tone="emerald"
              lines={[
                data.academic_requirements.english_language.mandatory_courses,
                data.academic_requirements.english_language.exemption_level,
                data.academic_requirements.english_language.time_limit,
              ]}
            />
            <RequirementCard
              icon={Languages}
              title="עברית"
              tone="indigo"
              lines={[
                data.academic_requirements.hebrew_language.exemption_score,
                data.academic_requirements.hebrew_language.mandatory_continuance,
              ]}
            />
            <RequirementCard
              icon={ShieldCheck}
              title="מניעת הטרדה מינית"
              tone="amber"
              lines={[
                data.academic_requirements.sexual_harassment_prevention.requirement_type,
                data.academic_requirements.sexual_harassment_prevention.deadline,
              ]}
            />
          </div>
        </section>

        {/* ─── Awards ─── */}
        <section className="uni-v2-section">
          <h2 className="uni-v2-section-title">
            <Award size={15} />
            פרסי הצטיינות
          </h2>
          <div className="uni-v2-award-grid">
            {[
              { title: 'פרס הרקטור', data: data.excellence_and_awards.rector_award, tone: 'amber' },
              { title: 'פרס הדיקן', data: data.excellence_and_awards.dean_award, tone: 'violet' },
              { title: 'פרס ראש המחלקה', data: data.excellence_and_awards.department_head_award, tone: 'indigo' },
            ].map((a) => (
              <div key={a.title} className={`uni-v2-card uni-v2-award tone-${a.tone}`}>
                <div className="uni-v2-award-head">
                  <Award size={14} />
                  <h3>{a.title}</h3>
                </div>
                <p className="uni-v2-award-value">{a.data.threshold_avg}<span>+</span></p>
                <p className="uni-v2-award-meta">{a.data.quota}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Services ─── */}
        <section className="uni-v2-section">
          <h2 className="uni-v2-section-title">
            <Heart size={15} />
            דיקאנט ושירותי סטודנט
          </h2>
          <div className="uni-v2-card uni-v2-services">
            <div className="uni-v2-service">
              <p className="title">סיוע כלכלי</p>
              <p className="body">{data.student_services_and_dekanat.financial_aid}</p>
            </div>
            <div className="uni-v2-service">
              <p className="title">תמיכה אקדמית</p>
              <ul className="uni-v2-service-list">
                {data.student_services_and_dekanat.academic_support.map((s: string) => (
                  <li key={s}>
                    <span className="bullet">•</span><span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="uni-v2-service">
              <p className="title">שירותים פסיכולוגיים</p>
              <p className="body">{data.student_services_and_dekanat.psychological_services}</p>
            </div>
          </div>
        </section>

        {/* ─── Campuses ─── */}
        <section className="uni-v2-campuses">
          <MapPin size={12} />
          <span>קמפוסים: {data.university_overview.campuses.join(' · ')}</span>
        </section>
      </div>
    </div>
  )
}

// ── Reusable requirement card ──
function RequirementCard({
  icon: Icon, title, tone, lines,
}: {
  icon: any; title: string; tone: 'emerald' | 'indigo' | 'amber'; lines: string[]
}) {
  return (
    <div className={`uni-v2-card uni-v2-req tone-${tone}`}>
      <div className="uni-v2-req-head">
        <div className="uni-v2-req-icon">
          <Icon size={14} />
        </div>
        <h3>{title}</h3>
      </div>
      <ul className="uni-v2-req-list">
        {lines.map((l, i) => (
          <li key={i}>
            <span className="bullet">▸</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
