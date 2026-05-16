/**
 * Shared display-name resolution.
 *
 * Anywhere we address the user (dashboard greeting, topnav user pill,
 * /settings input seed, etc.) should go through these helpers so the
 * priority chain stays consistent. The bug we keep hitting: showing the
 * email prefix ("yarinlevin18") when the Google OAuth response already
 * carries a real name ("Yarin Levin") that nobody read.
 *
 * Priority:
 *   1. Drive DB `settings.display_name` — user-set in /settings, portable.
 *   2. Google profile name (Supabase user_metadata.full_name / name) —
 *      populated automatically by Supabase Google OAuth, no user action.
 *   3. Supabase metadata `display_name` — legacy from before the Drive-DB
 *      migration when /settings wrote here.
 *   4. Email prefix — last resort so brand-new accounts still see a name.
 *   5. "סטודנט" — final fallback when even email is missing.
 *
 * Initials follow the same priority so the avatar pill matches the greeting.
 */

export interface NameSources {
  /** From `useAuth().user`. */
  userMetadata?: Record<string, unknown> | null
  /** From `useAuth().user.email`. */
  email?: string | null
  /** From `useDB().db?.settings?.display_name`. */
  driveDisplayName?: string | null
}

/** Full display name — first non-empty source in priority order. */
export function resolveDisplayName(s: NameSources): string {
  const m = s.userMetadata ?? {}
  const candidates: Array<string | null | undefined> = [
    s.driveDisplayName,
    pickString(m, ['full_name', 'name']),       // Google OAuth canonical
    pickString(m, ['display_name']),             // legacy Supabase write
    s.email?.split('@')[0],
    'סטודנט',
  ]
  for (const c of candidates) {
    const trimmed = c?.trim()
    if (trimmed) return trimmed
  }
  return 'סטודנט'
}

/** Just the first word of the full name — used in greetings ("שלום ירין"). */
export function resolveFirstName(s: NameSources): string {
  const full = resolveDisplayName(s)
  return full.split(/\s+/)[0] || full
}

/** Up to 2-letter initials for the avatar pill. Falls back to "U" only if
 *  every source is empty (shouldn't happen in practice). */
export function resolveInitials(s: NameSources): string {
  const full = resolveDisplayName(s)
  const parts = full.split(/[\s@._-]+/).filter(Boolean).slice(0, 2)
  const initials = parts.map(p => p[0]?.toUpperCase() || '').join('')
  return initials || 'U'
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return undefined
}
