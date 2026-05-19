/**
 * LoadingScreen — full-viewport cream loading state.
 *
 * Source of truth: teepo-design/mockup_loading.html. Layout:
 *   - Centered: /brand/teepo-loading.mp4 in a 380×380 (or 70vw) frame,
 *     mask-faded at the edges and blended with the cream page via
 *     `mix-blend-mode: multiply` so the video's white card stock looks
 *     like the same paper as the rest of the app.
 *   - Below: the wordmark + a "רגע, מסדר לך הכל..." line (overridable
 *     via the optional `message` prop) + three pulsing dots
 *     (leaf green / lime / amber).
 *   - Bottom: a gradient progress hint bar sliding right.
 *
 * Server component — no client hooks needed; the video element auto-plays
 * via the native HTML attribute. The wordmark is rendered as
 * `/brand/teepo-wordmark.svg` instead of the mockup's Fredoka 42px text
 * so the brand mark stays consistent with TopNav / Logo / landing.
 *
 * RTL: `dir="rtl"` is set on the root so the Hebrew copy renders
 * correctly even if a caller mounts this outside the RTL root layout.
 *
 * Reduced motion: the global `@media (prefers-reduced-motion: reduce)`
 * rule in globals.css already collapses keyframes app-wide; this
 * component's own block opts the dot pulse + progress slide animations
 * to `none` for belt-and-suspenders clarity.
 *
 * @example
 * ```tsx
 * import LoadingScreen from '@/components/ui/LoadingScreen'
 *
 * export default function Loading() {
 *   return <LoadingScreen />
 * }
 *
 * // Custom copy:
 * <LoadingScreen message="מסנכרן עם מודל..." />
 * ```
 */
interface LoadingScreenProps {
  /** Optional Hebrew copy under the wordmark. Defaults to "רגע, מסדר לך הכל...". */
  message?: string
}

export default function LoadingScreen({
  message = 'רגע, מסדר לך הכל...',
}: LoadingScreenProps) {
  return (
    <div
      className="loading-screen-v2 cream-page"
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-screen-v2-video-wrap" aria-hidden>
        <video
          className="loading-screen-v2-video"
          autoPlay
          muted
          loop
          playsInline
        >
          <source src="/brand/teepo-loading.mp4" type="video/mp4" />
        </video>
      </div>

      <div className="loading-screen-v2-text">
        <div className="loading-screen-v2-wordmark" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/teepo-wordmark.svg" alt="" />
        </div>
        <div className="loading-screen-v2-sub">{message}</div>
        <span className="sr-only">טוען...</span>
      </div>

      <div className="loading-screen-v2-dots" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <div className="loading-screen-v2-progress" aria-hidden />
    </div>
  )
}
