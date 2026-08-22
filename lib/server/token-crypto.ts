/**
 * AES-256-GCM encrypt/decrypt for Google refresh tokens at rest.
 *
 * Server-only (Node crypto) — imported by the /api/auth/* routes, never
 * by client code. The key is derived once per process via HKDF-SHA256
 * from TOKEN_ENCRYPTION_SECRET, so rotating that env var invalidates
 * every stored token (worst case: users re-OAuth once).
 *
 * Wire format: base64 iv (12 bytes) + base64 ciphertext, where the GCM
 * auth tag (16 bytes) is appended to the ciphertext. Tampering with
 * either → decrypt() throws.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto'

const HKDF_INFO = 'google-refresh-token-v1'
const IV_BYTES = 12
const TAG_BYTES = 16

let cachedKey: Buffer | null = null

function key(): Buffer {
  if (cachedKey) return cachedKey
  const secret = process.env.TOKEN_ENCRYPTION_SECRET?.trim()
  if (!secret) throw new Error('TOKEN_ENCRYPTION_SECRET not configured')
  cachedKey = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), HKDF_INFO, 32))
  return cachedKey
}

/** For tests: reset the derived-key cache after changing the env var. */
export function __resetKeyCache(): void {
  cachedKey = null
}

export function encryptToken(plaintext: string): { ciphertext: string; iv: string } {
  if (!plaintext) throw new Error('cannot encrypt empty token')
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()])
  return { ciphertext: ct.toString('base64'), iv: iv.toString('base64') }
}

export function decryptToken(ciphertext: string, iv: string): string {
  const ivBuf = Buffer.from(iv, 'base64')
  if (ivBuf.length !== IV_BYTES) throw new Error('bad iv')
  const data = Buffer.from(ciphertext, 'base64')
  if (data.length <= TAG_BYTES) throw new Error('bad ciphertext')
  const tag = data.subarray(data.length - TAG_BYTES)
  const ct = data.subarray(0, data.length - TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', key(), ivBuf)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
