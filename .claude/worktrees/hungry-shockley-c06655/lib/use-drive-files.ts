'use client'

/**
 * useDriveFiles — live snapshot of files inside a Drive folder.
 *
 * Polls Drive every `POLL_MS` (default 30s) so the summaries page picks up
 * uploads made elsewhere (e.g. the Chrome extension pushing a fresh
 * lecture) without a manual refresh. Pauses while the tab is hidden so
 * we don't burn token quota on backgrounded pages.
 *
 * Returns optimistic upload + trash mutations so the UI doesn't wait the
 * full poll cycle to reflect user actions — successful Drive responses
 * replace the optimistic entry; failures roll it back.
 *
 * Pass `folderId=null` to disable the hook entirely (e.g. a course that
 * hasn't had its folder hierarchy provisioned yet).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './auth-context'
import {
  listFolderFiles,
  uploadFile,
  trashFile,
  type DriveFile,
} from './drive-files'

const POLL_MS = 30_000

export interface DriveFilesState {
  files: DriveFile[]
  loading: boolean
  error: string | null
  /** Manual refresh — useful right after a mutation that bypassed the hook. */
  refresh: () => Promise<void>
  upload: (file: File) => Promise<void>
  remove: (fileId: string) => Promise<void>
  /** True while at least one upload is in flight. */
  uploading: boolean
}

export function useDriveFiles(folderId: string | null | undefined): DriveFilesState {
  const { googleToken, refreshGoogleToken } = useAuth()
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Refs so the polling closure always sees the latest values without
  // tearing down the interval every render.
  const folderRef = useRef(folderId)
  const tokenRef = useRef(googleToken)
  folderRef.current = folderId
  tokenRef.current = googleToken

  // Resolve a fresh token if our cached one might be expired. The auth
  // context already handles proactive refresh, so this is just a fallback.
  const getToken = useCallback(async (): Promise<string | null> => {
    if (tokenRef.current) return tokenRef.current
    const fresh = await refreshGoogleToken()
    return fresh
  }, [refreshGoogleToken])

  const fetchOnce = useCallback(async (): Promise<void> => {
    const fid = folderRef.current
    if (!fid) return
    const tok = await getToken()
    if (!tok) {
      setError('לא ניתן להתחבר ל-Drive')
      return
    }
    try {
      const list = await listFolderFiles(tok, fid)
      setFiles(list)
      setError(null)
    } catch (e) {
      // 401 likely means token expired mid-poll — try one refresh + retry.
      const msg = String((e as Error)?.message || e)
      if (msg.startsWith('Drive list 401')) {
        const fresh = await refreshGoogleToken()
        if (fresh) {
          try {
            const list = await listFolderFiles(fresh, fid)
            setFiles(list)
            setError(null)
            return
          } catch {}
        }
      }
      setError(msg.slice(0, 160))
    }
  }, [getToken, refreshGoogleToken])

  // Kick off + interval. Reset whenever the folder changes.
  useEffect(() => {
    if (!folderId) return
    let cancelled = false
    setLoading(true)
    fetchOnce().finally(() => { if (!cancelled) setLoading(false) })

    const id = setInterval(() => {
      // Skip while the tab is hidden — saves quota + battery
      if (document.visibilityState === 'visible') void fetchOnce()
    }, POLL_MS)

    // Refresh immediately when the tab regains focus, in case it was
    // hidden across a >POLL_MS gap.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchOnce()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [folderId, fetchOnce])

  // ── Mutations ────────────────────────────────────────────────────────

  const upload = useCallback(async (file: File): Promise<void> => {
    const fid = folderRef.current
    if (!fid) throw new Error('אין תיקייה פעילה')
    const tok = await getToken()
    if (!tok) throw new Error('לא מחובר ל-Google')

    // Optimistic placeholder — gets the same id once Drive responds.
    const tempId = `tmp-${Date.now()}-${file.name}`
    const placeholder: DriveFile = {
      id: tempId,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: String(file.size),
      modifiedTime: new Date().toISOString(),
    }
    setFiles(prev => [placeholder, ...prev])
    setUploading(true)
    try {
      const real = await uploadFile(tok, fid, file, file.name)
      setFiles(prev => prev.map(f => (f.id === tempId ? real : f)))
    } catch (e) {
      setFiles(prev => prev.filter(f => f.id !== tempId))
      throw e
    } finally {
      setUploading(false)
    }
  }, [getToken])

  const remove = useCallback(async (fileId: string): Promise<void> => {
    const tok = await getToken()
    if (!tok) throw new Error('לא מחובר ל-Google')
    // Optimistic remove
    const snapshot = files
    setFiles(prev => prev.filter(f => f.id !== fileId))
    try {
      await trashFile(tok, fileId)
    } catch (e) {
      setFiles(snapshot) // rollback
      throw e
    }
  }, [files, getToken])

  return { files, loading, error, refresh: fetchOnce, upload, remove, uploading }
}
