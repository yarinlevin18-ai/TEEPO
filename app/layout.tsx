import type { Metadata } from 'next'
import { Assistant, Heebo, Frank_Ruhl_Libre, VT323, Fredoka } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { ThemeProvider } from '@/lib/theme-context'
import ErrorBoundary from '@/components/ErrorBoundary'

// v2 locked design typography (teepo-design/CLAUDE_CODE_HANDOFF.md):
//   Assistant — body/UI; Heebo — hero headlines (900);
//   Frank Ruhl Libre — elegant italic accents (puzzle titles, eyebrows);
//   VT323 — LCD clock + timers; Fredoka — legacy wordmark fallback.
//
// Each font exposes a CSS variable so globals.css can keep using
// `var(--font-heebo)` etc. without changes.
const assistant = Assistant({
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-assistant',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
})
const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '700', '800', '900'],
  variable: '--font-heebo',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
})
const frankRuhl = Frank_Ruhl_Libre({
  subsets: ['hebrew', 'latin'],
  weight: ['500', '700', '900'],
  variable: '--font-serif',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
})
const vt323 = VT323({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-vt323',
  display: 'swap',
  fallback: ['Share Tech Mono', 'monospace'],
})
const fredoka = Fredoka({
  subsets: ['hebrew', 'latin'],
  weight: ['500', '600', '700'],
  variable: '--font-fredoka',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
})

export const metadata: Metadata = {
  title: 'teepo — הסמסטר שלך, מאורגן',
  description: 'פלטפורמת לימודים חכמה לסטודנטים. הסמסטר שלך — במקום אחד.',
  manifest: '/manifest.json',
  icons: {
    // SVG book favicon (matches the in-page <Logo /> book glyph). Browsers
    // that prefer raster fall back to the wordmark PNG. Apple touch icon
    // stays on the 512 wordmark for larger home-screen tiles.
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/teepo-256px.png', type: 'image/png' },
    ],
    apple: '/brand/teepo-512px.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fontVars = [assistant.variable, heebo.variable, frankRuhl.variable, vt323.variable, fredoka.variable].join(' ')
  return (
    <html lang="he" dir="rtl" className={fontVars}>
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
