'use client'

/**
 * Landing page — explains what SmartDesk is + funnels to Google sign-in.
 * Entry flow: Landing → /auth (Google only) → /dashboard.
 */

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  MessageCircle, Wifi, CheckSquare, ArrowLeft, Sparkles,
  BookOpen, GraduationCap, Calendar, FileText, Lock, Cloud, Zap,
} from 'lucide-react'
import Image from 'next/image'
import GlowCard from '@/components/ui/GlowCard'

/* ── Feature grid (6 items) ── */
const features = [
  {
    icon: BookOpen,
    title: 'קורסים עם סיכומים חכמים',
    desc: 'כל קורס במקום אחד — סיכומים, מטלות, קבצים וקישורים בטאבים.',
    color: '#6366f1',
  },
  {
    icon: MessageCircle,
    title: 'SmartDesk AI',
    desc: 'Claude שיודע את הקורסים שלך, עונה בעברית, עוזר בשיעורי בית.',
    color: '#8b5cf6',
  },
  {
    icon: GraduationCap,
    title: 'מעקב נק"ז',
    desc: 'כמה נקודות צברת, כמה נשארו, ואיפה אתה עומד מול דרישות התואר.',
    color: '#10b981',
  },
  {
    icon: Sparkles,
    title: 'כלי AI מומלצים',
    desc: 'מאגר של כלי בינה מלאכותית שעוזרים בכתיבה, מחקר וסיכומים.',
    color: '#f59e0b',
  },
  {
    icon: Calendar,
    title: 'סנכרון Google Calendar',
    desc: 'האירועים שלך מ-Google מופיעים בדשבורד — מזהה הרצאות ובחינות.',
    color: '#ef4444',
  },
  {
    icon: Wifi,
    title: 'סנכרון BGU Moodle',
    desc: 'הרחבה לכרום שמייבאת קורסים ומטלות ישירות מהפורטל של אוניברסיטת בן-גוריון.',
    color: '#06b6d4',
  },
]

/* ── "How it works" — 3 steps ── */
const steps = [
  {
    num: '01',
    title: 'התחבר עם Google',
    desc: 'חשבון Google אחד = כניסה + Google Drive (הנתונים שלך) + Google Calendar.',
  },
  {
    num: '02',
    title: 'ייבא את הקורסים שלך',
    desc: 'התקן את הרחבת Chrome, התחבר ל-BGU פעם אחת, וכל הקורסים שלך נכנסים אוטומטית.',
  },
  {
    num: '03',
    title: 'תן ל-AI לעזור לך',
    desc: 'שאל שאלות, פרק מטלות לתתי-משימות, וקבל סיכומים חכמים — הכל בעברית.',
  },
]

