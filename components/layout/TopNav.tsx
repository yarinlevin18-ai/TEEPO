'use client'

/**
 * TEEPO v2 top navigation — direct port of teepo-design/mockup_dashboard.html
 * (and the matching nav strip in mockup_tasks.html, mockup_summaries.html,
 * mockup_todos.html).
 *
 * Layout (right-to-left on RTL):
 *   <Logo /> · primary links · divider · tool links · spacer ·
 *   Moodle status pill · user pill (avatar + name + university)
 *
 * Primary links are the three v2-redesigned pages (Dashboard / Tasks / המוח).
 * Tool links are the remaining pages we kept reachable but didn't redesign
 * in commit 1–10. Todos sits with primary because it's a v2-new page.
 *
 * Mobile: collapses to a hamburger that opens the same nav as a side sheet.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import {
  LayoutDashboard, CheckSquare, ListChecks, Brain,
  GraduationCap, Building2, Settings, Menu, X, LogOut,
} from 'lucide-react'
import Logo from '@/components/Logo'
import { useAuth } from '@/lib/auth-context'
import { useUniversityName, useUniversityCode } from '@/lib/use-university'
import { useDB } from '@/lib/db-context'
import { resolveDisplayName, resolveInitials } from '@/lib/display-name'

const PRIMARY = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'בית' },
  { href: '/tasks',     icon: CheckSquare,    label: 'מטלות',  countKey: 'tasks' as const },
  { href: '/todos',     icon: ListChecks,     label: 'משימות', countKey: 'todos' as const },
  { href: '/summaries', icon: Brain,          label: 'המוח' },
]

const TOOLS = [
  { href: '/credits',    icon: GraduationCap, label: 'מעקב נק"ז' },
  { href: '/university', icon: Building2,     label: 'על האוניברסיטה' },
  { href: '/settings',   icon: Settings,      label: 'הגדרות' },
]

interface Props {
  mobileOpen?: boolean
  onMobileToggle?: () => void
}

export default function TopNav({ mobileOpen = false, onMobileToggle }: Props) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const universityName = useUniversityName()
  const universityCode = useUniversityCode()
  const { db } = useDB()

  // Block body scroll while mobile sheet is open
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mobileOpen])

  // /tasks shows academic assignments (label: "מטלות"). /todos shows
  // personal study tasks (label: "משימות"). Both data shapes use
  // is_completed (per types/index.ts).
  const counts = {
    tasks: db?.assignments?.filter((a: any) => !a.is_completed).length,
    todos: db?.tasks?.filter((t: any) => !t.is_completed).length,
  } as Record<string, number | undefined>

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  // Shared name resolution — same priority as the dashboard greeting so the
  // top-nav pill and the "שלום X" line always agree.
  const nameSources = {
    userMetadata: user?.user_metadata as Record<string, unknown> | undefined,
    email: user?.email,
    driveDisplayName: db?.settings?.display_name as string | undefined,
  }
  const initials = resolveInitials(nameSources)
  const displayName = resolveDisplayName(nameSources)
  const universityShort = universityCode === 'tau' ? 'TAU' : universityCode === 'bgu' ? 'BGU' : ''
  // Moodle connection state isn't part of DriveDB yet — settings carries
  // it under an unstructured slot until /moodle gets its v2 wiring.
  const moodleConnected = Boolean((db?.settings as any)?.moodle_connected)

  function NavLink({ href, icon: Icon, label, count }: any) {
    const active = isActive(href)
    return (
      <Link href={href} className={`tn-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
        <Icon className="ico" size={15} />
        <span>{label}</span>
        {typeof count === 'number' && count > 0 && <span className="count">{count}</span>}
      </Link>
    )
  }

  return (
    <>
      <nav className="topnav-v2" aria-label="ניווט ראשי">
        <Logo href="/dashboard" />

        <div className="tn-section tn-desktop">
          {PRIMARY.map(it => (
            <NavLink key={it.href} {...it} count={it.countKey ? counts[it.countKey] : undefined} />
          ))}
        </div>

        <div className="tn-divider tn-desktop" />

        <div className="tn-section tn-desktop">
          {TOOLS.map(it => <NavLink key={it.href} {...it} />)}
        </div>

        <div className="tn-spacer" />

        <div className="moodle-pill tn-desktop" title={moodleConnected ? 'Moodle מסונכרן' : 'Moodle לא מחובר'}>
          <span className={`pulse ${moodleConnected ? 'on' : 'off'}`} aria-hidden />
          <span>{moodleConnected ? 'Moodle מסונכרן' : 'Moodle לא מחובר'}</span>
        </div>

        {user && (
          <div className="user-pill tn-desktop" title={displayName}>
            <div className="info">
              <strong>{displayName || 'משתמש'}</strong>
              {universityShort && (
                <small>{universityShort}{universityName ? ` · ${universityName}` : ''}</small>
              )}
            </div>
            <div className="av">{initials}</div>
          </div>
        )}

        <button
          className="tn-burger tn-mobile"
          onClick={onMobileToggle}
          aria-label={mobileOpen ? 'סגור תפריט' : 'פתח תפריט'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile drawer — same links, opens from the side */}
      {mobileOpen && (
        <>
          <div className="tn-backdrop" onClick={onMobileToggle} aria-hidden />
          <aside className="tn-drawer" role="dialog" aria-label="תפריט ניווט">
            <div className="tn-drawer-head">
              <Logo href="/dashboard" />
              <button className="tn-burger" onClick={onMobileToggle} aria-label="סגור תפריט"><X size={20} /></button>
            </div>
            <nav className="tn-drawer-nav">
              {PRIMARY.map(it => (
                <NavLink key={it.href} {...it} count={it.countKey ? counts[it.countKey] : undefined} />
              ))}
              <div className="tn-drawer-divider" />
              {TOOLS.map(it => <NavLink key={it.href} {...it} />)}
            </nav>
            <div className="tn-drawer-foot">
              <div className="moodle-pill">
                <span className={`pulse ${moodleConnected ? 'on' : 'off'}`} aria-hidden />
                <span>{moodleConnected ? 'Moodle מסונכרן' : 'Moodle לא מחובר'}</span>
              </div>
              <button className="tn-signout" onClick={() => signOut()}>
                <LogOut size={15} /> יציאה
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
