/**
 * TEEPO Drive-Sync — service worker (background.js).
 *
 * Responsibilities:
 *   1. OAuth flow with Google (chrome.identity.getAuthToken). The token's
 *      cached by Chrome's identity API; we just refresh on demand.
 *   2. Drive uploads (multipart). Content scripts/popup post a message of
 *      type 'UPLOAD' with { filename, mimeType, dataUrl, folderId } and we
 *      take it from there.
 *   3. Resolve "where does this course's file go?" by hitting the TEEPO
 *      backend at /api/drive/folder-for-course.
 *   4. Persist a small cache (storage.local) of seen course → folder
 *      mappings so we don't hit the backend for every file.
 *
 * The actual content scraping lives in content scripts. This worker is a
 * router/transport layer with no DOM access.
 */

// Production by default. Override via chrome.storage.local for local dev,
// or via the dev-mode toggle once we wire one. Previously this defaulted
// to localhost:3000, which made the extension silently target a dev
// server most users don't have running — surfacing as upload failures
// and a broken "פתח את המוח ב-TEEPO" link.
const TEEPO_BASE = 'https://bgu-study-organizer.vercel.app'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

// ── Config helpers ────────────────────────────────────────────────────────

async function getConfig() {
  const { teepoBase } = await chrome.storage.local.get('teepoBase')
  return { teepoBase: teepoBase || TEEPO_BASE }
}

// ── OAuth ────────────────────────────────────────────────────────────────
//
// Why two tokens?
//   * chrome.identity gives a token tied to the EXTENSION'S OAuth client
//     (Chrome Extension type). It's used for sign-in state / openid info.
//   * The WEBSITE'S OAuth client (Web Application type, via Supabase) is
//     what created all the user's Drive folders. With `drive.file` scope,
//     each OAuth client is a separate "app" — files/folders created by one
//     are invisible to the other, even within the same Google project.
//
// Concretely: if we upload to a folder created by the website using the
// extension's token, Drive accepts the upload but the website can't see
// the file afterwards. That's why the user saw "uploaded" in the popup
// but no files on /summaries.
//
// Fix: for any Drive read/write that touches website-owned data, use the
// website's token instead. We grab it from the website tab's localStorage
// (key: smartdesk_google_token, set by lib/auth-context.tsx).

const WEB_TOKEN_KEY = 'smartdesk_google_token'

/**
 * Get a Google OAuth token via chrome.identity. Cached by Chrome — the API
 * surfaces a fresh token automatically when the cache expires (~60min).
 *
 * Used only for the extension's own identity needs (sign-in state, email).
 * Do NOT use this for Drive operations against website-owned folders.
 */
function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'No token'))
        return
      }
      resolve(token)
    })
  })
}

/** Force Chrome to drop its cached token. Used after a 401 from Drive. */
function clearAuthToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve())
  })
}

async function signOut() {
  try {
    const token = await getAuthToken(false)
    await clearAuthToken(token)
    // Tell Google to revoke the grant too, so the next sign-in shows the
    // consent screen instead of silently reusing the prior consent.
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' })
  } catch {}
  // Forget our cached website token too.
  try { await chrome.storage.local.remove('teepoWebToken') } catch {}
}

/**
 * Read the user's Google access_token from an open TEEPO website tab.
 * Returns null if no TEEPO tab is open or the user isn't signed in.
 *
 * The website's auth-context.tsx persists this token to localStorage on
 * sign-in and refresh, so it's always current as long as the user has
 * the site open in any tab.
 */
async function getWebsiteGoogleToken() {
  const { teepoBase } = await getConfig()
  // Build match patterns for the active base + localhost for dev.
  const baseOrigin = new URL(teepoBase).origin
  const matches = [`${baseOrigin}/*`, 'http://localhost:3000/*']

  let tabs = []
  try {
    tabs = await chrome.tabs.query({ url: matches })
  } catch (e) {
    // host_permissions usually cover these but bail out quietly if not.
    console.warn('[bg] tabs.query failed for', matches, e)
    return null
  }
  if (tabs.length === 0) return null

  for (const tab of tabs) {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: (key) => {
          try { return localStorage.getItem(key) } catch { return null }
        },
        args: [WEB_TOKEN_KEY],
      })
      const token = result?.[0]?.result
      if (token) return token
    } catch (e) {
      // Permission error, tab discarded, etc. — try the next one.
      console.warn('[bg] readWebToken failed on tab', tab.id, e)
    }
  }
  return null
}

/**
 * Get the token to use for Drive operations against website-owned data.
 * Prefers the website's token (drive.file scope tied to the website's
 * OAuth client); throws a friendly error if no TEEPO tab is available.
 */
async function getDriveToken() {
  const webToken = await getWebsiteGoogleToken()
  if (webToken) return webToken
  const { teepoBase } = await getConfig()
  throw new Error(
    `Open ${teepoBase} in a tab and sign in so the extension can use your TEEPO Drive token.`,
  )
}

// ── Folder mapping (TEEPO backend) ────────────────────────────────────────

