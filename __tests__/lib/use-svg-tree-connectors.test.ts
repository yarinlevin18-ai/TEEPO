/**
 * Unit tests for the pure geometry helpers exported by
 * lib/use-svg-tree-connectors.ts.
 *
 * The hook itself (the React side, ResizeObserver, font.ready wiring)
 * is integration-tested via the consumer pages — those need a real
 * browser to verify positioning anyway.
 */
import { describe, it, expect } from 'vitest'
import { buildElbowPath } from '@/lib/use-svg-tree-connectors'

/** Collapse internal whitespace so multi-line template strings compare
 *  predictably. The path API doesn't care about the spaces between
 *  commands; we just want to assert the shape. */
function norm(d: string): string {
  return d.replace(/\s+/g, ' ').trim()
}

describe('buildElbowPath', () => {
  it('returns a straight vertical line when x1 ≈ x2', () => {
    expect(norm(buildElbowPath(100, 50, 100, 200))).toBe('M 100 50 L 100 200')
    // sub-pixel difference still counts as straight
    expect(norm(buildElbowPath(100, 50, 100.3, 200))).toBe('M 100 50 L 100.3 200')
  })

  it('builds a rounded elbow that goes right (x2 > x1)', () => {
    const d = norm(buildElbowPath(50, 0, 150, 100, 8))
    // midY = 50, corner radius 8, dx = +8 (going right)
    // expected: M 50 0  L 50 42  Q 50 50 58 50  L 142 50  Q 150 50 150 58  L 150 100
    expect(d).toBe('M 50 0 L 50 42 Q 50 50 58 50 L 142 50 Q 150 50 150 58 L 150 100')
  })

  it('builds a rounded elbow that goes left (x2 < x1)', () => {
    const d = norm(buildElbowPath(150, 0, 50, 100, 8))
    // midY = 50, dx = -8 (going left)
    expect(d).toBe('M 150 0 L 150 42 Q 150 50 142 50 L 58 50 Q 50 50 50 58 L 50 100')
  })

  it('honors a custom corner radius', () => {
    const d = norm(buildElbowPath(0, 0, 100, 40, 12))
    // midY = 20, dx = +12
    expect(d).toBe('M 0 0 L 0 8 Q 0 20 12 20 L 88 20 Q 100 20 100 32 L 100 40')
  })

  it('produces a balanced midpoint regardless of y1/y2 order', () => {
    // Same x's and same |Δy| — going up should mirror going down.
    const down = norm(buildElbowPath(0, 0, 100, 100))
    const up = norm(buildElbowPath(0, 100, 100, 0))
    // Both have midY = 50, same corner geometry
    expect(down).toContain('Q 0 50 8 50')
    expect(up).toContain('Q 0 50 8 50')
  })

  it('matches the exact algorithm shipped in mockup_drive_organize.html', () => {
    // The mockup script (lines ~458-474) uses cornerRadius 8 and the
    // same M/L/Q sequence. This test pins the port to the reference.
    const d = norm(buildElbowPath(200, 100, 350, 250))
    // midY = 175, dx = +8
    expect(d).toBe(
      'M 200 100 L 200 167 Q 200 175 208 175 L 342 175 Q 350 175 350 183 L 350 250',
    )
  })
})
