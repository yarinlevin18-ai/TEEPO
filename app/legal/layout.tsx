import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'מסמכים משפטיים — TEEPO',
}

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base" dir="rtl">
      {/* Nav */}
      <nav className="border-b border-paper-subtle/15 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-serif text-lg text-paper hover:text-clay transition-colors">
            TEEPO
          </Link>
          <div className="flex items-center gap-5 text-sm text-paper-muted">
            <Link href="/legal/privacy-policy" className="hover:text-paper transition-colors">
              מדיניות פרטיות
            </Link>
            <Link href="/legal/terms-of-service" className="hover:text-paper transition-colors">
              תנאי שימוש
            </Link>
            <Link href="/legal/disclaimer" className="hover:text-paper transition-colors">
              כתב ויתור
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-paper-subtle/15 mt-16">
        <div className="max-w-3xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-paper-subtle">
          <span>© 2026 TEEPO · יריין לוין</span>
          <span>לא קשור רשמית לאוניברסיטת בן-גוריון</span>
        </div>
      </footer>
    </div>
  )
}
