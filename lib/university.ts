/**
 * University branding helper.
 *
 * v2.1 made TEEPO multi-university: each user picks their school during
 * onboarding (`UserSettings.university`). This module turns that code into
 * the user-facing Hebrew name.
 *
 * Resolution priority:
 *   1. `settings.university` (per-user — the v2.1 source of truth)
 *   2. `NEXT_PUBLIC_UNIVERSITY_NAME` env var (legacy single-school deploys)
 *   3. Generic "האוניברסיטה שלך"
 *
 * Pure module — no React. The `useUniversityName()` hook lives in
 * `lib/use-university.ts` so server components can still import the pure
 * helpers here without dragging in client-only code.
 */

import type { UniversityCode, UserSettings } from '@/types'

export const DEFAULT_UNIVERSITY_NAME = 'האוניברסיטה שלך'

/** Display names by university code. Update here when we add Phase 3 schools. */
export const UNIVERSITY_NAMES: Record<UniversityCode, string> = {
  bgu: 'אוניברסיטת בן-גוריון בנגב',
  tau: 'אוניברסיטת תל אביב',
}

/**
 * Resolve the display name for a given user. Pure — call this from anywhere
 * (server components, utility code) by passing the user's settings.
 */
export function universityNameFor(settings?: UserSettings | null): string {
  const code = settings?.university
  if (code && UNIVERSITY_NAMES[code]) return UNIVERSITY_NAMES[code]

  const raw = process.env.NEXT_PUBLIC_UNIVERSITY_NAME
  if (typeof raw === 'string' && raw.trim()) return raw.trim()

  return DEFAULT_UNIVERSITY_NAME
}

/**
 * @deprecated v1 helper. Reads only the env var, not user settings.
 * Use `universityNameFor(settings)` or the `useUniversityName()` hook.
 * Kept so any existing import keeps building until callers migrate.
 */
export function universityName(): string {
  return universityNameFor(undefined)
}
