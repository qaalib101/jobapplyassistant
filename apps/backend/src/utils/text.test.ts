import { describe, it, expect } from 'vitest'
import * as textUtils from './text'

describe('text utilities', () => {
  describe('normalizeText', () => {
    it('should normalize text by converting to lowercase and replacing non-alphanumeric chars with spaces', () => {
      expect(textUtils.normalizeText('Hello World')).toBe('hello world')
      expect(textUtils.normalizeText('HELLO-WORLD')).toBe('hello world')
      expect(textUtils.normalizeText('hello@world123')).toBe('hello world123')
      expect(textUtils.normalizeText(null)).toBe('')
      expect(textUtils.normalizeText(undefined)).toBe('')
    })
  })

  describe('canonicalizeUrl', () => {
    it('should remove hash fragments and utm parameters', () => {
      const url = 'https://example.com/path?utm_source=google&param=value#section'
      expect(textUtils.canonicalizeUrl(url)).toBe('https://example.com/path?param=value')
    })

    it('should handle invalid URLs gracefully', () => {
      expect(textUtils.canonicalizeUrl('invalid-url')).toBe('invalid-url')
    })
  })

  describe('hostname', () => {
    it('should extract hostname from URL', () => {
      expect(textUtils.hostname('https://example.com/path')).toBe('example.com')
    })

    it('should return null for invalid URLs', () => {
      expect(textUtils.hostname('invalid-url')).toBe(null)
    })
  })

  describe('hashValue', () => {
    it('should hash a string using SHA256', () => {
      expect(textUtils.hashValue('test')).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')
    })
  })

  describe('redactValue', () => {
    it('should redact a value with visible characters at the beginning', () => {
      expect(textUtils.redactValue('12345678')).toBe('12******')
      expect(textUtils.redactValue('ab')).toBe('**')
      expect(textUtils.redactValue('')).toBe('')
    })
  })
})