'use client'

/**
 * ScrollReveal — single global IntersectionObserver that adds
 * `.is-visible` to any `.reveal` element when it scrolls into view.
 *
 * Pair with the `.reveal` CSS utility in globals.css. Usage:
 *
 *   <section className="reveal">…</section>
 *
 * Mounts once at the layout level. Re-runs on route change so newly
 * mounted sections also get observed. Stops observing each element
 * after it reveals (one-shot).
 */

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export default function ScrollReveal() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('IntersectionObserver' in window)) {
      // Fallback: just mark everything visible.
      document.querySelectorAll<HTMLElement>('.reveal').forEach((el) => {
        el.classList.add('is-visible')
      })
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    )

    const targets = document.querySelectorAll<HTMLElement>('.reveal:not(.is-visible)')
    targets.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [pathname])

  return null
}
