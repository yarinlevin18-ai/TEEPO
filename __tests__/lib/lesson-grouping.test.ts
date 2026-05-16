/**
 * The "organize by lesson" feature in /summaries hinges on
 * groupFilesByLesson detecting Week/Lesson/שיעור markers and only
 * proposing folders when there are ≥2 files for a lesson. Get this wrong
 * and the UI either over-eagerly creates single-file folders or misses
 * obvious groupings. The tests pin the contract.
 */

import { describe, it, expect } from 'vitest'
import {
  detectLessonKey,
  pickTopic,
  groupFilesByLesson,
} from '@/lib/lesson-grouping'
import type { DriveFile } from '@/lib/drive-files'

function file(name: string, id = name): DriveFile {
  return { id, name, mimeType: 'application/pdf' }
}

describe('detectLessonKey', () => {
  it('recognizes English Week marker', () => {
    expect(detectLessonKey('Week 1 - Introduction')).toEqual({
      key: 'Week 1',
      rest: 'Introduction',
    })
  })

  it('recognizes Lesson marker', () => {
    expect(detectLessonKey('Lesson 4: Functions')).toEqual({
      key: 'Lesson 4',
      rest: 'Functions',
    })
  })

  it('recognizes Hebrew שיעור marker', () => {
    expect(detectLessonKey('שיעור 2 — מערכים')).toEqual({
      key: 'שיעור 2',
      rest: 'מערכים',
    })
  })

  it('strips leading zeros so Week 01 and Week 1 collide', () => {
    expect(detectLessonKey('Week 01 - Intro')?.key).toBe('Week 1')
  })

  it('handles a marker with no topic', () => {
    expect(detectLessonKey('Week 3')?.rest).toBe('')
  })

  it('returns null for non-matching names', () => {
    expect(detectLessonKey('Syllabus')).toBeNull()
    expect(detectLessonKey('Course Contents')).toBeNull()
    expect(detectLessonKey('Presentation Notes')).toBeNull()
  })

  it('returns null when the marker is mid-string, not at start', () => {
    expect(detectLessonKey('Notes for Week 5')).toBeNull()
  })

  it('preserves descriptive modifiers like "Week 5 Amended"', () => {
    // "Amended" looks like part of the rest, so it lands in `rest`.
    const det = detectLessonKey('Week 5 Amended - Art, skimming')
    expect(det?.key).toBe('Week 5')
    expect(det?.rest).toContain('Amended')
  })
})

describe('pickTopic', () => {
  it('returns empty when no rests', () => {
    expect(pickTopic([])).toBe('')
  })

  it('strips trailing " File" / " URL" suffixes to dedupe', () => {
    // "Introduction File" + "Introduction URL" should collapse to "Introduction" twice.
    const topic = pickTopic(['Introduction File', 'Introduction URL'])
    expect(topic).toBe('Introduction')
  })

  it('picks the most common topic across rests', () => {
    const topic = pickTopic([
      'Reading Skills',
      'Reading Skills File',
      'misc thing',
    ])
    expect(topic).toBe('Reading Skills')
  })

  it('tie-breaks by length (more descriptive wins)', () => {
    const topic = pickTopic([
      'Intro',
      'Detailed Introduction',
    ])
    expect(topic).toBe('Detailed Introduction')
  })
})

describe('groupFilesByLesson', () => {
  it('groups Week-N pairs and leaves unrelated files unmatched', () => {
    const result = groupFilesByLesson([
      file('Week 1 - Introduction File'),
      file('Week 1 - Introduction URL'),
      file('Week 2 - Reading Skills and AI File'),
      file('Week 2 - Reading Skills and AI URL'),
      file('Syllabus'),
      file('Course Contents'),
    ])
    expect(result.groups).toHaveLength(2)
    expect(result.groups[0]).toMatchObject({
      key: 'Week 1',
      folderName: 'Week 1 - Introduction',
    })
    expect(result.groups[0].files).toHaveLength(2)
    expect(result.groups[1].folderName).toBe('Week 2 - Reading Skills and AI')
    expect(result.unmatched.map(f => f.name)).toEqual(
      expect.arrayContaining(['Syllabus', 'Course Contents']),
    )
  })

  it('does not create a folder for a lone matching file', () => {
    const result = groupFilesByLesson([
      file('Week 7 - Lonely File'),
      file('Syllabus'),
    ])
    expect(result.groups).toEqual([])
    expect(result.unmatched.map(f => f.name)).toEqual(
      expect.arrayContaining(['Week 7 - Lonely File', 'Syllabus']),
    )
  })

  it('sorts groups by lesson number', () => {
    const result = groupFilesByLesson([
      file('Week 5 - Late File'),
      file('Week 5 - Late URL'),
      file('Week 1 - Early File'),
      file('Week 1 - Early URL'),
      file('Week 3 - Middle File'),
      file('Week 3 - Middle URL'),
    ])
    expect(result.groups.map(g => g.key)).toEqual([
      'Week 1', 'Week 3', 'Week 5',
    ])
  })

  it('skips optimistic tmp- placeholders', () => {
    const result = groupFilesByLesson([
      { id: 'tmp-12345', name: 'Week 1 - Intro File', mimeType: 'application/pdf' },
      file('Week 1 - Intro URL'),
      file('Week 1 - Intro something else'),
    ])
    // Only the 2 stable files form a group; the tmp- entry goes to unmatched.
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].files.every(f => !f.id.startsWith('tmp-'))).toBe(true)
    expect(result.unmatched.some(f => f.id.startsWith('tmp-'))).toBe(true)
  })

  it('groups by canonical key even when the topic differs across files', () => {
    // Week 5 Amended + Week 5 - conditionals should both go in Week 5.
    const result = groupFilesByLesson([
      file('Week 5 Amended - Art, skimming, scanning'),
      file('Week 5 - conditionals'),
    ])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].key).toBe('Week 5')
    expect(result.groups[0].files).toHaveLength(2)
  })

  it('handles Hebrew lesson markers end-to-end', () => {
    const result = groupFilesByLesson([
      file('שיעור 1 - מבוא'),
      file('שיעור 1 - הקדמה'),
      file('סילבוס'),
    ])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].key).toBe('שיעור 1')
    expect(result.unmatched.map(f => f.name)).toContain('סילבוס')
  })

  it('falls back to just the key when no topic info is available', () => {
    const result = groupFilesByLesson([
      file('Week 9'),
      file('Week 9'),
    ])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].folderName).toBe('Week 9')
  })
})
