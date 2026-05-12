/**
 * App-wide loading screen — Next.js streams this while a route segment is
 * resolving (data fetches, async server components, etc.).
 *
 * Source: teepo-design/mockup_loading.html. Layout:
 *   - Centered: /brand/teepo-loading.mp4 in a 380×380 (or 70vw) frame,
 *     mask-faded at the edges and blended with the cream page via
 *     `mix-blend-mode: multiply` so the video's white card stock looks
 *     like the same paper as the rest of the app.
 *   - Below: the wordmark + a "רגע, מסדר לך הכל..." line + three
 *     pulsing dots (leaf green / lime / amber).
 *   - Bottom: a gradient progress hint bar sliding right.
 *
 * This is intentionally a server component — no client hooks needed; the
 * video element auto-plays via the native HTML attribute.
 */
export default function Loading() {
  return (
    <div className="loading-stage cream-page">
      <div className="loading-video-wrap" aria-hidden>
        <video className="loading-video" autoPlay muted loop playsInline>
          <source src="/brand/teepo-loading.mp4" type="video/mp4" />
        </video>
      </div>

      <div>
        <div className="loading-wordmark" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/teepo-wordmark.svg" alt="teepo" />
        </div>
        <div className="loading-sub">רגע, מסדר לך הכל...</div>
      </div>

      <div className="loading-dots" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <div className="loading-progress" aria-hidden />
    </div>
  )
}
