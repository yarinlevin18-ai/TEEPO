'use client'

/**
 * Client-side hooks around the university helpers in `lib/university.ts`.
 *
 * Kept separate so the pure module stays pure (no React import) and can be
 * used from server components if we ever need to.
 */

import { useDB } from './db-context'
import {
  universityNameFor,
  UNIVERSITY_NAMES,
  DEFAULT_UNIVERSITY_NAME,
} from './university'
import type { UniversityCode } from '@/types'

/**
 * Display name of the currently signed-in user's university. Falls back to
 * the env-var name (legacy) or the generic "האוניברסיטה שלך" if no user
 * setting is present.
 */
export function useUniversityName(): string {
  const { db } = useDB()
  return universityNameFor(db.settings)
}

/** Just the university code — useful when picking per-school logic/assets. */
export function useUniversityCode(): UniversityCode | undefined {
  const { db } = useDB()
  return db.settings?.university
}

export { UNIVERSITY_NAMES, DEFAULT_UNIVERSITY_NAME }
