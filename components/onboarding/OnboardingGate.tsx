'use client'

/**
 * Onboarding gate (task #14).
 *
 * Sits inside DBProvider and intercepts navigation when the user hasn't
 * picked a university yet. Renders the UniversitySelector full-screen
 * until `settings.university` is set, then steps out of the way.
 *
 * Behaviour:
 *   - DB still loading  → render children (let dashboard show its own loader)
 *   - DB loaded + setting present → render children (normal app)
 *   - DB loaded + setting missing → render UniversitySelector
 *
 * Why a separate file from layout.tsx: layout.tsx already does a lot
 * (auth gate, sidebar, mobile drawer). Keeping the onboarding logic
 * isolated makes both files easier to read and test.
 */

import { useDB } from '@/lib/db-context'
import { isDevAuthBypassEnabled } from '@/lib/dev-auth-bypass'
import UniversitySelector from './UniversitySelector'
import type { UniversityCode } from '@/types'

export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { db, ready, updateSettings, flushSave } = useDB()

  // Dev bypass — skip the gate entirely so testing UI doesn't get blocked
  // every reload. Devs can still test the gate by disabling the bypass.
  if (isDevAuthBypassEnabled()) return <>{children}</>

  // Until the DB has loaded at least once, defer to the children. The
  // dashboard layout will already be showing its loading state via auth.
  // Showing the picker before we know if the user has already onboarded
  // would flash the selector on every page load.
  if (!ready) return <>{children}</>

  if (db.settings?.university) {
    return <>{children}</>
  }

  const handlePick = async (code: UniversityCode) => {
    await updateSettings({ university: code })
    // Flush immediately to Drive — without this, the save sits in the
    // 30s debounce queue. A user who picks then reloads (or hits the
    // tab close) before the timer fires would lose the choice and see
    // the picker again on next load. The in-memory state was already
    // updated by updateSettings, so the next render will hide the gate
    // either way; flush just makes sure that next-load Drive read also
    // sees the choice.
    await flushSave()
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12">
      <UniversitySelector onPick={handlePick} />
    </div>
  )
}
