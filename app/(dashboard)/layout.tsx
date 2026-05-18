'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { DBProvider, useDB } from '@/lib/db-context'
import TopNav from '@/components/layout/TopNav'
import DriveConnectionBanner from '@/components/DriveConnectionBanner'
import WakeupBanner from '@/components/WakeupBanner'
import OnboardingGate from '@/components/onboarding/OnboardingGate'
import { useMoodleStatus } from '@/lib/use-moodle-status'
import { useAutoSync } from '@/lib/use-auto-sync'

/** Map pathname → Hebrew tab label. Falls back to '' (root layout's
 *  fallback) for unknown routes so we don't accidentally clobber it. */
function pageTitleFor(pathname: string): string {
  // Sub-routes match too — /courses/123 → "קורסים", /summaries?course=x → "המוח"
  if (pathname.startsWith('/dashboard'))      return 'סקירה'
  if (pathname.startsWith('/summaries'))      return 'המוח'
  if (pathname.startsWith('/tasks'))          return 'מטלות'
  if (pathname.startsWith('/todos'))          return 'משימות'
  if (pathname.startsWith('/assignments'))    return 'מטלות ועבודות'
  if (pathname.startsWith('/courses'))        return 'הקורסים שלי'
  if (pathname.startsWith('/credits'))        return 'מעקב נק״ז'
  if (pathname.startsWith('/university'))     return 'על האוניברסיטה'
  if (pathname.startsWith('/settings'))       return 'הגדרות'
  if (pathname.startsWith('/moodle'))         return 'Moodle'
  if (pathname.startsWith('/setup'))          return 'התחלה'
  if (pathname.startsWith('/diagnostics'))    return 'אבחון'
  return ''
}

/**
 * Dashboard shell — TEEPO locked design.
 *
 * Single-column layout: sticky top navbar + scrollable main. The legacy
 * sidebar + atmospheric SkyScene are dropped per teepo-design/mockup_dashboard.html;
 * the cream paper-texture body painted in app/globals.css shows through directly.
 *
 * `qa` class on the wrapper is kept so the dashboard-scoped overrides
 * (`.qa .glass`, `.qa .clay`, `.qa .gradient-text`) continue to apply.
 * Those rules are now retuned for cream in globals.css.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth')
    }
  }, [user, loading, router])

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Per-route browser-tab title. Root layout sets a static fallback
  // ("TEEPO — הסמסטר שלך, מאורגן") that every dashboard route used to
  // share — so the browser tab gave no hint of where you were. Mapping
  // pathname → label here is cheaper than adding a metadata-exporting
  // server layout to every route folder.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const label = pageTitleFor(pathname)
    // Brand-first format: "teepo — <page>". Matches the in-page wordmark
    // (lowercase 'teepo') and puts the brand where the tab favicon sits.
    document.title = label ? `teepo — ${label}` : 'teepo — הסמסטר שלך, מאורגן'
  }, [pathname])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4"
               style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>טוען...</p>
        </div>
      </div>
    )
  }

  if (!user) return null  // useEffect will redirect

  return (
    <DBProvider>
      <DashboardShell mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}>
        {children}
      </DashboardShell>
    </DBProvider>
  )
}

/**
 * Inner shell that lives INSIDE DBProvider so it can mount the
 * background sync hooks (which call useDB). Splitting it out keeps
 * the outer layout free of DB concerns and lets the auth/router
 * effects above run without waiting for Drive to hydrate.
 */
function DashboardShell({
  mobileOpen,
  setMobileOpen,
  children,
}: {
  mobileOpen: boolean
  setMobileOpen: (next: boolean | ((prev: boolean) => boolean)) => void
  children: React.ReactNode
}) {
  // Mirror live backend Moodle session state into db.settings so the
  // TopNav pill is truthful (was static-from-cache before; lied after
  // backend sessions expired). Runs every 90s while tab is visible.
  useMoodleStatus()

  // Read the (now live) connection state from settings — passed into
  // useAutoSync so we don't waste a Render wake when Moodle is known
  // to be disconnected.
  const { db } = useDB() as any
  const moodleConnected = Boolean(db?.settings?.moodle_connected)

  // Fire one silent sync 30s after the dashboard mounts, if the last
  // automatic sync was more than 6 hours ago. Cross-tab locked via
  // localStorage so concurrent tabs don't all hit the backend.
  useAutoSync({ moodleConnected })

  return (
    <div className="qa min-h-screen flex flex-col cream-page">
      <TopNav mobileOpen={mobileOpen} onMobileToggle={() => setMobileOpen(o => !o)} />
      <main className="flex-1 relative">
        <DriveConnectionBanner />
        <WakeupBanner />
        <OnboardingGate>{children}</OnboardingGate>
      </main>
    </div>
  )
}
