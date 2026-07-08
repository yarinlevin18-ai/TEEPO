/**
 * API Client — static catalog only.
 *
 * The Python/Flask backend has been retired. All per-user data (courses,
 * tasks, assignments, notes, lessons, grades) now lives in the Drive DB via
 * `useDB()` (see lib/db-context.tsx). The only thing left here is the static
 * course catalog, which is served from bundled JSON in /public and needs no
 * backend at all.
 *
 * There is intentionally no `request()` helper and no BACKEND_URL — if you're
 * tempted to add a network call here, it almost certainly belongs in the Drive
 * DB instead.
 */
import {
  getTracks as _catalogTracks,
  getTrackWithCourses as _catalogTrack,
  searchCatalogCourses as _catalogSearch,
} from './catalog'

export const api = {
  catalog: {
    // Static catalog data only — per-user data lives in Drive DB now.
    // Served from /public/catalog.<uni>.json (v2.1) with /catalog.json
    // legacy fallback. Optional `university` param picks the file.
    tracks: (university?: 'bgu' | 'tau') => _catalogTracks(university),
    track: (id: string, university?: 'bgu' | 'tau') => _catalogTrack(id, university),
    searchCourses: (q: string, dept?: string, track?: string, university?: 'bgu' | 'tau') =>
      _catalogSearch(q, dept, track, university),
  },
}
