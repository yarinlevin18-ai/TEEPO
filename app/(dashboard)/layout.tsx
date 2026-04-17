'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { DBProvider } from '@/lib/db-context'
import Sidebar from '@/components/layout/Sidebar'
import AIChatWidget from '@/components/AIChatWidget'
import DriveConnectionBanner from '@/components/DriveConnectionBanner'
import Image from 'next/image'
import { Menu } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth')
    }
  }, [user, loading, router])

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  if (loading) {
    return (
      <div className="flex min-h-screen bg-base items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-ink-muted text-sm">טוען...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // will redirect via useEffect
  }

  return (
    <DBProvider>
      <div className="flex min-h-screen bg-base">
        {/* Aurora animated mesh background */}
        <div className="aurora-mesh">
          <div className="aurora-blob aurora-blob-1" />
          <div className="aurora-blob aurora-blob-2" />
          <div className="aurora-blob aurora-blob-3" />
          <div className="aurora-blob aurora-blob-4" />
        </div>

        {/* Mobile header bar */}
        <header
          className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center px-4 border-b border-white/5"
          style={{ background: 'rgba(15,17,23,0.95)', backdropFilter: 'blur(12px)' }}
        >
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-white/5 text-ink-muted">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 mr-3">
            <Image src="/logo-128.png" alt="SmartDesk" width={28} height={28} />
            <span className="text-sm font-bold text-ink">SmartDesk</span>
          </div>
        </header>

        <Sidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-auto relative z-[1] pt-14 lg:pt-0">
          <DriveConnectionBanner />
          {children}
        </main>
        <AIChatWidget />
      </div>
    </DBProvider>
  )
}
