'use client'

/**
 * SkyScene — fixed-position background that renders the atmosphere
 * layers behind the dashboard:
 *   1. Base wash      (var(--bg1) → var(--bg2) gradient)
 *   2. Star field     (two parallax layers, image-tiled)
 *   3. Glow halo      (warm/cool radial centered on sun position + bottom)
 *   4. Sun or moon    (image-based body, positioned by --sun-x/y)
 *   5. Grain          (subtle dot texture for materiality)
 *
 * Scroll parallax: as the page scrolls, we write the scroll offset into
 * the `--scroll-y` custom property on the sky-scene root. Each layer
 * translates by a small fraction of that offset (different per layer,
 * creating depth). The fixed-position container itself doesn't move —
 * only the inner layers do, via CSS transforms tied to the variable.
 */

import { useEffect, useRef } from 'react'

export default function SkyScene() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Either window or the dashboard's <main> can be the scroll
    // container depending on viewport height vs content height. We
    // listen to both and use whichever has the larger offset, so the
    // parallax is correct in either case.
    const main = document.querySelector('main') as HTMLElement | null

    let ticking = false
    const update = () => {
      const winY = window.scrollY || document.documentElement.scrollTop || 0
      const mainY = main?.scrollTop ?? 0
      const y = Math.max(winY, mainY)
      if (rootRef.current) {
        rootRef.current.style.setProperty('--scroll-y', `${y}px`)
      }
      ticking = false
    }
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update)
        ticking = true
      }
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    main?.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      main?.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <div ref={rootRef} className="sky-scene" aria-hidden>
      <div className="sky-scene__base" />
      <div className="sky-scene__stars" />
      <div className="sky-scene__stars sky-scene__stars--far" />
      <div className="sky-scene__glow" />
      {/* Clouds are now rendered by the SkyClouds component (mounted
          in the dashboard layout) so each cloud can carry its own
          random size / opacity / direction inline. */}
      {/* Both bodies always rendered — each fades via its own opacity
          var so dawn/dusk shows the sun and moon together. */}
      <div className="sky-scene__body sky-scene__body--sun" />
      <div className="sky-scene__body sky-scene__body--moon" />
      <div className="sky-scene__grain" />
    </div>
  )
}