/* ── "Why it's different" ── */
const differentiators = [
  {
    icon: Cloud,
    title: 'הנתונים שלך — בדרייב שלך',
    desc: 'אין דטאבייס מרכזי. הכל נשמר בתיקייה ייעודית ב-Google Drive שלך. אתה הבעלים, תמיד.',
  },
  {
    icon: Lock,
    title: 'בלי נעילה, בלי עלויות',
    desc: 'אין דמי מנוי. אין vendor lock-in. אם תרצה לעזוב — תוריד את הקבצים ותמשיך הלאה.',
  },
  {
    icon: Zap,
    title: 'בנוי ל-BGU',
    desc: 'שנתון, לוח שנה אקדמי, פקולטות ודרישות — כולל פרסי הרקטור והדיקן, הכל כבר בפנים.',
  },
]

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-base overflow-hidden" dir="rtl">
      {/* Animated aurora background */}
      <div className="aurora-mesh">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
        <div className="aurora-blob aurora-blob-4" />
      </div>

      {/* ─── Nav ─── */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5">
        <div className="flex items-center gap-3">
          <Image src="/logo-128.png" alt="SmartDesk" width={36} height={36} />
          <span className="font-bold text-ink text-lg">SmartDesk</span>
        </div>
        <Link
          href="/auth"
          className="text-sm font-medium text-ink-muted hover:text-ink transition-colors flex items-center gap-1.5"
        >
          <span>כניסה</span>
          <ArrowLeft size={14} />
        </Link>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-10 sm:pt-16 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="max-w-3xl mx-auto"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-sm text-accent-400 text-sm font-medium mb-7">
            <Sparkles size={14} />
            <span>מופעל על ידי Claude AI · לסטודנטים ב-BGU</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight mb-5">
            <span className="gradient-text">מערכת הלימודים</span>
            <br />
            <span className="text-ink">שהאוניברסיטה לא הצליחה לבנות</span>
          </h1>

          <p className="text-ink-muted text-lg sm:text-xl leading-relaxed mb-10 max-w-xl mx-auto">
            קורסים, מטלות, סיכומים ו-AI במקום אחד — מסונכרן עם BGU Moodle
            ו-Google Calendar, עם נתונים שנשארים שלך.
          </p>

          {/* CTA — Google sign-in */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link href="/auth">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="btn-gradient px-7 py-3.5 rounded-xl text-base font-bold flex items-center gap-2.5 shadow-glow"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff" fillOpacity=".9"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" fillOpacity=".9"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" fillOpacity=".9"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" fillOpacity=".9"/>
                </svg>
                <span>התחבר עם Google</span>
              </motion.button>
            </Link>
            <p className="text-xs text-ink-subtle max-w-xs">
              הנתונים נשמרים ב-Google Drive שלך · לא נצבר כלום אצלנו
            </p>
          </div>
        </motion.div>
      </section>

      {/* ─── How it works ─── */}
      <section className="relative z-10 px-6 py-16 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-bold tracking-widest text-accent-400 mb-2 uppercase">איך זה עובד</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-ink">
            שלושה צעדים עד שהלימודים שלך מסודרים
          </h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass rounded-2xl p-6 relative overflow-hidden"
            >
              <span className="absolute -top-4 -left-2 text-7xl font-black text-white/[0.04] leading-none select-none">
                {s.num}
              </span>
              <div className="relative">
                <p className="text-xs font-bold text-accent-400 mb-3">שלב {s.num}</p>
                <h3 className="text-base font-bold text-ink mb-2">{s.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{s.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Features grid ─── */}
      <section className="relative z-10 px-6 py-16 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-bold tracking-widest text-accent-400 mb-2 uppercase">מה יש בפנים</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-ink">
            כל מה שסטודנט צריך — ובעברית
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
            >
              <GlowCard
                className="h-full text-right"
                glowColor={`${f.color}22`}
              >
                <div className="p-5">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${f.color}1f` }}
                  >
                    <f.icon size={20} style={{ color: f.color }} />
                  </div>
                  <h3 className="font-bold text-ink mb-2 text-sm">{f.title}</h3>
                  <p className="text-ink-muted text-[13px] leading-relaxed">{f.desc}</p>
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Why it's different ─── */}
      <section className="relative z-10 px-6 py-16 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-bold tracking-widest text-accent-400 mb-2 uppercase">למה זה שונה</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-ink">
            בלי שרתים, בלי מנויים, בלי הפתעות
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {differentiators.map((d, i) => (
            <motion.div
              key={d.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass rounded-2xl p-6"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/10 flex items-center justify-center mb-4">
                <d.icon size={18} className="text-accent-400" />
              </div>
              <h3 className="text-base font-bold text-ink mb-2">{d.title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{d.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Bottom CTA ─── */}
      <section className="relative z-10 px-6 py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center glass rounded-3xl p-10 sm:p-14 relative overflow-hidden"
        >
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-bold text-ink mb-3">
              מוכן לסמסטר מסודר יותר?
            </h2>
            <p className="text-ink-muted mb-8 max-w-lg mx-auto">
              חשבון Google אחד, דקה אחת של הגדרה, והדשבורד מוכן.
            </p>
            <Link href="/auth">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="btn-gradient px-7 py-3.5 rounded-xl text-base font-bold inline-flex items-center gap-2.5 shadow-glow"
              >
                <span>התחבר עם Google</span>
                <ArrowLeft size={16} />
              </motion.button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 text-center py-8 text-ink-subtle text-xs space-y-1 border-t border-white/5">
        <div>
          <span className="gradient-text font-medium">SmartDesk</span>
          {' '}· מופעל על ידי Claude AI
        </div>
        <div>&copy; 2026 Yarin Levin. All rights reserved.</div>
      </footer>
    </div>
  )
}
