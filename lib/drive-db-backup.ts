/**
 * Drive DB backup / restore.
 *
 * Versioned snapshots of the user's `db.json` stored alongside it in Drive.
 * Per spec (TEEPO_v2.1.docx Appendix C §6 + the v2.1 pre-launch checklist):
 *
 *   - Snapshots live in `TEEPO/.backups/` next to `db.json`
 *   - Filenames are sortable: `db-YYYY-MM-DDTHH-mm-ss.json`
 *   - At most 30 snapshots retained (oldest pruned automatically)
 *   - Restore is opt-in user action — overwrites the live `db.json`
 *
 * Why a sibling folder rather than file revisions: the `drive.file` scope only
 * sees app-created files. We can't read native Drive revision history through
 * this scope. Owning explicit snapshot files keeps us in scope and gives us
 * full control over retention.
 *
 * What this protects against:
 *   1. Accidental delete-everything in the UI
 *   2. Multi-device write races (last-write-wins per drive-db.ts; restore
 *      lets the user roll back if they catch it)
 *   3. Schema migration bugs (a v1 → v2 migration regression can be undone)
 *
 * What this does NOT protect against:
 *   - Drive API outage at the moment of restore (no offline cache)
 *   - User of two different Google accounts (snapshots live in whichever
 *     account is signed in at write time)
 */

import {
  DRIVE_API_INTERNAL as DRIVE_API,
  DRIVE_UPLOAD_INTERNAL as DRIVE_UPLOAD,
  driveFetch,
  findByName,
  type DriveDB,
  type DriveDBHandle,
} from './drive-db'

const BACKUPS_FOLDER_NAME = '.backups'
export const MAX_SNAPSHOTS = 30

export interface SnapshotMetadata {
  fileId: string
  filename: string
  /** ISO timestamp parsed from the filename — easier than reading Drive metadata. */
  created_at: string
  /** Size in bytes if Drive returned it (otherwise undefined). */
  size?: number
}

// ── Folder + filename helpers ──────────────────────────────────

function snapshotFilename(now: Date = new Date()): string {
  // Replace colons (which work on Drive but trip some local clients) with
  // dashes. Strip milliseconds — sub-second precision isn't useful for
  // user-facing snapshot lists.
  const iso = now.toISOString().replace(/\..+$/, '').replace(/:/g, '-')
  return `db-${iso}.json`
}

function parseFilenameTimestamp(filename: string): string | null {
  // Inverse of snapshotFilename. Returns ISO string or null.
  const m = filename.match(/^db-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.json$/)
  if (!m) return null
  // Re-introduce colons for ISO 8601.
  const reIso = m[1].replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3') + 'Z'
  const d = new Date(reIso)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** Get or create the `.backups/` subfolder of the TEEPO/ folder. */
async function getOrCreateBackupsFolder(
  token: string,
  teepoFolderId: string,
): Promise<string> {
  const existing = await findByName(
    token,
    BACKUPS_FOLDER_NAME,
    'application/vnd.google-apps.folder',
    teepoFolderId,
  )
  if (existing) return existing.id

  const res = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: BACKUPS_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [teepoFolderId],
    }),
  })
  if (!res.ok) throw new Error(`Failed to create backups folder: ${res.status}`)
  const data = await res.json()
  return data.id
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Write a snapshot of `db` into `.backups/`. After writing, prune any
 * snapshots beyond MAX_SNAPSHOTS — best-effort, errors are swallowed
 * because a write succeeding is more important than a clean retention list.
 *
 * Returns the new snapshot's metadata.
 */
export async function createSnapshot(
  token: string,
  handle: DriveDBHandle,
  db: DriveDB,
): Promise<SnapshotMetadata> {
  const backupsFolderId = await getOrCreateBackupsFolder(token, handle.folderId)
  const filename = snapshotFilename()

  // Multipart upload — same pattern as `createDBFile` in drive-db.ts.
  const boundary = 'teepo-snap-' + Math.random().toString(36).slice(2)
  const metadata = {
    name: filename,
    mimeType: 'application/json',
    parents: [backupsFolderId],
  }
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(db)}\r\n` +
    `--${boundary}--`

  const res = await driveFetch(
    token,
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,size`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  )
  if (!res.ok) throw new Error(`Failed to write snapshot: ${res.status}`)
  const data = await res.json()

  const created = parseFilenameTimestamp(filename) ?? new Date().toISOString()
  const snapshot: SnapshotMetadata = {
    fileId: data.id,
    filename: data.name,
    created_at: created,
    size: data.size ? Number(data.size) : undefined,
  }

  // Best-effort prune. Don't surface errors — they shouldn't break the save.
  void pruneSnapshots(token, handle).catch(() => {})

  return snapshot
}

