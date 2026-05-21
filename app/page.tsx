/**
 * Landing page — locked-design v2 (cream redesign).
 *
 * Source of truth: teepo-design/mockup_landing.html (locked 2026-05-19).
 *
 * Section order (top → bottom, mirrors the mockup):
 *   1. Logo row — shared <Logo variant="hero" /> (open book + wordmark)
 *   2. Hero    — h1 "פלטפורמת לימודים חכמה לסטודנטים." + 2 sublines
 *                + Google CTA → /auth + restriction pill
 *   3. Features — 3 leaf-themed cards (🍃 🌳 🍂)
 *   4. UI footer — browser-chrome motif (traffic-light dots + links)
 *
 * The page opts into the global `.cream-page` shell for the warm paper
 * grain background + slow drifting color washes (same pattern dashboard-v2
 * and settings-v2 use). All page-specific styling lives under the
 * `.landing-v2-*` namespace at the end of app/globals.css.
 *
 * Mockup-only elements deliberately omitted in production:
 *   - The falling-leaves animation overlay (.leaves-fall) — performance
 *     hit on mobile, not part of the brand spec.
 *
 * The previous landing implementation (with top nav, "how it works" steps,
 * trust badges, and final CTA) was replaced wholesale per the v2 mockup,
 * which is a single-page funnel: see the book, read the promise, click
 * sign-in. No marketing scroll, no second CTA.
 */
import Logo from '@/components/Logo'
import HeroV2 from '@/components/landing/v2/Hero'
import FeaturesBarV2 from '@/components/landing/v2/FeaturesBar'
import UIFooterV2 from '@/components/landing/v2/UIFooter'

export const metadata = {
  title: 'teepo — פלטפורמת לימודים חכמה לסטודנטים',
  description:
    'פלטפורמה אחת לכל החיים האקדמיים. קבצים, סיכומים ולוח זמנים — נשמרים אצלך ב-Google Drive. פתוח לסטודנטים של אונ׳ בן-גוריון ואונ׳ תל-אביב.',
}

export default function LandingPage() {
  return (
    <div className="cream-page landing-v2">
      <div className="landing-v2-content">
        <div className="landing-v2-logo-row">
          <Logo variant="hero" />
        </div>
        <HeroV2 />
      </div>

      <FeaturesBarV2 />
      <UIFooterV2 />
    </div>
  )
}
