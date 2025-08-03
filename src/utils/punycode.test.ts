import { describe, it, expect } from 'vitest'
import { punycodeToUnicode, getDisplayArnsName, containsPunycode } from './punycode'

describe('punycode utilities', () => {
  describe('punycodeToUnicode', () => {
    it('should convert punycode domains to Unicode', () => {
      // Spanish ñ
      expect(punycodeToUnicode('xn--ol-yja')).toBe('ñol')
      expect(punycodeToUnicode('xn--ol-yja.arweave.net')).toBe('ñol.arweave.net')
      
      // French accents
      expect(punycodeToUnicode('xn--9ca')).toBe('é')
      expect(punycodeToUnicode('xn--8ca')).toBe('è')
      expect(punycodeToUnicode('xn--9ca.xn--8ca.arweave.net')).toBe('é.è.arweave.net')
      
      // Chinese characters
      expect(punycodeToUnicode('xn--ihqwcrb4cv8a8dqg056pqjye')).toBe('他们为什么不说中文')
      
      // Emoji (not typically in domain names but should handle)
      expect(punycodeToUnicode('xn--ls8h')).toBe('💩')
    })

    it('should handle regular ASCII domains without modification', () => {
      expect(punycodeToUnicode('regular')).toBe('regular')
      expect(punycodeToUnicode('regular.arweave.net')).toBe('regular.arweave.net')
      expect(punycodeToUnicode('sub.domain.arweave.net')).toBe('sub.domain.arweave.net')
    })

    it('should handle mixed punycode and ASCII domains', () => {
      expect(punycodeToUnicode('xn--ol-yja.regular.arweave.net')).toBe('ñol.regular.arweave.net')
      expect(punycodeToUnicode('regular.xn--ol-yja.arweave.net')).toBe('regular.ñol.arweave.net')
    })

    it('should handle invalid input gracefully', () => {
      expect(punycodeToUnicode('')).toBe('')
      expect(punycodeToUnicode(null as string)).toBe(null)
      expect(punycodeToUnicode(undefined as string)).toBe(undefined)
      expect(punycodeToUnicode(123 as string)).toBe(123)
    })

    it('should handle malformed punycode gracefully', () => {
      // Invalid punycode might be decoded to something unexpected, or returned as-is
      // The important thing is it doesn't throw an error
      const result1 = punycodeToUnicode('xn--invalid-')
      const result2 = punycodeToUnicode('xn--')
      
      // Just verify it returns something and doesn't throw
      expect(typeof result1).toBe('string')
      expect(typeof result2).toBe('string')
    })
  })

  describe('getDisplayArnsName', () => {
    it('should extract and convert ArNS name portion', () => {
      expect(getDisplayArnsName('xn--ol-yja')).toBe('ñol')
      expect(getDisplayArnsName('xn--ol-yja.arweave.net')).toBe('ñol')
      expect(getDisplayArnsName('xn--ol-yja.ar-io.dev')).toBe('ñol')
    })

    it('should handle regular names', () => {
      expect(getDisplayArnsName('regular')).toBe('regular')
      expect(getDisplayArnsName('regular.arweave.net')).toBe('regular')
      expect(getDisplayArnsName('my-arns-name.ar-io.dev')).toBe('my-arns-name')
    })

    it('should handle empty or invalid input', () => {
      expect(getDisplayArnsName('')).toBe('')
      expect(getDisplayArnsName(null as string)).toBe(null)
      expect(getDisplayArnsName(undefined as string)).toBe(undefined)
    })
  })

  describe('containsPunycode', () => {
    it('should detect punycode in strings', () => {
      expect(containsPunycode('xn--nol-mua')).toBe(true)
      expect(containsPunycode('xn--nol-mua.arweave.net')).toBe(true)
      expect(containsPunycode('regular.xn--8ca.domain')).toBe(true)
      expect(containsPunycode('XN--9CA')).toBe(true) // Case insensitive
    })

    it('should return false for non-punycode strings', () => {
      expect(containsPunycode('regular')).toBe(false)
      expect(containsPunycode('regular.arweave.net')).toBe(false)
      expect(containsPunycode('my-domain.com')).toBe(false)
      expect(containsPunycode('')).toBe(false)
    })
  })
})