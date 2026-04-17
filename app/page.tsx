'use client'

/**
 * Landing page — editorial redesign.
 * Less AI-template: serif display, grain texture, asymmetric layout,
 * off-white + single warm accent instead of indigo→violet gradient spam.
 */

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  BookOpen, MessageCircle, GraduationCap, Calendar, Wifi, Sparkles,
  ArrowLeft,
} from 'lucide-react'
import Image from 'next/image'

/* ── 4 features — short, editorial, not template ── */
const features = [
  {
    kbd: 'A',
    title: 'קורס = סיכום + מטלות + קבצים',
    desc: 'כל קורס עמוד אחד. סיכומים לכל שיעור, מטלות, קבצים, קישורים. בלי לחפש בשלושה מקומות.',
  },
  {
    kbd: 'B',
    title: 'Claude יודע את הקורסים שלך',
    desc: 'שואל שאלה על חומר? הוא מסתכל בסיכומים שלך ועונה בעברית. לא עוד העתק־הדבק לצ\'אט.',
  },
  {
    kbd: 'C',
    title: 'מעקב נק״ז + פרסי הצטיינות',
    desc: 'כמה נק״ז צברת, כמה חסר. ממוצע לפרס הרקטור (95), הדיקן (91), ראש המחלקה (87) — מולך בדשבורד.',
  },
  {
    kbd: 'D',
    title: 'Moodle + Google Calendar — אוטומטי',
    desc: 'ההרחבה לכרום מייבאת קורסים ומטלות מהפורטל. האירועים שלך מ-Calendar מופיעים בלוח.',
  },
]

