'use client'

/**
 * Landing page — matches the app's dark + glass + indigo/violet aesthetic.
 * No quotes, no signature blocks — just what SmartDesk is and what's coming.
 */

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  BookOpen, MessageCircle, GraduationCap, Calendar, Sparkles,
  ArrowLeft, CheckCircle, Clock, Wand2, Layers, Bot,
} from 'lucide-react'
import Image from 'next/image'

/* ── What's inside (already works) ────────────────────────────── */
const features = [
  {
    Icon: BookOpen,
    title: 'קורס = סיכום + מטלות + קבצים',
    desc: 'כל קורס עמוד אחד. סיכומים, מטלות, PDFs, קישורים — במקום אחד.',
  },
  {
    Icon: Sparkles,
    title: 'Claude מכיר את החומר שלך',
    desc: 'שואל שאלה? הוא מסתכל בסיכומים ובמטלות שלך ועונה בעברית.',
  },
  {
    Icon: GraduationCap,
    title: 'מעקב נק״ז + פרסי הצטיינות',
    desc: 'כמה נק״ז צברת, ממוצע לפרס הרקטור (95), הדיקן (91), ראש המחלקה (87).',
  },
  {
    Icon: Calendar,
    title: 'Moodle + Google Calendar — אוטומטי',
    desc: 'קורסים ומטלות מיובאים מהמודל. אירועים מהיומן מופיעים בלוח.',
  },
]

/* ── Getting started ──────────────────────────────────────────── */
const steps = [
  {
    n: '01',
    title: 'התחבר עם Google',
    desc: 'חשבון אחד — כניסה, Drive, Calendar. בלי סיסמה חדשה לזכור.',
  },
  {
    n: '02',
    title: 'חבר Moodle',
    desc: 'דרך התוסף לכרום (מחשב) או הזנת שם משתמש + סיסמה (נייד).',
  },
  {
    n: '03',
    title: 'תתחיל ללמוד',
    desc: 'דשבורד, סיכומים, מעקב, AI — הכל במקום אחד. עברית.',
  },
]

