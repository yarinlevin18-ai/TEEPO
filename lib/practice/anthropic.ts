/**
 * Minimal server-side Anthropic Messages API client.
 *
 * Plain fetch instead of the SDK — the two practice routes need exactly one
 * call shape, and skipping the dependency keeps the bundle and the
 * approval-for-new-deps process out of the loop.
 *
 * Server only (reads ANTHROPIC_API_KEY). Never import from client code.
 */

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

/** Default grader/author model. Override with ANTHROPIC_MODEL. */
const DEFAULT_MODEL = 'claude-sonnet-5'

export type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'document'
      source: { type: 'base64'; media_type: 'application/pdf'; data: string }
    }

export class AnthropicError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'AnthropicError'
  }
}

export function anthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

/**
 * Single-turn call: system + one user message (possibly multi-block, e.g.
 * PDFs + instructions). Returns the concatenated text of the reply.
 */
export async function callClaude(opts: {
  system: string
  content: ContentBlock[]
  maxTokens?: number
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new AnthropicError(500, 'ANTHROPIC_API_KEY is not configured on the server')
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: [{ role: 'user', content: opts.content }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new AnthropicError(res.status, `Anthropic ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = await res.json()
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
  if (!text) throw new AnthropicError(502, 'Anthropic returned an empty reply')
  return text
}
