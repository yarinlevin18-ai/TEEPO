/**
 * Country DB + fuzzy matcher. The matcher is the user-facing surface —
 * if it ever gets stricter, players whose Hebrew/English answer used to
 * pass will suddenly fail and never know why.
 */
import { describe, it, expect } from 'vitest'
import { COUNTRIES, matchesCountry, type Country } from '@/lib/countries'

const JAPAN = COUNTRIES.find(c => c.name === 'יפן')!
const FRANCE = COUNTRIES.find(c => c.name === 'צרפת')!
const UK = COUNTRIES.find(c => c.name === 'אנגליה')!

describe('COUNTRIES DB', () => {
  it('contains the 16 expected entries', () => {
    expect(COUNTRIES.length).toBe(16)
  })

  it('each entry has a non-empty name, at least one alias, valid hex ring color, and a flag svg', () => {
    for (const c of COUNTRIES) {
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.aliases.length).toBeGreaterThan(0)
      expect(c.ringColor).toMatch(/^#[0-9a-f]{3,8}$/i)
      expect(c.flagSvg.length).toBeGreaterThan(10)
    }
  })

  it('the country name appears in its own aliases (so display = answer)', () => {
    for (const c of COUNTRIES) {
      const lower = c.aliases.map(a => a.toLowerCase())
      expect(lower).toContain(c.name.toLowerCase())
    }
  })

  it('UTC offsets are within ±14 hours', () => {
    for (const c of COUNTRIES) {
      expect(c.utcOffset).toBeGreaterThanOrEqual(-12)
      expect(c.utcOffset).toBeLessThanOrEqual(14)
    }
  })
})

describe('matchesCountry', () => {
  it('matches the Hebrew name exactly', () => {
    expect(matchesCountry(JAPAN, 'יפן')).toBe(true)
    expect(matchesCountry(FRANCE, 'צרפת')).toBe(true)
  })

  it('matches the English alias case-insensitively', () => {
    expect(matchesCountry(JAPAN, 'japan')).toBe(true)
    expect(matchesCountry(JAPAN, 'JAPAN')).toBe(true)
    expect(matchesCountry(JAPAN, 'Japan')).toBe(true)
  })

  it('tolerates surrounding whitespace', () => {
    expect(matchesCountry(JAPAN, '  japan  ')).toBe(true)
    expect(matchesCountry(JAPAN, '\t\nיפן\n')).toBe(true)
  })

  it('matches when the guess CONTAINS the alias (e.g. "I think it is japan")', () => {
    expect(matchesCountry(JAPAN, 'I think it is japan')).toBe(true)
  })

  it('matches when the alias contains the guess (e.g. shorter form like "uk" for "england")', () => {
    expect(matchesCountry(UK, 'uk')).toBe(true)
    expect(matchesCountry(UK, 'england')).toBe(true)
    expect(matchesCountry(UK, 'בריטניה')).toBe(true)
  })

  it('rejects empty and whitespace-only input', () => {
    expect(matchesCountry(JAPAN, '')).toBe(false)
    expect(matchesCountry(JAPAN, '   ')).toBe(false)
  })

  it('rejects unrelated countries', () => {
    expect(matchesCountry(JAPAN, 'france')).toBe(false)
    expect(matchesCountry(JAPAN, 'איטליה')).toBe(false)
  })
})
