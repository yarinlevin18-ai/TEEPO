/**
 * Degree resolver — bridges the legacy single `settings.degree_name`
 * field with the new `settings.degrees[]` array (added for dual-degree
 * support — תואר דו-חוגי).
 *
 * Always returns at least one degree so the /summaries tree never has to
 * branch on "what if zero" — when nothing is set we return a single
 * synthetic { id: 'main', name: '' } that the UI renders without a pill.
 */

import type { Degree, UserSettings } from '@/types'

export const DEFAULT_DEGREE_ID = 'main'

/** Stable, URL-friendly id generator. crypto.randomUUID where available,
 *  fallback for older runtimes that don't have it. */
export function newDegreeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `deg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Resolve the user's degree list. Priority:
 *   1. settings.degrees (the new shape — already an array)
 *   2. settings.degree_name (legacy — wrap into a single-element array)
 *   3. Synthetic default ({ id: 'main', name: '' })
 *
 * Always returns at least one Degree so callers can iterate without a
 * length check.
 */
export function resolveDegrees(settings: UserSettings | null | undefined): Degree[] {
  const list = settings?.degrees
  if (Array.isArray(list) && list.length > 0) {
    return list.map(d => ({ id: d.id, name: (d.name || '').trim() }))
  }
  const legacyName = settings?.degree_name?.trim()
  if (legacyName) {
    return [{ id: DEFAULT_DEGREE_ID, name: legacyName }]
  }
  return [{ id: DEFAULT_DEGREE_ID, name: '' }]
}
