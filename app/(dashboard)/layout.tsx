'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import Sidebar from '@/components/layout/Sidebar'

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
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gradient-mesh">
        {children}
      </main>
    </div>
  )
}
