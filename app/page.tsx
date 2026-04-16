'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { GraduationCap, MessageCircle, Wifi, CheckSquare, ArrowLeft, Sparkles } from 'lucide-react'

const features = [
  {
    icon: MessageCircle,
    title: 'עוזר לימוד AI',
    desc: 'שאל כל שאלה בלימודים וקבל תשובות מפורטות בעברית מ-Claude AI',
    color: '#6366f1',
    glow: 'rgba(99,102,241,0.25)',
  },
  {
    icon: Wifi,
    title: 'חיבור BGU',
    desc: 'סנכרון אוטומטי עם Moodle ופורטל הסטודנט — קורסים, מטלות ולוח שעות',
    color: '#10b981',
    glow: 'rgba(16,185,129,0.25)',
  },
  {
    icon: CheckSquare,
    title: 'ניהול משימות',
    desc: 'פירוק מטלות עם AI, ניהול משימות יומיות ומעקב התקדמות',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.25)',
  },
]

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-base overflow-hidden flex flex-col" dir="rtl">

      {/* Background orbs */}
      <div className="orb w-96 h-96 top-[-100px] right-[-80px]"
           style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)' }} />
      <div className="orb w-80 h-80 bottom-[10%] left-[-60px]"
           style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 70%)' }} />
      <div className="orb w-64 h-64 top-[40%] left-[30%]"
           style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.15) 0%, transparent 70%)' }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-accent flex items-center justify-center shadow-glow-sm">
            <GraduationCap size={20} className="text-white" />
          </div>
          <span className="font-bold text-ink text-lg">SmartDesk</span>
        </div>
        <Link
          href="/auth"
          className="text-sm text-ink-muted hover:text-ink transition-colors flex items-center gap-1"
        >
          <span>כניסה לאפליקציה</span>
          <ArrowLeft size={14} />
        </Link>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="max-w-3xl mx-auto"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-sm text-accent-400 text-sm font-medium mb-8">
            <Sparkles size={14} />
            <span>מופעל על ידי Claude AI</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
            <span className="gradient-text">SmartDesk</span>
            <br />
            <span className="text-ink">מערכת הלימודים החכמה שלך</span>
          </h1>

          <p className="text-ink-muted text-xl leading-relaxed mb-12 max-w-xl mx-auto">
            אפליקציית לימודים אישית עם AI — מסנכרנת עם BGU, מפרקת מטלות,
            ועוזרת לך ללמוד חכם יותר.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="btn-gradient px-8 py-4 rounded-xl text-base font-bold flex items-center gap-2 shadow-glow"
              >
                <span>כנס לאפליקציה</span>
                <ArrowLeft size={18} />
              </motion.button>
            </Link>
          </div>
        </motion.div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-24 max-w-3xl w-full mx-auto">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.12, duration: 0.5 }}
              className="glass p-6 text-right"
              style={{ boxShadow: `0 0 32px ${f.glow}` }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${f.color}22` }}
              >
                <f.icon size={22} style={{ color: f.color }} />
              </div>
              <h3 className="font-bold text-ink mb-2">{f.title}</h3>
              <p className="text-ink-muted text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-ink-muted text-xs space-y-1">
        <div>
          <span className="gradient-text font-medium">SmartDesk</span>
          {' '}· מופעל על ידי Claude AI
        </div>
        <div>&copy; 2026 Yarin Levin. All rights reserved.</div>
      </footer>
    </div>
  )
}
