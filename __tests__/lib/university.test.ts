/**
 * universityNameFor — resolves the right Hebrew display name from user
 * settings, the env-var fallback, and the generic default.
 *
 * This is the foundation that the sidebar, /academic, and /moodle headers
 * all depend on. A regression here changes the visible university name
 * across the entire app.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  universityNameFor,
  UNIVERSITY_NAMES,
  DEFAULT_UNIVERSITY_NAME,
} from '@/lib/university'

describe('universityNameFor', () => {
  const originalEnv = process.env.NEXT_PUBLIC_UNIVERSITY_NAME

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_UNIVERSITY_NAME
    } else {
      process.env.NEXT_PUBLIC_UNIVERSITY_NAME = originalEnv
    }
  })

  it('returns BGU full name when settings.university = "bgu"', () => {
    expect(universityNameFor({ university: 'bgu' })).toBe(UNIVERSITY_NAMES.bgu)
  })

  it('returns TAU full name when settings.university = "tau"', () => {
    expect(universityNameFor({ university: 'tau' })).toBe(UNIVERSITY_NAMES.tau)
  })

  it('falls back to NEXT_PUBLIC_UNIVERSITY_NAME when settings has no university', () => {
    process.env.NEXT_PUBLIC_UNIVERSITY_NAME = 'אוניברסיטת חיפה'
    expect(universityNameFor({})).toBe('אוניברסיטת חיפה')
    expect(universityNameFor(null)).toBe('אוניברסיטת חיפה')
    expect(universityNameFor(undefined)).toBe('אוניברסיטת חיפה')
  })

  it('falls back to default when neither settings nor env are set', () => {
    delete process.env.NEXT_PUBLIC_UNIVERSITY_NAME
    expect(universityNameFor()).toBe(DEFAULT_UNIVERSITY_NAME)
    expect(universityNameFor({})).toBe(DEFAULT_UNIVERSITY_NAME)
  })

  it('settings.university takes priority over env var', () => {
    process.env.NEXT_PUBLIC_UNIVERSITY_NAME = 'אוניברסיטת חיפה'
    expect(universityNameFor({ university: 'bgu' })).toBe(UNIVERSITY_NAMES.bgu)
  })

  it('treats whitespace-only env var as missing', () => {
    process.env.NEXT_PUBLIC_UNIVERSITY_NAME = '   '
    expect(universityNameFor()).toBe(DEFAULT_UNIVERSITY_NAME)
  })
})
