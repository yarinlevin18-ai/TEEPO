'use client'

/**
 * Bridge between the TEEPO web app and the Chrome extension's external
 * messaging API. Used by the /assignments sync modal to hand off
 * file-transfer work (Moodle → Drive) to the extension after the
 * backend identifies what's new.
 *
 * The extension exposes two external messages (chrome-extension/background.js):
 *   - TEEPO_PING        → { ok, version, extensionId }
 *   - TEEPO_SYNC_FILE   → { ok, file? , error? }
 *
 * All public functions in this module:
 *   - Return null / a rejected outcome rather than throw, so the modal
 *     can gracefully fall back to "extension not available" UX.
 *   - Are no-ops in non-Chrome browsers (no `chrome.runtime.sendMessage`).
 */

const EXTENSION_ID = 'jdhpdacenamdkdjleojfjimaeggkokal'

export type FolderKind = 'assignments' | 'lessons' | 'notes'

export interface ExtensionPresence {
  available: boolean
  version?: string
  /** Human-readable reason when `available` is false. */
  reason?: string
}

export interface SyncFileResult {
  ok: boolean
  file?: { id: string; name: string }
  error?: string
}

interface ChromeRuntime {
  sendMessage(
    extensionId: string,
    message: unknown,
    callback: (response: unknown) => void,
  ): void
  lastError?: { message?: string }
}

interface ChromeGlobal {
  runtime?: ChromeRuntime
}

function getChrome(): ChromeGlobal | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { chrome?: ChromeGlobal }
  return w.chrome ?? null
}

/**
 * Returns a promise that resolves to whether the extension is installed,
 * loaded, and accepting external messages from this origin.
 *
 * Probes via TEEPO_PING with a 1.5s timeout. Failure modes:
 *   - Non-Chrome browser → no `chrome.runtime`
 *   - Extension not installed → chrome.runtime.lastError set
 *   - Extension installed but disabled / different origin → ditto
 *   - Slow service worker cold start → timeout (we treat as unavailable
 *     for the current modal lifecycle; the user can re-open and retry)
 */
export async function probeExtension(): Promise<ExtensionPresence> {
  const chromeApi = getChrome()
  if (!chromeApi?.runtime?.sendMessage) {
    return { available: false, reason: 'not-chrome' }
  }
  return new Promise<ExtensionPresence>((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ available: false, reason: 'timeout' })
    }, 1500)
    try {
      chromeApi.runtime!.sendMessage(EXTENSION_ID, { type: 'TEEPO_PING' }, (response) => {
        clearTimeout(timeout)
        const err = chromeApi.runtime?.lastError
        if (err) {
          resolve({ available: false, reason: err.message || 'unknown' })
          return
        }
        const ok = response && typeof response === 'object' && (response as { ok?: boolean }).ok
        if (ok) {
          const version = (response as { version?: string }).version
          resolve({ available: true, version })
        } else {
          resolve({ available: false, reason: 'no-ok' })
        }
      })
    } catch (e) {
      clearTimeout(timeout)
      resolve({ available: false, reason: (e as Error).message })
    }
  })
}

/**
 * Tell the extension to download a single file from Moodle and upload
 * it into the course's Drive folder. The extension uses Chrome's cookies
 * for the Moodle download (it has host_permissions for *.bgu.ac.il etc.)
 * and the website's Google token for the Drive upload (drive.file scope
 * tied to the same OAuth client that created the folders).
 */
export async function syncFileViaExtension(args: {
  file: { url: string; filename: string; mimeType?: string }
  courseId: string
  kind?: FolderKind
}): Promise<SyncFileResult> {
  const chromeApi = getChrome()
  if (!chromeApi?.runtime?.sendMessage) {
    return { ok: false, error: 'not-chrome' }
  }
  return new Promise<SyncFileResult>((resolve) => {
    try {
      chromeApi.runtime!.sendMessage(
        EXTENSION_ID,
        { type: 'TEEPO_SYNC_FILE', ...args, kind: args.kind ?? 'assignments' },
        (response) => {
          const err = chromeApi.runtime?.lastError
          if (err) {
            resolve({ ok: false, error: err.message || 'unknown' })
            return
          }
          if (response && typeof response === 'object') {
            resolve(response as SyncFileResult)
            return
          }
          resolve({ ok: false, error: 'no_response' })
        },
      )
    } catch (e) {
      resolve({ ok: false, error: (e as Error).message })
    }
  })
}

/**
 * The Chrome Web Store listing for the TEEPO extension. The bridge UI
 * shows this as the "install" CTA when the extension isn't detected.
 * (Currently unpublished — leaving the placeholder GitHub URL until the
 * extension is on the store.)
 */
export const EXTENSION_INSTALL_URL =
  'https://github.com/yarinlevin18-ai/TEEPO/blob/master/chrome-extension/README.md'