/**
 * List all snapshots in `.backups/`, sorted newest-first.
 *
 * Returns an empty array if the backups folder doesn't exist yet — that's
 * the normal state for a brand-new user.
 */
export async function listSnapshots(
  token: string,
  handle: DriveDBHandle,
): Promise<SnapshotMetadata[]> {
  const backupsFolder = await findByName(
    token,
    BACKUPS_FOLDER_NAME,
    'application/vnd.google-apps.folder',
    handle.folderId,
  )
  if (!backupsFolder) return []

  // Drive's `orderBy=name desc` sorts alphabetically — works on our timestamp
  // filenames because they're ISO-formatted (lexicographic == chronological).
  const url =
    `${DRIVE_API}/files` +
    `?q=${encodeURIComponent(`'${backupsFolder.id}' in parents and trashed = false`)}` +
    `&fields=files(id,name,size)` +
    `&orderBy=name desc` +
    `&pageSize=100`

  const res = await driveFetch(token, url)
  if (!res.ok) throw new Error(`Failed to list snapshots: ${res.status}`)
  const data = await res.json()

  const items: SnapshotMetadata[] = []
  for (const f of data.files ?? []) {
    const ts = parseFilenameTimestamp(f.name)
    if (!ts) continue // skip anything that doesn't match the expected naming
    items.push({
      fileId: f.id,
      filename: f.name,
      created_at: ts,
      size: f.size ? Number(f.size) : undefined,
    })
  }
  return items
}

/** Read a specific snapshot's contents. Used by the restore flow. */
export async function readSnapshot(
  token: string,
  fileId: string,
): Promise<DriveDB> {
  const res = await driveFetch(token, `${DRIVE_API}/files/${fileId}?alt=media`)
  if (!res.ok) throw new Error(`Failed to read snapshot: ${res.status}`)
  return (await res.json()) as DriveDB
}

/**
 * Restore a snapshot by overwriting the live `db.json`.
 *
 * Safety: writes a fresh "pre-restore" snapshot of the current DB BEFORE
 * overwriting, so the user can undo a restore that turned out wrong. The
 * pre-restore snapshot uses the standard naming, so it shows up in the
 * normal snapshots list — sortable next to the others.
 *
 * Returns the restored DB so the caller can update React state immediately.
 */
export async function restoreSnapshot(
  token: string,
  handle: DriveDBHandle,
  snapshotFileId: string,
): Promise<DriveDB> {
  // Read the snapshot first — if it's unreachable we abort before touching
  // the live db.json.
  const snapshotDb = await readSnapshot(token, snapshotFileId)

  // Snapshot CURRENT state so the restore is undoable.
  // We need to read the current db.json to snapshot it. Try, but don't
  // fail the restore if reading current state fails — the user explicitly
  // chose to overwrite.
  try {
    const currentRes = await driveFetch(
      token,
      `${DRIVE_API}/files/${handle.fileId}?alt=media`,
    )
    if (currentRes.ok) {
      const currentDb = (await currentRes.json()) as DriveDB
      await createSnapshot(token, handle, currentDb)
    }
  } catch {
    // Current DB unreachable — proceed with restore anyway.
  }

  // Overwrite live db.json with the snapshot contents.
  const restored: DriveDB = { ...snapshotDb, updated_at: new Date().toISOString() }
  const res = await driveFetch(
    token,
    `${DRIVE_UPLOAD}/files/${handle.fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(restored),
    },
  )
  if (!res.ok) throw new Error(`Failed to overwrite db.json: ${res.status}`)

  return restored
}

/**
 * Delete snapshots beyond MAX_SNAPSHOTS, keeping the newest. Called
 * automatically after `createSnapshot`. Returns the number deleted.
 */
export async function pruneSnapshots(
  token: string,
  handle: DriveDBHandle,
  keepN = MAX_SNAPSHOTS,
): Promise<number> {
  const snapshots = await listSnapshots(token, handle)
  if (snapshots.length <= keepN) return 0

  const toDelete = snapshots.slice(keepN)
  let deleted = 0
  for (const s of toDelete) {
    try {
      const res = await driveFetch(token, `${DRIVE_API}/files/${s.fileId}`, {
        method: 'DELETE',
      })
      if (res.ok || res.status === 404) deleted++
    } catch {
      // One failure shouldn't stop the rest. Best-effort cleanup.
    }
  }
  return deleted
}
