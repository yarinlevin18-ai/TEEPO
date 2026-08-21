/**
 * AES-256-GCM round-trip + tamper detection for the server-side refresh
 * token storage (lib/server/token-crypto.ts).
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { encryptToken, decryptToken, __resetKeyCache } from '@/lib/server/token-crypto'

const ORIGINAL_SECRET = process.env.TOKEN_ENCRYPTION_SECRET

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_SECRET = 'test-secret-for-vitest'
  __resetKeyCache()
})

afterAll(() => {
  process.env.TOKEN_ENCRYPTION_SECRET = ORIGINAL_SECRET
  __resetKeyCache()
})

describe('token-crypto', () => {
  it('round-trips a token', () => {
    const { ciphertext, iv } = encryptToken('1//refresh-token-value')
    expect(decryptToken(ciphertext, iv)).toBe('1//refresh-token-value')
  })

  it('round-trips unicode', () => {
    const { ciphertext, iv } = encryptToken('טוקן-עם-עברית-🙂')
    expect(decryptToken(ciphertext, iv)).toBe('טוקן-עם-עברית-🙂')
  })

  it('uses a fresh IV per encryption', () => {
    const a = encryptToken('same-token')
    const b = encryptToken('same-token')
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('rejects tampered ciphertext', () => {
    const { ciphertext, iv } = encryptToken('secret')
    const buf = Buffer.from(ciphertext, 'base64')
    buf[0] ^= 0xff
    expect(() => decryptToken(buf.toString('base64'), iv)).toThrow()
  })

  it('rejects the wrong IV', () => {
    const a = encryptToken('secret')
    const b = encryptToken('other')
    expect(() => decryptToken(a.ciphertext, b.iv)).toThrow()
  })

  it('rejects a short IV', () => {
    const { ciphertext } = encryptToken('secret')
    expect(() => decryptToken(ciphertext, Buffer.from('short').toString('base64'))).toThrow('bad iv')
  })

  it('rejects truncated ciphertext', () => {
    const { iv } = encryptToken('secret')
    expect(() => decryptToken(Buffer.from('tiny').toString('base64'), iv)).toThrow('bad ciphertext')
  })

  it('rejects empty plaintext on encrypt', () => {
    expect(() => encryptToken('')).toThrow()
  })

  it('a different secret cannot decrypt', () => {
    const { ciphertext, iv } = encryptToken('secret')
    process.env.TOKEN_ENCRYPTION_SECRET = 'a-rotated-secret'
    __resetKeyCache()
    expect(() => decryptToken(ciphertext, iv)).toThrow()
  })

  it('throws a clear error when the secret is unset', () => {
    delete process.env.TOKEN_ENCRYPTION_SECRET
    __resetKeyCache()
    expect(() => encryptToken('x')).toThrow('TOKEN_ENCRYPTION_SECRET')
  })
})
