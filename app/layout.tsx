import type { Metadata } from 'next'
import './globals.css'
import './teepo.css'
import { AuthProvider } from '@/lib/auth-context'
import { ThemeProvider } from '@/lib/theme-context'
import ErrorBoundary from '@/components/ErrorBoundary'

export const metadata: Metadata = {
  title: 'TEEPO — הסמסטר שלך, מאורגן',
  description: 'פלטפורמת לימודים חכמה לסטודנטים. הסמסטר שלך — במקום אחד.',
  manifest: '/manifest.json',
  icons: {
    icon: '/brand/teepo-256px.png',
    apple: '/brand/teepo-512px.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Locked landing typography (teepo-design/CLAUDE_CODE_HANDOFF.md):
            Assistant — body/UI; Heebo — hero headlines (900); Fredoka — wordmark only */}
        <link
          href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700;800&family=Heebo:wght@400;700;800;900&family=Fredoka:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