const folderCache = new Map() // courseId+kind → folderId, in-memory only

async function resolveFolder({ courseId, kind = 'lessons' }) {
  const cacheKey = `${courseId}::${kind}`
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey)

  // Fall back to storage in case the worker was unloaded between uploads.
  const stored = await chrome.storage.local.get(`folder:${cacheKey}`)
  if (stored[`folder:${cacheKey}`]) {
    folderCache.set(cacheKey, stored[`folder:${cacheKey}`])
    return stored[`folder:${cacheKey}`]
  }

  const { teepoBase } = await getConfig()
  // Use the WEBSITE'S Google token — the backend reads TEEPO/db.json and
  // returns drive_folder_ids that only the website's OAuth client can write
  // to. Calling with chrome.identity's token would either 404 (can't see
  // TEEPO root) or hand back a folderId that's invisible to us on upload.
  const token = await getDriveToken()
  const url = `${teepoBase}/api/drive/folder-for-course?course=${encodeURIComponent(courseId)}&kind=${encodeURIComponent(kind)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Folder resolve ${res.status}: ${body.slice(0, 160)}`)
  }
  const data = await res.json()
  if (!data.folderId) throw new Error('No folderId in response')

  folderCache.set(cacheKey, data.folderId)
  await chrome.storage.local.set({ [`folder:${cacheKey}`]: data.folderId })
  return data.folderId
}

// ── Drive multipart upload ───────────────────────────────────────────────

/**
 * Upload a blob to Drive. `data` can be either a base64 string (from
 * content scripts that can't share Blob across the bridge) or an
 * already-fetched URL we'll re-fetch inside the worker.
 *
 * We re-fetch URLs from the worker context to preserve user cookies for
 * authenticated downloads (e.g. Moodle behind login) — content scripts
 * also have cookies, but the worker has the same cookie jar AND can
 * stream directly to Drive without a base64 round-trip.
 */
async function uploadFile({ folderId, sourceUrl, dataUrl, filename, mimeType }) {
  // Use the website's Google token so the uploaded file ends up in the
  // same drive.file-scope namespace as the folder (= visible on /summaries).
  // chrome.identity's token is the extension's app and would create files
  // invisible to the website.
  let token = await getDriveToken()

  // Resolve content into a Blob.
  let blob
  if (dataUrl) {
    const res = await fetch(dataUrl)
    blob = await res.blob()
  } else if (sourceUrl) {
    const res = await fetch(sourceUrl, { credentials: 'include' })
    if (!res.ok) throw new Error(`source ${res.status}`)
    blob = await res.blob()
  } else {
    throw new Error('Need sourceUrl or dataUrl')
  }

  const meta = {
    name: filename,
    parents: [folderId],
  }
  const boundary = `teepo-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(meta),
      `\r\n--${boundary}\r\nContent-Type: ${mimeType || blob.type || 'application/octet-stream'}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  )

  let res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  // On 401, re-read from the website (the user may have refreshed the tab
  // since we last fetched). We can't force a refresh of THEIR token —
  // that's the website's job — so a second 401 is terminal.
  if (res.status === 401) {
    token = await getDriveToken()
    res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    })
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`upload ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// ── Message router ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Async handler — return true to keep the channel open while we resolve.
  ;(async () => {
    try {
      switch (msg?.type) {
        case 'AUTH_STATUS': {
          try {
            const token = await getAuthToken(false)
            sendResponse({ ok: true, authed: Boolean(token) })
          } catch {
            sendResponse({ ok: true, authed: false })
          }
          break
        }
        case 'SIGN_IN': {
          const token = await getAuthToken(true)
          sendResponse({ ok: true, authed: Boolean(token) })
          break
        }
        case 'GET_WEB_TOKEN': {
          // Returns the website's Google access_token (drive.file scope under
          // the website's OAuth client). Required for every Drive operation
          // that touches website-owned folders. Null if no TEEPO tab open.
          try {
            const token = await getWebsiteGoogleToken()
            sendResponse({ ok: true, token })
          } catch (e) {
            sendResponse({ ok: false, error: e?.message || 'web-token failed' })
          }
          break
        }
        case 'SIGN_OUT': {
          await signOut()
          sendResponse({ ok: true })
          break
        }
        case 'RESOLVE_FOLDER': {
          const folderId = await resolveFolder({
            courseId: msg.courseId,
            kind: msg.kind || 'lessons',
          })
          sendResponse({ ok: true, folderId })
          break
        }
        case 'UPLOAD': {
          const result = await uploadFile({
            folderId: msg.folderId,
            sourceUrl: msg.sourceUrl,
            dataUrl: msg.dataUrl,
            filename: msg.filename,
            mimeType: msg.mimeType,
          })
          sendResponse({ ok: true, file: result })
          break
        }
        default:
          sendResponse({ ok: false, error: 'unknown_type' })
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) })
    }
  })()
  return true
})

// Lifecycle log so install/update is visible in chrome://extensions logs.
chrome.runtime.onInstalled.addListener((info) => {
  console.info('[TEEPO] installed/updated:', info.reason)
})
