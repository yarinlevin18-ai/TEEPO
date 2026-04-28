'use client'

/**
 * WeatherParticles — fixed-position canvas that paints weather over the
 * SkyScene. Rain falls in tilted streaks, snow drifts, wind streaks
 * skim sideways, storms render heavy rain with occasional lightning
 * flashes (CSS, not canvas). Sunny / cloudy / hamsin: no particles.
 *
 * The layer is purely visual; LivingDayProvider already adjusts colors
 * via the WEATHER multipliers.
 */

import { useEffect, useRef } from 'react'
import { useLivingDay } from '@/lib/living-day-context'
import type { WeatherKey } from '@/lib/living-day'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** Used for size or wobble depending on type. */
  size: number
  /** Phase offset for snow wobble. */
  phase: number
}

function densityFor(weather: WeatherKey): number {
  // Particles per 1000 px². Tuned for legibility, not realism.
  switch (weather) {
    case 'rainy':  return 0.18
    case 'stormy': return 0.32
    case 'snowy':  return 0.10
    case 'windy':  return 0.06
    default:       return 0
  }
}

export default function WeatherParticles() {
  const { weather } = useLivingDay()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number | null>(null)
  const flashRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const sync = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    sync()
    window.addEventListener('resize', sync)

    const seedParticles = () => {
      const density = densityFor(weather)
      const target = Math.round((w * h * density) / 1000)
      const arr: Particle[] = []
      for (let i = 0; i < target; i++) {
        arr.push(makeParticle(weather, w, h, true))
      }
      particlesRef.current = arr
    }
    seedParticles()

    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      const particles = particlesRef.current

      // Storm flash — quick alpha pulse on canvas. Decays in ~140ms.
      if (weather === 'stormy') {
        if (Math.random() < 0.0009) flashRef.current = 1
        if (flashRef.current > 0.01) {
          ctx.fillStyle = `rgba(220, 230, 255, ${flashRef.current * 0.18})`
          ctx.fillRect(0, 0, w, h)
          flashRef.current *= 0.86
        }
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy

        switch (weather) {
          case 'rainy':
          case 'stormy': {
            ctx.strokeStyle =
              weather === 'stormy'
                ? 'rgba(190, 215, 245, 0.55)'
                : 'rgba(170, 200, 235, 0.40)'
            ctx.lineWidth = weather === 'stormy' ? 1.2 : 0.9
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p.x - p.vx * 1.6, p.y - p.vy * 1.6)
            ctx.stroke()
            break
          }
          case 'snowy': {
            // Wobble horizontally for drift.
            p.phase += 0.02
            const wobble = Math.sin(p.phase) * 0.6
            ctx.fillStyle = 'rgba(245, 248, 255, 0.85)'
            ctx.beginPath()
            ctx.arc(p.x + wobble, p.y, p.size, 0, Math.PI * 2)
            ctx.fill()
            break
          }
          case 'windy': {
            ctx.strokeStyle = 'rgba(220, 225, 235, 0.18)'
            ctx.lineWidth = 0.6
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p.x - p.vx * 6, p.y - p.vy * 6)
            ctx.stroke()
            break
          }
        }

        // Recycle off-screen particles.
        if (p.y > h + 20 || p.x < -40 || p.x > w + 40) {
          Object.assign(p, makeParticle(weather, w, h, false))
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    if (densityFor(weather) > 0) {
      tick()
    }

    return () => {
      window.removeEventListener('resize', sync)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      ctx.clearRect(0, 0, w, h)
    }
  }, [weather])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[1]"
      style={{ mixBlendMode: 'screen' }}
      aria-hidden
    />
  )
}

function makeParticle(weather: WeatherKey, w: number, h: number, seeded: boolean): Particle {
  const y = seeded ? Math.random() * h : -10
  switch (weather) {
    case 'rainy':
      return {
        x: Math.random() * (w + 200) - 100,
        y,
        vx: -1.2,
        vy: 12 + Math.random() * 4,
        size: 1,
        phase: 0,
      }
    case 'stormy':
      return {
        x: Math.random() * (w + 200) - 100,
        y,
        vx: -2.4,
        vy: 16 + Math.random() * 5,
        size: 1,
        phase: 0,
      }
    case 'snowy':
      return {
        x: Math.random() * w,
        y,
        vx: -0.2,
        vy: 0.6 + Math.random() * 1.0,
        size: 1.2 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
      }
    case 'windy':
      return {
        x: Math.random() * (w + 400) - 200,
        y: Math.random() * h,
        vx: 4 + Math.random() * 3,
        vy: 0,
        size: 1,
        phase: 0,
      }
    default:
      return { x: 0, y: 0, vx: 0, vy: 0, size: 0, phase: 0 }
  }
}
