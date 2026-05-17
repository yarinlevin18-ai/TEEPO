import { describe, it, expect } from 'vitest'
import { resolveDegrees, DEFAULT_DEGREE_ID, newDegreeId } from '@/lib/degrees'

describe('resolveDegrees', () => {
  it('returns the explicit degrees array when present', () => {
    const out = resolveDegrees({
      degrees: [
        { id: 'a', name: 'מדעי המחשב' },
        { id: 'b', name: 'מנהל עסקים' },
      ],
    })
    expect(out).toEqual([
      { id: 'a', name: 'מדעי המחשב' },
      { id: 'b', name: 'מנהל עסקים' },
    ])
  })

  it('falls back to legacy degree_name as a single-degree array', () => {
    const out = resolveDegrees({ degree_name: 'תואר ראשון' })
    expect(out).toEqual([{ id: DEFAULT_DEGREE_ID, name: 'תואר ראשון' }])
  })

  it('returns one synthetic empty-named degree when nothing is set', () => {
    expect(resolveDegrees({})).toEqual([{ id: DEFAULT_DEGREE_ID, name: '' }])
    expect(resolveDegrees(null)).toEqual([{ id: DEFAULT_DEGREE_ID, name: '' }])
  })

  it('prefers degrees[] over legacy degree_name when both present', () => {
    const out = resolveDegrees({
      degrees: [{ id: 'x', name: 'CS' }],
      degree_name: 'Old Name',
    })
    expect(out).toEqual([{ id: 'x', name: 'CS' }])
  })

  it('trims whitespace from names', () => {
    const out = resolveDegrees({
      degrees: [{ id: 'a', name: '  CS  ' }],
    })
    expect(out[0].name).toBe('CS')
  })

  it('ignores empty degrees[] arrays and falls through', () => {
    const out = resolveDegrees({ degrees: [], degree_name: 'fallback' })
    expect(out[0].name).toBe('fallback')
  })
})

describe('newDegreeId', () => {
  it('returns unique ids', () => {
    const a = newDegreeId()
    const b = newDegreeId()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThan(8)
  })
})