/* ── Coming soon — gives the product momentum ────────────────── */
const comingSoon = [
  {
    Icon: Layers,
    tag: 'בפיתוח',
    title: 'פרוייקטור',
    desc: 'מעקב אחרי פרויקטים ארוכי טווח — מטלות, ציון-ביניים, מעקב התקדמות בזמן אמת.',
  },
  {
    Icon: Bot,
    tag: 'בפיתוח',
    title: 'צ\'אטבוט שמבין את הלימודים שלך',
    desc: 'שואל על חומר ומקבל תשובה מהסיכומים, המטלות וה-PDFs שהעלית — בעברית.',
  },
  {
    Icon: Wand2,
    tag: 'בפיתוח',
    title: 'סידור קורסים חכם (+ משחק ידני)',
    desc: 'המערכת מסווגת קורסים לסמסטרים אוטומטית. לא הצליחה? תסדר בעצמך בדראג-אנד-דרופ או במשחק מהיר.',
  },
]

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-base text-ink overflow-hidden" dir="rtl">
      {/* Background mesh — same as dashboard aesthetic */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ backgroundImage: 'var(--tw-gradient-mesh, none)' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-mesh" />

      {/* Floating orbs for depth */}
      <div
        className="pointer-events-none absolute top-20 -right-20 w-96 h-96 rounded-full blur-3xl animate-float-slow"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute top-[40%] -left-20 w-96 h-96 rounded-full blur-3xl animate-float"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.16) 0%, transparent 70%)' }}
      />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-glow-sm"
               style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            <GraduationCap size={18} className="text-white" />
          </div>
          <span className="text-xl font-semibold gradient-text tracking-tight">SmartDesk</span>
        </div>
        <Link
          href="/auth"
          className="text-sm text-ink-muted hover:text-ink transition-colors px-4 py-2 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/5"
        >
          התחברות ←
        </Link>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative z-10 px-6 sm:px-10 pt-10 sm:pt-16 pb-20 max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Kicker badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-ink-muted mb-6">
            <Sparkles size={12} style={{ color: '#a78bfa' }} />
            <span>מבוסס Claude · נתונים ב-Google Drive שלך</span>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold mb-6 leading-tight">
            <span className="text-ink">המערכת שמחליפה</span>
            <br />
            <span className="gradient-text">את המודל.</span>
          </h1>

          <p className="text-lg sm:text-xl text-ink-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            קורסים, מטלות, סיכומים, צ'אט AI, לוח שנה — במקום אחד.
            מתחבר ל-Moodle ול-Google, ונשאר מסודר אפילו בסמסטר ב'.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/auth">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="px-7 py-3.5 rounded-xl text-base font-semibold flex items-center gap-2.5 btn-gradient shadow-glow"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" opacity="0.9"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" opacity="0.85"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" opacity="0.95"/>
                </svg>
                התחבר עם Google
              </motion.button>
            </Link>
            <p className="text-xs text-ink-muted max-w-[200px] text-start leading-relaxed">
              חינם · בלי חשבון חדש
              <br />
              הנתונים שלך בדרייב שלך
            </p>
          </div>
        </motion.div>
      </section>

      {/* ─── How it works ─── */}
      <section className="relative z-10 px-6 sm:px-10 py-16 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs tracking-[0.2em] uppercase mb-2" style={{ color: '#a5b4fc' }}>איך מתחילים</p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            <span className="text-ink">שלוש דקות,</span> <span className="gradient-text">שלושה צעדים</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="glass p-6 rounded-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="text-3xl font-bold gradient-text">{s.n}</div>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <h3 className="text-lg font-semibold text-ink mb-2">{s.title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Features (what works now) ─── */}
      <section className="relative z-10 px-6 sm:px-10 py-16 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs tracking-[0.2em] uppercase mb-2" style={{ color: '#a5b4fc' }}>מה יש עכשיו</p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            <span className="text-ink">לא עוד פורטל. </span>
            <span className="gradient-text">מערכת אמיתית.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: (i % 2) * 0.08, duration: 0.5 }}
              className="glass p-6 rounded-2xl flex gap-4"
            >
              <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center shadow-glow-sm"
                   style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))' }}>
                <f.Icon size={20} style={{ color: '#a5b4fc' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-ink mb-1.5">{f.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Coming soon ─── */}
      <section className="relative z-10 px-6 sm:px-10 py-16 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs tracking-[0.2em] uppercase mb-2" style={{ color: '#a5b4fc' }}>בקרוב</p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            <span className="text-ink">מה שאנחנו </span>
            <span className="gradient-text">בונים עכשיו</span>
          </h2>
          <p className="text-sm text-ink-muted mt-3 max-w-xl mx-auto">
            הפיצ'רים הבאים — בשלבי פיתוח. יצאו באחד העדכונים הקרובים.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {comingSoon.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="glass p-6 rounded-2xl relative overflow-hidden group"
            >
              {/* Shimmer overlay */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                   style={{ background: 'linear-gradient(120deg, transparent 30%, rgba(139,92,246,0.08) 50%, transparent 70%)' }}
              />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                       style={{ background: 'rgba(139,92,246,0.15)' }}>
                    <c.Icon size={18} style={{ color: '#c4b5fd' }} />
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                    <Clock size={9} />
                    {c.tag}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-ink mb-2">{c.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{c.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Bottom CTA ─── */}
      <section className="relative z-10 px-6 sm:px-10 py-20 max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="glass p-10 rounded-3xl"
        >
          <h2 className="text-3xl sm:text-5xl font-bold mb-4">
            <span className="text-ink">סמסטר ב' מתחיל. </span>
            <span className="gradient-text">אל תתחיל מבולגן.</span>
          </h2>
          <p className="text-ink-muted mb-8 max-w-lg mx-auto">
            פחות טאבים פתוחים, פחות חיפוש בפורטל, יותר זמן ללמוד.
          </p>
          <Link href="/auth">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="px-8 py-4 rounded-xl text-base font-semibold inline-flex items-center gap-2.5 btn-gradient shadow-glow"
            >
              <span>התחבר עם Google</span>
              <ArrowLeft size={16} />
            </motion.button>
          </Link>
          <div className="flex items-center justify-center gap-4 mt-6 text-xs text-ink-muted flex-wrap">
            <span className="inline-flex items-center gap-1"><CheckCircle size={12} style={{ color: '#10b981' }} /> חינם</span>
            <span className="text-ink-subtle">·</span>
            <span className="inline-flex items-center gap-1"><CheckCircle size={12} style={{ color: '#10b981' }} /> ללא פרסומות</span>
            <span className="text-ink-subtle">·</span>
            <span className="inline-flex items-center gap-1"><CheckCircle size={12} style={{ color: '#10b981' }} /> הנתונים אצלך</span>
          </div>
        </motion.div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 border-t border-white/5 mt-10">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-8 flex items-center justify-between flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <GraduationCap size={12} className="text-white" />
            </div>
            <span className="text-sm font-medium text-ink">SmartDesk</span>
            <span className="text-xs text-ink-subtle">© 2026</span>
          </div>
          <p className="text-xs text-ink-muted">
            פרויקט עצמאי · לא קשור רשמית ל-BGU
            {' · '}
            <Link href="/legal/privacy-policy" className="hover:text-ink transition-colors">פרטיות</Link>
            {' · '}
            <Link href="/legal/terms-of-service" className="hover:text-ink transition-colors">תנאים</Link>
            {' · '}
            <Link href="/legal/disclaimer" className="hover:text-ink transition-colors">כתב ויתור</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
