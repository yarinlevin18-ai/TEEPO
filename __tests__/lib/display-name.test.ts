/**
 * Display-name resolution pins the priority chain. Misorder = email
 * prefixes leak into the greeting, which is the exact bug that prompted
 * this helper.
 */

import { describe, it, expect } from 'vitest'
import {
  resolveDisplayName,
  resolveFirstName,
  resolveInitials,
} from '@/lib/display-name'

describe('resolveDisplayName priority', () => {
  it('prefers Drive setting over everything', () => {
    expect(resolveDisplayName({
      driveDisplayName: 'ירין לוין',
      userMetadata: { full_name: 'Yarin Levin', display_name: 'YL' },
      email: 'yarinlevin18@gmail.com',
    })).toBe('ירין לוין')
  })

  it('falls back to Google full_name when Drive empty', () => {
    expect(resolveDisplayName({
      driveDisplayName: '',
      userMetadata: { full_name: 'Yarin Levin' },
      email: 'yarinlevin18@gmail.com',
    })).toBe('Yarin Levin')
  })

  it('accepts user_metadata.name as a Google synonym for full_name', () => {
    expect(resolveDisplayName({
      userMetadata: { name: 'Yarin L.' },
      email: 'y@example.com',
    })).toBe('Yarin L.')
  })

  it('uses legacy display_name when no Google name present', () => {
    expect(resolveDisplayName({
      userMetadata: { display_name: 'Custom Name' },
      email: 'y@example.com',
    })).toBe('Custom Name')
  })

  it('falls back to email prefix only as last data resort', () => {
    expect(resolveDisplayName({
      userMetadata: {},
      email: 'yarinlevin18@gmail.com',
    })).toBe('yarinlevin18')
  })

  it('falls back to "סטודנט" when nothing is available', () => {
    expect(resolveDisplayName({})).toBe('סטודנט')
  })

  it('ignores whitespace-only values', () => {
    expect(resolveDisplayName({
      driveDisplayName: '   ',
      userMetadata: { full_name: '  Yarin  ' },
    })).toBe('Yarin')
  })
})

describe('resolveFirstName', () => {
  it('returns only the first word', () => {
    expect(resolveFirstName({
      userMetadata: { full_name: 'Yarin Levin' },
    })).toBe('Yarin')
  })

  it('handles single-word names', () => {
    expect(resolveFirstName({
      driveDisplayName: 'ירין',
    })).toBe('ירין')
  })
})

describe('resolveInitials', () => {
  it('takes first letter of first two words', () => {
    expect(resolveInitials({
      userMetadata: { full_name: 'Yarin Levin' },
    })).toBe('YL')
  })

  it('handles Hebrew names', () => {
    // First chars of "ירין" + "לוין"
    expect(resolveInitials({
      driveDisplayName: 'ירין לוין',
    })).toBe('יל')
  })

  it('falls back to "U" when no source has letters', () => {
    expect(resolveInitials({})).toBe('ס') // first letter of "סטודנט"
  })
})
