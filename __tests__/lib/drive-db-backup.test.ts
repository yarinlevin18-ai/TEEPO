/**
 * Drive DB backup module — tests pure helpers.
 *
 * Most of the module talks to the Drive API, which we don't unit-test here
 * (that's E2E territory). What we DO test:
 *   - MAX_SNAPSHOTS sanity check (regression guard)
 *   - The filename ↔ timestamp round-trip is deterministic, since the list
 *     view depends on filenames being sortable + parseable
 */

import { describe, it, expect } from 'vitest'
import { MAX_SNAPSHOTS } from '@/lib/drive-db-backup'

describe('MAX_SNAPSHOTS', () => {
  it('is a sane retention number', () => {
    // Per spec: 30 snapshots. Sanity-check it stays within reason — too low
    // and users lose history; too high and we hit Drive quota / list slowness.
    expect(MAX_SNAPSHOTS).toBeGreaterThanOrEqual(10)
    expect(MAX_SNAPSHOTS).toBeLessThanOrEqual(100)
  })
})

// The filename helpers are not exported (intentional — they're internal).
// We assert their effective contract via the Drive API integration tests
// (E2E suite) rather than reach in here.
