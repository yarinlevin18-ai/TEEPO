/**
 * Landing page — locked design 2026-05-11, content-enriched 2026-05-11.
 *
 * Visual language ported verbatim from teepo-design/mockup_landing.html.
 * Section structure follows TEEPO_SPEC.md §5.1 + the v2.1 features that
 * actually shipped (BGU + TAU scrapers, AI on user's content, נק"ז tracker,
 * Drive + Calendar sync via drive.file).
 *
 * Order of marketing flow (top → bottom):
 *   1. Top nav (small logo + "כניסה" link)
 *   2. Hero: book logo + "חכמה" gradient + Google CTA + trust badges + restriction pill
 *   3. Features bar — 4 concrete capabilities tied to shipped PRs
 *   4. How it works — 3 onboarding steps from spec §3.1–§3.4
 *   5. Final CTA — second Google sign-in entry point
 *   6. Browser-chrome footer
 */
import Logo from '@/components/Logo'
import TopNav from '@/components/landing/TopNav'
import Hero from '@/components/landing/Hero'
import FeaturesBar from '@/components/landing/FeaturesBar'
import HowItWorks from '@/components/landing/HowItWorks'
import FinalCTA from '@/components/landing/FinalCTA'
import UIFooter from '@/components/landing/UIFooter'

export const metadata = {
  title: 'TEEPO — פלטפורמת לימודים חכמה לסטודנטים',
  description:
    'פלטפורמה אחת ל-BGU ו-TAU. ייבוא Moodle, ציונים מהפורטל, AI על החומר שלך, ונתונים שנשארים אצלך ב-Google Drive.',
}

export default function LandingPage() {
  return (
    <div className="landing-page">
      <TopNav />

      <div className="content-wrapper">
        <div className="logo-row">
          <Logo variant="hero" />
        </div>
        <Hero />
      </div>

      <FeaturesBar />
      <HowItWorks />
      <FinalCTA />
      <UIFooter />
    </div>
  )
}
