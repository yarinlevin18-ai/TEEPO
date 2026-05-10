/**
 * Landing page — locked design 2026-05-11.
 *
 * Direct port of teepo-design/mockup_landing.html. See the matching block
 * in app/globals.css (`.landing-page`) for all visual rules; this file
 * only handles structure + copy.
 *
 * Hebrew RTL is set globally on <html dir="rtl"> in app/layout.tsx; the
 * book logo + wordmark are forced LTR locally so the letters don't flip.
 */
import Logo from '@/components/Logo'
import Hero from '@/components/landing/Hero'
import FeaturesBar from '@/components/landing/FeaturesBar'
import UIFooter from '@/components/landing/UIFooter'

export const metadata = {
  title: 'TEEPO — פלטפורמת לימודים חכמה לסטודנטים',
  description:
    'פלטפורמה אחת להכל. כל הקבצים והסיכומים שלך נשמרים ב-Google Drive. החיים האקדמיים בשליטה שלך.',
}

export default function LandingPage() {
  return (
    <div className="landing-page">
      <div className="content-wrapper">
        <div className="logo-row">
          <Logo />
        </div>
        <Hero />
      </div>

      <FeaturesBar />
      <UIFooter />
    </div>
  )
}
