'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, BookOpen, CheckSquare,
  FileText, MessageCircle, Wifi, Plus, LogOut, GraduationCap, Settings, StickyNote, X,
} from 'lucide-react'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { useEffect } from 'react'

const NAV = [
  { href: '/dashboard',       icon: LayoutDashboard, label: 'MyDesk' },
  { href: '/courses',         icon: BookOpen,         label: 'הקורסים שלי' },
  { href: '/tasks',           icon: CheckSquare,      label: 'משימות' },
  { href: '/assignments',     icon: FileText,         label: 'מטלות' },
  { href: '/notes',           icon: StickyNote,       label: 'הסיכומים שלי' },
  { href: '/credits',         icon: GraduationCap,    label: "מעקב נק\"ז" },
  { href: '/study-buddy',     icon: MessageCircle,    label: 'SmartDesk AI' },
  { href: '/bgu-connect',     icon: Wifi,             label: 'חיבור BGU' },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()

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
            <Image src="/logo-128.png" alt="SmartDesk" width={40} height={40} className="flex-shrink-0" />
            <div>
              <p className="font-bold text-ink text-sm leading-tight">SmartDesk</p>
              <p className="text-xs mt-0.5 gradient-text">מערכת לימודים חכמה</p>
            </div>
          </div>
        </div>

        {/* Quick add */}
        <div className="px-4 py-4">
          <Link href="/courses/extract" onClick={onMobileClose}>
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
              <Link key={href} href={href} onClick={onMobileClose}>
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

        {/* User & Footer */}
        <div className="px-4 py-4 border-t border-white/5 space-y-3">
          {user && (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ink-muted truncate" dir="ltr">
                  {user.user_metadata?.display_name || user.email}
                </p>
              </div>
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
            <p className="text-xs gradient-text font-medium">SmartDesk</p>
            <p className="text-[10px] text-ink-subtle">&copy; 2026 Yarin Levin. All rights reserved.</p>
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
            background: 'linear-gradient(180deg, #161b27 0%, #0f1117 100%)',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
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
                background: 'linear-gradient(180deg, #161b27 0%, #0f1117 100%)',
                borderLeft: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {/* Close button at top */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-sm font-bold text-ink">SmartDesk</span>
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
