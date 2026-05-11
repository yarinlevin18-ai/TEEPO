/**
 * Deterministic per-day RNG seed.
 *
 * Per CLAUDE_CODE_HANDOFF.md §"Key UX Patterns":
 *   const seed = today.getFullYear()*1000 + today.getMonth()*40 + today.getDate();
 *
 * Used by <CountryClock /> + <SlidingPuzzle /> so a page refresh on the same
 * day always yields the same country / puzzle. Different days roll forward.
 *
 * Pass the seed through `Math.abs(seed) % collection.length` to pick.
 */
export function dailySeed(d: Date = new Date()): number {
  return d.getFullYear() * 1000 + d.getMonth() * 40 + d.getDate()
}

/** Pick a deterministic item for today from `collection`. */
export function pickDaily<T>(collection: readonly T[], d: Date = new Date()): T {
  if (collection.length === 0) throw new Error('pickDaily: empty collection')
  return collection[Math.abs(dailySeed(d)) % collection.length]
}
