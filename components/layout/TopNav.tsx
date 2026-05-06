'use client'

/**
 * TEEPO top navigation — matches mockup_dashboard.html.
 *
 * Replaces the legacy left sidebar with a sticky, blurred top bar carrying:
 *   logo · primary section · divider · tools section · spacer ·
 *   Moodle status pill · user pill (avatar + name + university)
 *
 * Hides on mobile (<lg) and falls back to a hamburger drawer that opens
 * the same nav as a sheet — mobileOpen is owned by the dashboard layout.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, BookOpen, CheckSquare, FileText, StickyNote,
  GraduationCap, Building2, Settings, Wifi, WifiOff,
  LogOut, Menu, X, Sun, Moon, MessageCircle, Sparkles,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useTheme } from '@/lib/theme-context'
import { useUniversityName, useUniversityCode } from '@/lib/use-university'
import { useDB } from '@/lib/db-context'

const PRIMARY = [
  { href: '/dashboard',   icon: LayoutDashboard, label: 'בית' },
  { href: '/courses',     icon: BookOpen,        label: 'הקורסים שלי',  countKey: 'courses' as const },
  { href: '/tasks',       icon: CheckSquare,     label: 'משימות',       countKey: 'tasks' as const },
  { href: '/assignments', icon: FileText,        label: 'מטלות',        countKey: 'assignments' as const },
  { href: '/notes',       icon: StickyNote,      label: 'הסיכומים שלי' },
]

const SECONDARY = [
  { href: '/credits',     icon: GraduationCap,  label: 'מעקב נק"ז' },
  { href: '/university',  icon: Building2,       label: 'על האוניברסיטה' },
  { href: '/study-buddy', icon: MessageCircle,  label: 'TEEPO AI' },
  { href: '/ai-tools',    icon: Sparkles,        label: 'כלי AI' },
  { href: '/moodle',      icon: Wifi,            label: 'חיבור Moodle' },
  { href: '/settings',    icon: Settings,        label: 'הגדרות' },
]

interface Props {
  mobileOpen: boolean
  onMobileToggle: () => void
}

export default function TopNav({ mobileOpen, onMobileToggle }: Props) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const universityName = useUniversityName()
  const universityCode = useUniversityCode()
  const { db } = useDB()

  // Block body scroll while mobile sheet is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const counts = {
    courses: db.courses?.length,
    tasks: db.tasks?.filter((t: any) => !t.completed).length,
    assignments: db.assignments?.filter((a: any) => !a.completed).length,
  } as Record<string, number | undefined>

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  const initials = (() => {
    const name = (user?.user_metadata?.display_name as string) || user?.email || ''
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(p => p[0]?.toUpperCase() || '')
      .join('') || 'U'
  })()
  const displayName = (user?.user_metadata?.display_name as string) || user?.email || ''
  const universityShort = universityCode === 'tau' ? 'TAU' : universityCode === 'bgu' ? 'BGU' : ''

  function NavLink({ href, icon: Icon, label, count }: any) {
    const active = isActive(href)
    return (
      <Link
        href={href}
        className={`tn-link ${active ? 'active' : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <Icon className="ico" size={15} />
        <span>{label}</span>
        {typeof count === 'number' && count > 0 && (
          <span className="count">{count}</span>
        )}
      </Link>
    )
  }

  return (
    <>
      <nav className="topnav" aria-label="ראשי">
        {/* Logo */}
        <Link href="/dashboard" className="tn-logo" aria-label="TEEPO — דף הבית">
          teep<span className="accent">o</span>
        </Link>

        {/* Desktop primary section */}
        <div className="tn-section tn-desktop">
          {PRIMARY.map(it => (
            <NavLink
              key={it.href}
              href={it.href}
              icon={it.icon}
              label={it.label}
              count={it.countKey ? counts[it.countKey] : undefined}
            />
          ))}
        </div>

        <div className="tn-divider tn-desktop" />

        <div className="tn-section tn-desktop">
          {SECONDARY.map(it => (
            <NavLink key={it.href} href={it.href} icon={it.icon} label={it.label} />
          ))}
        </div>

        <div className="tn-spacer" />

        {/* Right cluster */}
        <div className="tn-right tn-desktop">
          <button
            onClick={toggleTheme}
            className="tn-icon-btn"
            title={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
            aria-label="החלף מצב תצוגה"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {user && (
            <div className="user-pill" title={displayName}>
              <div className="info">
                <strong>{displayName.split('@')[0] || 'משתמש'}</strong>
                {universityShort && (
                  <small>{universityShort}{universityName ? ` · ${universityName}` : ''}</small>
                )}
              </div>
              <div className="av">{initials}</div>
            </div>
          )}
          <button
            onClick={() => signOut()}
            className="tn-icon-btn"
            title="התנתק"
            aria-label="התנתק"
          >
            <LogOut size={16} />
          </button>
        </div>

        {/* Mobile hamburger — only visible <lg */}
        <button
          className="tn-icon-btn tn-mobile-only"
          onClick={onMobileToggle}
          aria-label="פתח תפריט"
        >
          <Menu size={20} />
        </button>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="tn-backdrop"
              onClick={onMobileToggle}
              aria-hidden
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="tn-drawer"
              dir="rtl"
            >
              <div className="tn-drawer-head">
                <span className="tn-logo">teep<span className="accent">o</span></span>
                <button onClick={onMobileToggle} className="tn-icon-btn" aria-label="סגור">
                  <X size={18} />
                </button>
              </div>
              <div className="tn-drawer-section">
                {PRIMARY.map(it => (
                  <NavLink
                    key={it.href}
                    href={it.href}
                    icon={it.icon}
                    label={it.label}
                    count={it.countKey ? counts[it.countKey] : undefined}
                  />
                ))}
              </div>
              <div className="tn-drawer-divider" />
              <div className="tn-drawer-section">
                {SECONDARY.map(it => (
                  <NavLink key={it.href} href={it.href} icon={it.icon} label={it.label} />
                ))}
              </div>
              <div className="tn-drawer-foot">
                {user && (
                  <div className="user-pill" style={{ flex: 1 }}>
                    <div className="info">
                      <strong>{displayName.split('@')[0] || 'משתמש'}</strong>
                      {universityShort && <small>{universityShort}</small>}
                    </div>
                    <div className="av">{initials}</div>
                  </div>
                )}
                <button onClick={() => signOut()} className="tn-icon-btn" aria-label="התנתק">
                  <LogOut size={16} />
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