/* ── 3 simple steps, editorial ── */
const steps = [
  {
    n: '01',
    title: 'Google (פעם אחת)',
    desc: 'חשבון אחד — כניסה, Drive (הנתונים שלך), Calendar. אין סיסמאות, אין מייל אימות.',
  },
  {
    n: '02',
    title: 'Chrome extension (דקה)',
    desc: 'מתחבר פעם אחת ל-BGU Moodle. הקורסים נכנסים אוטומטית בפעם הבאה שתיכנס לאתר.',
  },
  {
    n: '03',
    title: 'ללמוד',
    desc: 'מעכשיו — דשבורד, סיכומים, מעקב, AI. הכל במקום אחד. עברית.',
  },
]

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-base overflow-hidden" dir="rtl">
      {/* Grain texture — single layer, very subtle */}
      <div className="grain" />

      {/* Nav — simple, asymmetric */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <Image src="/logo-128.png" alt="" width={32} height={32} className="rounded-md opacity-90" />
          <span className="font-serif text-xl text-paper tracking-tight">SmartDesk</span>
        </div>
        <Link
          href="/auth"
          className="text-sm text-paper-muted hover:text-paper transition-colors border-b border-paper-subtle/40 hover:border-clay pb-0.5"
        >
          ← התחברות
        </Link>
      </nav>

      {/* ─── Hero — asymmetric: right-aligned headline, left column is a quiet meta block ─── */}
      <section className="relative z-10 px-6 sm:px-10 pt-10 sm:pt-20 pb-24 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 items-end">
          {/* Right side (main) — 8 cols */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-8"
          >
            {/* Tiny kicker — not a glass badge */}
            <p className="text-xs tracking-[0.2em] text-clay mb-6 uppercase">
              <span className="text-paper-subtle">—</span> פרויקט של סטודנט, לסטודנטים
            </p>

            {/* Editorial headline — serif, mixed weights, one word colored */}
            <h1 className="display-serif text-5xl sm:text-6xl md:text-7xl text-paper mb-7">
              ככה נראה <em>סדר</em>
              <br />
              בלימודים,
              <br />
              <span className="hand-underline">בשנת 2026</span>.
            </h1>

            <p className="font-sans text-paper-muted text-lg leading-relaxed max-w-xl mb-10">
              SmartDesk אוסף את הקורסים, המטלות, הסיכומים וה-AI למקום אחד. מתחבר
              ל-Moodle, מסתנכרן עם Google, שומר הכל ב-Drive שלך.{' '}
              <span className="text-paper">עברית. חינם. פתוח.</span>
            </p>

            {/* CTA — solid button, no gradient, no glow */}
            <div className="flex items-center gap-5 flex-wrap">
              <Link href="/auth">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-7 py-3.5 rounded-md text-base font-semibold flex items-center gap-2.5 transition-all"
                  style={{ background: '#f4ede0', color: '#0f1117' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  התחבר עם Google
                </motion.button>
              </Link>
              <p className="text-xs text-paper-subtle max-w-[220px] leading-relaxed">
                אין חשבון חדש ליצור. אין סיסמה לזכור.
                <br />
                הנתונים בדרייב שלך.
              </p>
            </div>
          </motion.div>

          {/* Left side (meta) — 4 cols, quiet */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="lg:col-span-4 lg:pl-8 lg:border-l lg:border-paper-subtle/20"
          >
            <div className="space-y-5 text-[13px] text-paper-muted leading-relaxed">
              <div>
                <p className="text-paper-subtle text-[11px] uppercase tracking-widest mb-1">הסיפור</p>
                <p>
                  בניתי את SmartDesk כי נמאס לי לפתוח ארבעה טאבים כדי לדעת מתי מגישים.
                  הפכתי אותו לכלי שאני משתמש בו בכל יום —
                  ועכשיו גם אתה.
                </p>
              </div>
              <div className="pt-3 border-t border-paper-subtle/15">
                <p className="signature text-clay-400">— יריין לוין</p>
                <p className="text-[11px] text-paper-subtle mt-1">
                  סטודנט לפוליטיקה וחדשנות · אוניברסיטת בן־גוריון
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Divider — editorial rule ─── */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10">
        <div className="flex items-center gap-4 text-paper-subtle">
          <span className="font-serif italic text-sm">§</span>
          <div className="h-px flex-1 bg-paper-subtle/15" />
        </div>
      </div>

      {/* ─── How it works — 3 steps, editorial, numbered, NOT in glass cards ─── */}
      <section className="relative z-10 px-6 sm:px-10 py-24 max-w-6xl mx-auto">
        <div className="mb-14 max-w-2xl">
          <p className="text-xs tracking-[0.2em] text-clay mb-3 uppercase">איך מתחילים</p>
          <h2 className="display-serif text-3xl sm:text-4xl text-paper">
            שלוש דקות, <em>שלושה צעדים</em>.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-12 md:gap-8">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.12, duration: 0.6 }}
              className="relative"
            >
              <p className="font-serif text-5xl text-clay/70 mb-3 leading-none">{s.n}</p>
              <h3 className="font-serif text-xl text-paper mb-2">{s.title}</h3>
              <p className="text-sm text-paper-muted leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Features — editorial list, not glass grid ─── */}
      <section className="relative z-10 px-6 sm:px-10 py-24 max-w-6xl mx-auto border-t border-paper-subtle/15">
        <div className="mb-14 max-w-2xl">
          <p className="text-xs tracking-[0.2em] text-clay mb-3 uppercase">מה יש בפנים</p>
          <h2 className="display-serif text-3xl sm:text-4xl text-paper">
            לא עוד <em>מערכת ניהול לימודים</em>.<br />
            משהו שבאמת משתמשים בו.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-x-14 gap-y-10">
          {features.map((f, i) => (
            <motion.div
              key={f.kbd}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: (i % 2) * 0.08, duration: 0.55 }}
              className="flex gap-5"
            >
              {/* Letter in a thin square — feels like a reference mark in a book */}
              <div className="flex-shrink-0 w-9 h-9 rounded-sm border border-clay/40 flex items-center justify-center">
                <span className="font-serif text-base text-clay">{f.kbd}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-serif text-lg text-paper mb-2 leading-snug">{f.title}</h3>
                <p className="text-sm text-paper-muted leading-relaxed">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Why it's different — pull quote style ─── */}
      <section className="relative z-10 px-6 sm:px-10 py-24 max-w-4xl mx-auto">
        <blockquote className="relative">
          <span className="absolute -top-6 -right-2 font-serif text-8xl text-clay/25 leading-none select-none">&ldquo;</span>
          <p className="display-serif text-2xl sm:text-3xl text-paper leading-relaxed max-w-3xl relative z-10">
            אני לא אוהב אפליקציות שגובות ממני כסף על הנתונים שלי.
            SmartDesk <em>לא עושה את זה</em> — הכל נשמר ב-Google Drive שלך.
            אם תרצה לעזוב יום אחד, פשוט תמחק את התיקייה.
          </p>
          <footer className="mt-6 text-paper-muted text-sm">
            <span className="signature text-clay-400 text-xl">— יריין</span>
            <span className="mr-3 text-paper-subtle">·</span>
            הבונה
          </footer>
        </blockquote>
      </section>

      {/* ─── Bottom CTA — minimal ─── */}
      <section className="relative z-10 px-6 sm:px-10 py-24 max-w-5xl mx-auto border-t border-paper-subtle/15">
        <div className="flex flex-col items-start gap-6">
          <h2 className="display-serif text-3xl sm:text-5xl text-paper">
            סמסטר <em>ב</em> מתחיל בעוד
            <br />
            <span className="text-paper-muted">לא כל כך הרבה.</span>
          </h2>
          <p className="text-paper-muted max-w-xl">
            אל תתחיל עם פורטל שבור ושבעה טאבים פתוחים.
            התחל מסודר.
          </p>
          <Link href="/auth">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="mt-2 px-7 py-3.5 rounded-md text-base font-semibold flex items-center gap-2.5 transition-all"
              style={{ background: '#c8a96a', color: '#0f1117' }}
            >
              <span>התחבר עם Google</span>
              <ArrowLeft size={16} />
            </motion.button>
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 border-t border-paper-subtle/15 mt-10">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-10 flex items-end justify-between flex-wrap gap-6">
          <div>
            <p className="font-serif text-lg text-paper">SmartDesk</p>
            <p className="text-xs text-paper-subtle mt-1">
              &copy; 2026 יריין לוין · בנוי בשביל BGU
            </p>
          </div>
          <p className="text-xs text-paper-subtle max-w-xs leading-relaxed">
            לא קשור רשמית לאוניברסיטת בן־גוריון. פרויקט עצמאי.
            <br />
            מקור פתוח · <Link href="/auth" className="text-paper-muted hover:text-clay border-b border-paper-subtle/30 pb-px">כניסה</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
