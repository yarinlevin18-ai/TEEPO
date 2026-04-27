'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, BookOpen, CheckSquare,
  FileText, MessageCircle, Wifi, LogOut, GraduationCap, Settings, StickyNote, X, Sparkles, Building2, Sun, Moon, Layers,
} from 'lucide-react'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { useTheme } from '@/lib/theme-context'
import { useUniversityName, useUniversityCode } from '@/lib/use-university'
import { useEffect } from 'react'

const NAV_GROUPS = [
  {
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'MyDesk' },
    ],
  },
  {
    label: 'לימודים',
    items: [
      { href: '/courses',     icon: BookOpen,    label: 'הקורסים שלי' },
      { href: '/tasks',       icon: CheckSquare, label: 'משימות' },
      { href: '/assignments', icon: FileText,    label: 'מטלות' },
      { href: '/notes',       icon: StickyNote,  label: 'הסיכומים שלי' },
      { href: '/notebooks',   icon: Layers,      label: 'מחברות AI' },
    ],
  },
  {
    label: 'כלים',
    items: [
      { href: '/credits',      icon: GraduationCap,  label: "מעקב נק\"ז" },
      { href: '/university',   icon: Building2,       label: 'על האוניברסיטה' },
      { href: '/study-buddy',  icon: MessageCircle,  label: 'TEEPO AI' },
      { href: '/ai-tools',     icon: Sparkles,        label: 'כלי AI' },
      { href: '/moodle',       icon: Wifi,            label: 'חיבור Moodle' },
    ],
  },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const universityName = useUniversityName()
  const universityCode = useUniversityCode()

  // Block body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  /* Shared sidebar content used by both desktop and mobile */
  function SidebarContent() {
    return (
      <>
        {/* Logo */}
        <div className="px-5 py-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Image src="/logo-128.png" alt="TEEPO" width={40} height={40} className="flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-ink text-sm leading-tight">TEEPO</p>
              <p className="text-xs mt-0.5 gradient-text">מערכת לימודים חכמה</p>
              {/* User's university — from settings.university (v2.1). Hidden
                  if no setting is present (e.g. fresh user, pre-onboarding). */}
              {universityCode && (
                <p className="text-[10px] mt-1 text-ink-subtle truncate" title={universityName}>
                  {universityName}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Nav — grouped */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p className="px-3 mb-2 text-[10px] font-bold text-ink-subtle uppercase tracking-widest">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ href, icon: Icon, label }) => {
                  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                  return (
                    <Link key={href} href={href} onClick={onMobileClose}>
                      <motion.div
                        whileHover={{ x: -2 }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                          active
                            ? 'text-white'
                            : 'text-ink-muted hover:text-ink hover:bg-white/[0.04]'
                        }`}
                      >
                        {/* Animated active indicator — slides between items */}
                        {active && (
                          <motion.div
                            layoutId="sidebar-active"
                            className="absolute inset-0 rounded-xl"
                            style={{
                              background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.10))',
                              boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.18), 0 0 20px rgba(99,102,241,0.06)',
                            }}
                            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                          />
                        )}
                        <motion.div
                          className="relative z-10 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          animate={active ? { scale: 1.05 } : { scale: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          style={active ? {
                            background: 'rgba(99,102,241,0.25)',
                          } : undefined}
                        >
                          <Icon size={16} className={active ? 'text-accent-400' : ''} />
                        </motion.div>
                        <span className="relative z-10">{label}</span>
                      </motion.div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User & Footer */}
        <div className="px-4 py-4 border-t border-white/5 space-y-3">
          {user && (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ink-muted truncate" dir="ltr">
                  {user.user_metadata?.display_name || user.email}
                </p>
              </div>
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-lg hover:bg-white/5 text-ink-subtle hover:text-amber-400 transition-colors"
                title={theme === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <Link href="/settings" onClick={onMobileClose}>
                <button
                  className="p-1.5 rounded-lg hover:bg-white/5 text-ink-subtle hover:text-indigo-400 transition-colors"
                  title="הגדרות"
                >
                  <Settings size={16} />
                </button>
              </Link>
              <button
                onClick={() => signOut()}
                className="p-1.5 rounded-lg hover:bg-white/5 text-ink-subtle hover:text-red-400 transition-colors"
                title="התנתק"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
          <div className="text-center space-y-0.5">
            <p className="text-[10px] text-ink-subtle">&copy; 2026 Yarin Levin</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Desktop sidebar — always visible at lg+ */}
      <div className="hidden lg:block">
        <aside
          className="w-64 min-h-screen flex flex-col"
          style={{
            background: 'linear-gradient(180deg, #1a1f2c 0%, #121620 100%)',
            borderLeft: '1px solid rgba(255,255,255,0.04)',
            boxShadow:
              'inset -1px 0 2px rgba(255,255,255,0.04), ' +
              'inset 0 1px 2px rgba(255,255,255,0.04), ' +
              '-4px 0 20px rgba(0,0,0,0.35)',
          }}
        >
          <SidebarContent />
        </aside>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={onMobileClose}
            />
            {/* Drawer panel — slides in from RIGHT (RTL) */}
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="lg:hidden fixed top-0 right-0 bottom-0 z-50 w-72 flex flex-col"
              style={{
                background: 'linear-gradient(180deg, #1a1f2c 0%, #121620 100%)',
                borderLeft: '1px solid rgba(255,255,255,0.04)',
                boxShadow:
                  'inset -1px 0 2px rgba(255,255,255,0.04), ' +
                  'inset 0 1px 2px rgba(255,255,255,0.04), ' +
                  '-8px 0 40px rgba(0,0,0,0.5)',
              }}
            >
              {/* Close button at top */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-sm font-bold text-ink">TEEPO</span>
                <button onClick={onMobileClose} className="p-2 rounded-lg hover:bg-white/5 text-ink-muted">
                  <X size={18} />
                </button>
              </div>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
