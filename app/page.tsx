'use client'

import { useState } from 'react'
import Link from 'next/link'
import Teepo, { type TeepoState } from '@/components/Teepo'
import LandingBackground from '@/components/LandingBackground'
import { BookOpen, Sparkles, GraduationCap, Calendar, CheckCircle } from 'lucide-react'

const STATES: { id: TeepoState; name: string; desc: string }[] = [
  { id: 'idle',      name: 'Idle',      desc: 'נשימה, מצמוץ, ריחוף' },
  { id: 'happy',     name: 'Happy',     desc: 'קופץ, עיניים צוחקות' },
  { id: 'thinking',  name: 'Thinking',  desc: 'אנטנה מסתובבת' },
  { id: 'sassy',     name: 'Sassy',     desc: 'גלגול עיניים, חיוך עקום' },
  { id: 'sleep',     name: 'Sleep',     desc: 'עיניים סגורות, zzz' },
  { id: 'alert',     name: 'Alert',     desc: 'קופץ, אנטנה זקופה' },
  { id: 'celebrate', name: 'Celebrate', desc: 'חוגג עם קונפטי' },
  { id: 'error',     name: 'Error',     desc: 'עיניים X, מבולבל' },
]

const FEATURES = [
  { Icon: BookOpen,      title: 'קורס = סיכום + קבצים + מטלות', desc: 'כל קורס — עמוד אחד.' },
  { Icon: Sparkles,      title: 'AI שמכיר את החומר שלך',         desc: 'שואל שאלה? הוא קרא את הסיכומים שלך.' },
  { Icon: GraduationCap, title: 'מעקב נק"ז + פרסי הצטיינות',     desc: 'רקטור 95 · דיקן 91 · ראש מחלקה 87.' },
  { Icon: Calendar,      title: 'Moodle + Google Calendar',       desc: 'מיובא אוטומטית.' },
]

export default function LandingPage() {
  const [heroState, setHeroState] = useState<TeepoState>('idle')

  return (
    <div
      className="min-h-screen text-white"
      dir="rtl"
      style={{ background: 'linear-gradient(180deg, #07070D, #0D0D1A)' }}
    >
      <LandingBackground />

      {/* ── Nav ── */}
      <nav className="relative z-20 flex items-center justify-between px-6 sm:px-10 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <Teepo state="idle" size={32} />
          <span
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '-0.03em' }}
          >
            TEEPO
          </span>
        </div>
        <Link
          href="/auth"
          className="text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          style={{ color: '#8B8FA8', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          כניסה ←
        </Link>
      </nav>

      {/* ── HERO ── */}
      <section className="relative z-10 px-6 sm:px-10 pt-10 pb-20 max-w-6xl mx-auto text-center">

        {/* glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            width: 700, height: 400,
            background: 'radial-gradient(ellipse, rgba(107,91,229,0.35), transparent 70%)',
            filter: 'blur(100px)',
            zIndex: -1,
          }}
        />

        <span
          className="block text-xs font-semibold tracking-[0.18em] uppercase mb-4"
          style={{ color: '#B8A9FF' }}
        >
          Meet the mascot
        </span>

        <h1
          className="font-extrabold leading-none mb-5"
          style={{ fontSize: 'clamp(48px,8vw,80px)', letterSpacing: '-0.035em' }}
        >
          הכירו את{' '}
          <span style={{
            background: 'linear-gradient(135deg,#B8A9FF,#8B7FF0)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontFamily: "'Inter',sans-serif",
          }}>
            TEEPO
          </span>
        </h1>

        <p className="text-base mb-10 max-w-lg mx-auto leading-relaxed" style={{ color: '#8B8FA8' }}>
          העוזר האישי שלך. שובב, חכם, ולא פוחד לגלגל עיניים כשאתה דוחה מטלות.
        </p>

        {/* Hero stage */}
        <div
          className="teepo-hero-stage mx-auto mb-4"
          style={{ maxWidth: 860, height: 400 }}
        >
          <div className="teepo-shadow" />
          <Teepo state={heroState} size={240} />
        </div>
        <p className="text-xs mb-12" style={{ color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em' }}>
          לחץ על מצב כדי לשנות
        </p>

        {/* States gallery */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 max-w-3xl mx-auto mb-20">
          {STATES.map(s => (
            <button
              key={s.id}
              onClick={() => setHeroState(s.id)}
              className={`teepo-state-card flex flex-col items-center gap-2 p-3 ${heroState === s.id ? 'active' : ''}`}
            >
              <Teepo state={s.id} size={56} />
              <span className="text-[10px] font-semibold" style={{ fontFamily: "'Inter',sans-serif", color: '#fff' }}>
                {s.name}
              </span>
            </button>
          ))}
        </div>

        {/* CTA */}
        <Link href="/auth">
          <button
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-base font-semibold transition-transform hover:scale-[1.03] active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #6B5BE5, #8B7FF0)',
              boxShadow: '0 0 32px rgba(107,91,229,0.4)',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" opacity=".9"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" opacity=".85"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" opacity=".95"/>
            </svg>
            התחבר עם Google
          </button>
        </Link>
        <div className="flex items-center justify-center gap-4 mt-4 text-xs flex-wrap" style={{ color: '#8B8FA8' }}>
          <span className="flex items-center gap-1"><CheckCircle size={11} style={{ color: '#4ADE80' }} /> חינם</span>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
          <span className="flex items-center gap-1"><CheckCircle size={11} style={{ color: '#4ADE80' }} /> ללא פרסומות</span>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
          <span className="flex items-center gap-1"><CheckCircle size={11} style={{ color: '#4ADE80' }} /> הנתונים אצלך</span>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative z-10 px-6 sm:px-10 py-16 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <span
            className="block text-xs font-semibold tracking-[0.18em] uppercase mb-3"
            style={{ color: '#B8A9FF' }}
          >
            מה TEEPO עושה בשבילך
          </span>
          <h2
            className="font-bold"
            style={{ fontSize: 'clamp(28px,4vw,40px)', letterSpacing: '-0.025em' }}
          >
            יותר מסתם מסכה יפה
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="p-5 rounded-2xl flex gap-3 items-start"
              style={{
                background: 'linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.01))',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div
                className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
                style={{ background: 'rgba(107,91,229,0.2)' }}
              >
                <f.Icon size={17} style={{ color: '#B8A9FF' }} />
              </div>
              <div className="text-right">
                <h3 className="text-sm font-semibold mb-0.5">{f.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: '#8B8FA8' }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="relative z-10 mt-10 py-6 px-6 sm:px-10"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4 text-xs" style={{ color: '#8B8FA8' }}>
          <span>TEEPO © 2026 · פרויקט עצמאי</span>
          <div className="flex gap-4">
            <Link href="/legal/privacy-policy" className="hover:text-white transition-colors">פרטיות</Link>
            <Link href="/legal/terms-of-service" className="hover:text-white transition-colors">תנאים</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
