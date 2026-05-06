'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { DBProvider } from '@/lib/db-context'
import { LivingDayProvider } from '@/lib/living-day-context'
import TopNav from '@/components/layout/TopNav'
import DriveConnectionBanner from '@/components/DriveConnectionBanner'
import WakeupBanner from '@/components/WakeupBanner'
import OnboardingGate from '@/components/onboarding/OnboardingGate'

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
      <LivingDayProvider>
        <div className="qa min-h-screen flex flex-col">
          <TopNav mobileOpen={mobileOpen} onMobileToggle={() => setMobileOpen(o => !o)} />
          <main className="flex-1 relative">
            <DriveConnectionBanner />
            <WakeupBanner />
            <OnboardingGate>{children}</OnboardingGate>
          </main>
        </div>
      </LivingDayProvider>
    </DBProvider>
  )
}
