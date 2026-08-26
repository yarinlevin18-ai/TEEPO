/**
 * Drive DB migration tests (v1→v2→v3).
 *
 * Migrations are append-only and idempotent. A regression here would silently
 * corrupt every existing user's Drive blob, so a unit guard is cheap insurance.
 */

import { describe, it, expect } from 'vitest'
import { migrateDB, CURRENT_DB_VERSION, EMPTY_DB } from '@/lib/drive-db'
import type { DriveDB } from '@/lib/drive-db'

describe('migrateDB', () => {
  it('upgrades a v1 DB to the current version (just bumps the marker)', () => {
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

    const upgraded = migrateDB(v1)

    expect(upgraded.version).toBe(CURRENT_DB_VERSION)
    // Existing data must round-trip unchanged
    expect(upgraded.courses).toEqual(v1.courses)
  })

  it('upgrades a v2 DB to v3 without reshaping assignments', () => {
    const v2: DriveDB = {
      ...EMPTY_DB,
      version: 2,
      assignments: [
        {
          id: 'a1',
          user_id: 'u',
          title: 'HW 1',
          status: 'todo',
          priority: 'medium',
        },
      ],
    }

    const v3 = migrateDB(v2)

    expect(v3.version).toBe(3)
    // v3 fields are optional/additive — existing assignments unchanged
    expect(v3.assignments).toEqual(v2.assignments)
  })

  it('is idempotent — calling on a current-version DB keeps the version', () => {
    const current: DriveDB = { ...EMPTY_DB, version: CURRENT_DB_VERSION }
    const result = migrateDB(current)
    expect(result.version).toBe(CURRENT_DB_VERSION)
  })

  it('treats a missing version as v1 (legacy default)', () => {
    const noVersion = { ...EMPTY_DB } as DriveDB
    delete (noVersion as any).version
    const result = migrateDB(noVersion)
    expect(result.version).toBe(CURRENT_DB_VERSION)
  })

  it('produces a NEW object on each call (caller can compare by ref)', () => {
    const v1: DriveDB = { ...EMPTY_DB, version: 1 }
    const upgraded = migrateDB(v1)
    expect(upgraded).not.toBe(v1)
  })

  it('EMPTY_DB ships at the current schema version', () => {
    expect(EMPTY_DB.version).toBe(CURRENT_DB_VERSION)
  })

  it('accepts assignments carrying the v3 fields', () => {
    const db: DriveDB = {
      ...EMPTY_DB,
      version: 3,
      assignments: [
        {
          id: 'a2',
          user_id: 'u',
          title: 'Group project',
          status: 'in_progress',
          priority: 'high',
          is_group_work: true,
          collaborators: [{ name: 'Dana', email: 'dana@example.com' }, { name: 'Omer' }],
          drive_folder_url: 'https://drive.google.com/drive/folders/abc123',
          grade_weight: 25,
        },
      ],
    }
    const result = migrateDB(db)
    expect(result.version).toBe(3)
    expect(result.assignments[0].collaborators?.length).toBe(2)
  })
})
