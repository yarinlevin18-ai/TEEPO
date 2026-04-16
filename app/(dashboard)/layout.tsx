'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import Sidebar from '@/components/layout/Sidebar'
import AIChatWidget from '@/components/AIChatWidget'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth')
    }
  }, [user, loading, router])

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
    <div className="flex min-h-screen bg-base">
      {/* Aurora animated mesh background */}
      <div className="aurora-mesh">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
        <div className="aurora-blob aurora-blob-4" />
      </div>

      <Sidebar />
      <main className="flex-1 overflow-auto relative z-[1]">
        {children}
      </main>
      <AIChatWidget />
    </div>
  )
}
