/**
 * Drive DB v1→v2 migration test.
 *
 * Migrations are append-only and idempotent. A regression here would silently
 * corrupt every existing user's Drive blob, so a unit guard is cheap insurance.
 */

import { describe, it, expect } from 'vitest'
import { migrateDB, CURRENT_DB_VERSION, EMPTY_DB } from '@/lib/drive-db'
import type { DriveDB } from '@/lib/drive-db'

describe('migrateDB', () => {
  it('upgrades a v1 DB to v2 (just bumps the version)', () => {
    const v1: DriveDB = {
      ...EMPTY_DB,
      version: 1,
      courses: [
        {
          id: 'c1',
          user_id: 'u',
          title: 'Course',
          source: 'bgu',
          progress_percentage: 0,
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    }

    const v2 = migrateDB(v1)

    expect(v2.version).toBe(2)
    // Existing data must round-trip unchanged
    expect(v2.courses).toEqual(v1.courses)
  })

  it('is idempotent — calling on a v2 DB returns the same shape', () => {
    const v2: DriveDB = { ...EMPTY_DB, version: 2 }
    const result = migrateDB(v2)
    expect(result.version).toBe(2)
  })

  it('treats a missing version as v1 (legacy default)', () => {
    const noVersion = { ...EMPTY_DB } as DriveDB
    delete (noVersion as any).version
    const result = migrateDB(noVersion)
    expect(result.version).toBe(2)
  })

  it('produces a NEW object on each call (caller can compare by ref)', () => {
    const v1: DriveDB = { ...EMPTY_DB, version: 1 }
    const v2 = migrateDB(v1)
    expect(v2).not.toBe(v1)
  })

  it('EMPTY_DB ships at the current schema version', () => {
    expect(EMPTY_DB.version).toBe(CURRENT_DB_VERSION)
  })
})
