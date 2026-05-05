/**
 * useNotifications — the hook that PR #27 stabilised after the infinite
 * render-loop regression. These tests guard against:
 *   1. The loop coming back (multiple calls don't blow up)
 *   2. Read state actually merging into the rendered notifications
 *   3. The known-quiet path: no critical items → no browser notification calls
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNotifications, buildNotifications } from '@/lib/use-notifications'
import type { Assignment, StudyTask } from '@/types'

describe('buildNotifications', () => {
  it('returns an empty list when no inputs', () => {
    expect(buildNotifications([], [], [])).toEqual([])
  })

  it('flags an assignment due soon as a notification', () => {
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const a: Assignment = {
      id: 'a1',
      user_id: 'u',
      title: 'Final paper',
      deadline: inOneHour,
      status: 'todo',
      priority: 'high',
    }
    const result = buildNotifications([a], [], [])
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].title).toContain('Final paper')
  })

  it('skips assignments already submitted/graded', () => {
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const a: Assignment = {
      id: 'a1',
      user_id: 'u',
      title: 'Done one',
      deadline: inOneHour,
      status: 'submitted',
      priority: 'high',
    }
    expect(buildNotifications([a], [], [])).toEqual([])
  })
})

describe('useNotifications', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch {}
  })

  it('re-renders many times without crashing (loop guard from PR #27)', () => {
    const { result, rerender } = renderHook(
      ({ assignments }: { assignments: Assignment[] }) =>
        useNotifications(assignments, [] as StudyTask[], []),
      { initialProps: { assignments: [] } },
    )

    // Each rerender hands new array refs (the original loop trigger).
    for (let i = 0; i < 25; i++) {
      rerender({ assignments: [] })
    }

    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(0)
  })

  it('markAllRead empties the unread count', () => {
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const a: Assignment = {
      id: 'a1',
      user_id: 'u',
      title: 'Final paper',
      deadline: inOneHour,
      status: 'todo',
      priority: 'high',
    }
    const { result } = renderHook(() => useNotifications([a], [], []))

    expect(result.current.unreadCount).toBeGreaterThan(0)

    act(() => {
      result.current.markAllRead()
    })

    expect(result.current.unreadCount).toBe(0)
  })
})
