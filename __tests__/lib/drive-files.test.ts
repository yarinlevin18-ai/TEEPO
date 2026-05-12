/**
 * Drive file helpers — formatters + mime-kind mapping.
 *
 * `formatSize` is Hebrew-RTL adjacent (no number formatting concerns) but
 * needs to handle Drive's string-typed bytes, edge values (0, NaN), and
 * unit boundaries.
 *
 * `fileKind` is used to pick the right Lucide icon in the Drive panel —
 * if a mime maps to the wrong kind, users see (e.g.) a sheet icon on a
 * Word doc. Easy to break, easy to test.
 */
import { describe, it, expect } from 'vitest'
import { formatSize, fileKind } from '@/lib/drive-files'

describe('formatSize', () => {
  it('returns empty string for undefined / null / non-positive / NaN', () => {
    expect(formatSize(undefined)).toBe('')
    expect(formatSize(0)).toBe('')
    expect(formatSize(-100)).toBe('')
    expect(formatSize('abc')).toBe('') // parseInt('abc') → NaN
    expect(formatSize('0')).toBe('')
  })

  it('accepts numbers OR Drive\'s stringified bytes', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize('512')).toBe('512 B')
  })

  it('formats bytes < 1KB as plain B', () => {
    expect(formatSize(1)).toBe('1 B')
    expect(formatSize(1023)).toBe('1023 B')
  })

  it('formats kilobytes with one decimal', () => {
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(1024 * 1.5)).toBe('1.5 KB')
    expect(formatSize(1024 * 1023)).toBe('1023.0 KB')
  })

  it('formats megabytes with one decimal', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatSize(1024 * 1024 * 2.5)).toBe('2.5 MB')
  })

  it('formats gigabytes with two decimals', () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.00 GB')
    expect(formatSize(1024 * 1024 * 1024 * 3.14)).toBe('3.14 GB')
  })
})

describe('fileKind', () => {
  it('detects PDFs', () => {
    expect(fileKind('application/pdf')).toBe('pdf')
  })

  it('groups image/* under image', () => {
    expect(fileKind('image/png')).toBe('image')
    expect(fileKind('image/jpeg')).toBe('image')
    expect(fileKind('image/svg+xml')).toBe('image')
    expect(fileKind('image/webp')).toBe('image')
  })

  it('groups video/* under video', () => {
    expect(fileKind('video/mp4')).toBe('video')
    expect(fileKind('video/quicktime')).toBe('video')
  })

  it('groups audio/* under audio', () => {
    expect(fileKind('audio/mpeg')).toBe('audio')
    expect(fileKind('audio/wav')).toBe('audio')
  })

  it('recognises PowerPoint variants as slide', () => {
    expect(fileKind('application/vnd.ms-powerpoint')).toBe('slide')
    expect(fileKind('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('slide')
  })

  it('recognises Excel variants as sheet', () => {
    expect(fileKind('application/vnd.ms-excel')).toBe('sheet')
    expect(fileKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('sheet')
  })

  it('recognises Word variants as doc', () => {
    expect(fileKind('application/msword')).toBe('doc')
    expect(fileKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('doc')
    expect(fileKind('text/plain')).toBe('doc')
  })

  it('recognises archives', () => {
    expect(fileKind('application/zip')).toBe('archive')
    expect(fileKind('application/x-rar-compressed')).toBe('archive')
  })

  it('falls back to "other" for unknown mimes', () => {
    expect(fileKind('application/x-totally-unknown')).toBe('other')
    expect(fileKind('')).toBe('other')
  })
})
