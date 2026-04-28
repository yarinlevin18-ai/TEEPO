'use client'

/**
 * SkyClouds — daytime cloud field with randomized configs.
 *
 * Each cloud has its own random size, opacity, vertical position,
 * direction (left → right OR right → left), and drift duration. The
 * randomization happens once on mount (via a seed-stable PRNG so
 * positions don't reshuffle on every re-render), then each cloud
 * loops a CSS keyframe that translates it across the viewport from
 * just off one edge to just off the other.
 *
 * Layer fades in only when the celestial body is the sun, but the
 * clouds themselves continue to drift while invisible — so when day
 * returns, they're already in motion across the sky.
 */

import { useMemo } from 'react'

interface CloudConfig {
  id: number
  src: string
  /** Vertical position as a vh percent (0..60 for upper sky). */
  topVh: number
  /** Width in pixels at a 1× scale. Height keeps PNG aspect. */
  widthPx: number
  /** 0..1 opacity. */
  opacity: number
  /** How long one full cross takes (seconds). */
  durationSec: number
  /** Negative delay so the cloud starts at a random point of the cycle. */
  delaySec: number
  /** 'ltr' = drifts left → right; 'rtl' = right → left. */
  direction: 'ltr' | 'rtl'
}

// Only the two clean cloud sources — cloud-cluster.png had readable
// text baked into it and was distracting.
const CLOUD_SOURCES = [
  '/atmosphere/cloud-large.png',
  '/atmosphere/cloud-swirl.png',
]

/**
 * Tiny seeded PRNG (mulberry32) — gives us stable "random" values
 * across renders. Seed is hardcoded so the cloud config is the same
 * on every page load (no jitter), but feels random.
 */
function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6D2B79F5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const NUM_CLOUDS = 9

function generateConfigs(): CloudConfig[] {
  const rand = mulberry32(20260428)
  const configs: CloudConfig[] = []
  for (let i = 0; i < NUM_CLOUDS; i++) {
    configs.push({
      id: i,
      src: CLOUD_SOURCES[Math.floor(rand() * CLOUD_SOURCES.length)],
      topVh: 4 + rand() * 52,             // 4–56vh — upper two-thirds of sky
      widthPx: 160 + Math.round(rand() * 280), // 160–440px
      opacity: 0.55 + rand() * 0.40,       // 0.55–0.95
      durationSec: 220 + Math.round(rand() * 380), // 220–600s slow drift
      delaySec: -Math.round(rand() * 600), // negative offset: start mid-cycle
      direction: rand() < 0.5 ? 'ltr' : 'rtl',
    })
  }
  return configs
}

export default function SkyClouds() {
  // Stable across renders — generated once.
  const configs = useMemo(() => generateConfigs(), [])

  return (
    <div className="sky-clouds" aria-hidden>
      {configs.map((c) => (
        <div
          key={c.id}
          className={`sky-cloud ${c.direction === 'ltr' ? 'sky-cloud--ltr' : 'sky-cloud--rtl'}`}
          style={{
            top: `${c.topVh}vh`,
            width: `${c.widthPx}px`,
            opacity: c.opacity,
            backgroundImage: `url(${c.src})`,
            animationDuration: `${c.durationSec}s`,
            animationDelay: `${c.delaySec}s`,
          }}
        />
      ))}
    </div>
  )
}
