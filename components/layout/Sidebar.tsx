'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, BookOpen, CheckSquare,
  FileText, MessageCircle, GraduationCap, Wifi, Plus,
} from 'lucide-react'

const NAV = [
  { href: '/dashboard',       icon: LayoutDashboard, label: 'לוח בקרה' },
  { href: '/courses/extract', icon: BookOpen,         label: 'הקורסים שלי' },
  { href: '/tasks',           icon: CheckSquare,      label: 'משימות' },
  { href: '/assignments',     icon: FileText,         label: 'מטלות' },
  { href: '/study-buddy',     icon: MessageCircle,    label: 'עוזר הלימוד' },
  { href: '/academic',        icon: GraduationCap,    label: 'ייעוץ BGU' },
  { href: '/bgu-connect',     icon: Wifi,             label: 'חיבור BGU' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="w-64 min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #161b27 0%, #0f1117 100%)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo */}
      <div className="px-5 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-glow-sm"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <GraduationCap size={20} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-ink text-sm leading-tight">מערכת לימודים</p>
            <p className="text-xs mt-0.5 gradient-text">עם בינה מלאכותית</p>
          </div>
        </div>
      </div>

      {/* Quick add */}
      <div className="px-4 py-4">
        <Link href="/courses/extract">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold btn-gradient shadow-glow-sm"
          >
            <Plus size={16} />
            <span>הוסף קורס חדש</span>
          </motion.button>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link key={href} href={href}>
              <motion.div
                whileHover={{ x: -2 }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  active ? 'text-white' : 'text-ink-muted hover:text-ink'
                }`}
                style={active ? {
                  background: 'rgba(99,102,241,0.15)',
                  borderRight: '2px solid #6366f1',
                  boxShadow: '0 0 12px rgba(99,102,241,0.12)',
                } : {
                  borderRight: '2px solid transparent',
                }}
              >
                <Icon size={18} style={{ color: active ? '#818cf8' : undefined, flexShrink: 0 }} />
                <span>{label}</span>
                {active && (
                  <motion.div
                    layoutId="sidebar-dot"
                    className="w-1.5 h-1.5 rounded-full mr-auto"
                    style={{ background: '#818cf8' }}
                  />
                )}
              </motion.div>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-5 border-t border-white/5">
        <p className="text-xs text-center gradient-text font-medium">
          מופעל על ידי Claude AI
        </p>
      </div>
    </aside>
  )
}
