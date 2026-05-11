/**
 * Daily seed determinism — the core invariant: same calendar date → same
 * pick. A page refresh on Tuesday can't reveal Wednesday's country.
 */
import { describe, it, expect } from 'vitest'
import { dailySeed, pickDaily } from '@/lib/daily-seed'

describe('dailySeed', () => {
  it('is identical for two Date objects on the same calendar day', () => {
    const a = new Date(2026, 4, 12, 9, 0, 0)   // May 12, 09:00
    const b = new Date(2026, 4, 12, 22, 30, 0) // May 12, 22:30 — same day
    expect(dailySeed(a)).toBe(dailySeed(b))
  })

  it('differs between consecutive days', () => {
    const monday = new Date(2026, 4, 11)
    const tuesday = new Date(2026, 4, 12)
    expect(dailySeed(monday)).not.toBe(dailySeed(tuesday))
  })

  it('differs between months even with the same day-of-month', () => {
    const may12 = new Date(2026, 4, 12)
    const june12 = new Date(2026, 5, 12)
    expect(dailySeed(may12)).not.toBe(dailySeed(june12))
  })

  it('produces a finite positive integer', () => {
    const s = dailySeed(new Date(2026, 4, 12))
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThan(0)
  })
})

describe('pickDaily', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

  it('returns the same item for the same day', () => {
    const date = new Date(2026, 4, 12)
    const first = pickDaily(items, date)
    const second = pickDaily(items, date)
    expect(first).toBe(second)
  })

  it('rotates across days (16 days touches >1 distinct item from 8)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 16; i++) {
      seen.add(pickDaily(items, new Date(2026, 0, 1 + i)))
    }
    // Should hit at least 2 distinct items in 16 days — not strictly
    // guaranteed by the seed but the collection size makes a 16-in-a-row
    // single pick astronomically unlikely.
    expect(seen.size).toBeGreaterThan(1)
  })

  it('throws on an empty collection', () => {
    expect(() => pickDaily([], new Date())).toThrow(/empty/)
  })

  it('always returns an in-bounds element', () => {
    // Sample 30 different dates and confirm every pick is in the array.
    for (let i = 0; i < 30; i++) {
      const d = new Date(2026, 0, 1 + i)
      const pick = pickDaily(items, d)
      expect(items).toContain(pick)
    }
  })
})
