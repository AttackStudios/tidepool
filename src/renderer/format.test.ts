import { describe, expect, it } from 'vitest'
import { compactNumber, relativeDate } from './format'

describe('compactNumber', () => {
  it('abbreviates thousands and millions', () => {
    expect(compactNumber(999)).toBe('999')
    expect(compactNumber(1500)).toBe('1.5k')
    expect(compactNumber(2_400_000)).toBe('2.4M')
  })
  it('drops a trailing .0', () => {
    expect(compactNumber(2000)).toBe('2k')
  })
})

describe('relativeDate', () => {
  const now = Date.parse('2026-08-09T00:00:00Z')
  it('describes recent dates in days', () => {
    expect(relativeDate('2026-08-08T00:00:00Z', now)).toBe('yesterday')
    expect(relativeDate('2026-08-01T00:00:00Z', now)).toBe('8d ago')
  })
  it('rolls up to months and years', () => {
    expect(relativeDate('2026-05-01T00:00:00Z', now)).toBe('3mo ago')
    expect(relativeDate('2024-08-09T00:00:00Z', now)).toBe('2y ago')
  })
  it('returns empty for missing or unparseable input', () => {
    expect(relativeDate('', now)).toBe('')
    expect(relativeDate('not a date', now)).toBe('')
  })
})
