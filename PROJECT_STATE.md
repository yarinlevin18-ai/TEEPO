# PROJECT_STATE — TEEPO

_Last updated: 2026-08-22 (project revival session)_

---

## 1. Where we are right now

### Revival (Aug 21–22, after ~3 months idle)
The project came back from hibernation. Baseline is fully green again:

| Check | Status |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | 183/183 (160 + 23 new auth-backend/crypto specs on #195) |
| backend `pytest` | 24/24 |
| `next build` | 26 routes, works even without Supabase env vars |
| `next lint` | zero warnings |

**Merged during revival:**
- **#192** — build no longer crashes without Supabase env vars; last 2 a11y lint warnings fixed; stale backend sync-test assertions fixed (CI was red since announcements landed).
- **#193** — **the big one**: the v2 redesign had shipped `landing`, `login`, `loading`, and `todos` pages with ZERO CSS (the `.landing-v2-*`/`.login-v2-*`/`.loading-screen-v2-*`/`.todos-v2-*` namespaces were never committed). Production rendered those pages unstyled. ~680 lines of cream-token CSS restored.

**Open PRs from the overnight build (draft, need review):**
- **#194** `fix/mobile-critical` — mobile sweep results: LCD clock clipped at ≤420px, todos Enter-hint clutter, storage-line RTL bidi, 36px add-task touch target.
- **#195** `feature/server-refresh-token-storage` — encrypted server-side Google refresh tokens (rebuild of closed #53/#57 on the Vercel architecture). **Needs user action before it works: run `backend/migrate_006.sql` in Supabase + set `TOKEN_ENCRYPTION_SECRET` and `SUPABASE_SERVICE_KEY` in Vercel env.** Degrades gracefully without them.
- **#196** `chore/e2e-scaffold` — 6 Playwright specs that actually run (bypass tier), plus `PLAYWRIGHT_CHROMIUM_PATH` config override.

### Mobile sweep audit (Aug 22)
Playwright, 15 routes × 320/375/768/1024px: **no horizontal overflow anywhere**. The ≤320px fears in the old backlog were unfounded; the four real defects found are fixed in #194. Remaining polish candidates (small): inline-link touch targets on `/moodle` and the landing/auth footers.

### The May Drive bug — resolved (historical note)
`NEXT_SESSION.md`'s May-12 bug list (extension `drive_404`, "can't add course") was fixed the following day by #82–#84: the extension now reuses the website's Google token (drive.file visibility is per OAuth app), token refresh moved to Vercel, and the OAuth callback forwards provider tokens via URL hash. `/courses` has an add-course path via the banner → `/courses/extract`.

---

## 2. How to run locally

```bash
# Frontend (auth bypass, no Google needed):
printf 'NEXT_PUBLIC_DEV_BYPASS_AUTH=true\n' >> .env.local
npm run dev            # http://localhost:3000/dashboard

# E2E bypass tier:
NEXT_PUBLIC_DEV_BYPASS_AUTH=true npx playwright test e2e/bypass

# Backend tests:
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest
```

---

## 3. Backlog — prioritized

### A. Verify production end-to-end (needs the user, ~15 min)
1. Confirm Supabase project + Render service are still alive (free tiers pause/sleep after inactivity — keepalive workflows exist in `.github/workflows/` but verify they're green).
2. On production: sign in → add a course → check Drive folders appear → extension upload. The code paths were all fixed in May but never re-verified end-to-end.

### B. Land the open PRs
Review + merge #194 / #195 / #196. For #195 also run the migration + set the two Vercel env vars (see PR body).

### C. Schema gaps from v2 PRs (each ~1 PR: migration + form + mutation)
- `Assignment.is_group_work`, `collaborators[]`, `drive_folder_url`, `grade_weight` (#188)
- `Course.course_average`, `meeting_location`, `lecturer_office_hours` (#189)
- `StudentProfile.current_semester` explicit field (#182)
- `EventNote` model for the dashboard day-board notes (#182)

### D. Pre-launch (from `TASKS.md`)
- Custom domain in Vercel/Render
- Paid tier upgrades (Supabase Pro / Render Starter)
- Legal review of privacy + terms
- Optional: bypass E2E tier in CI (5-line edit to `.github/workflows/e2e.yml` — needs user OK for CI changes)

### E. Backend / extension improvements
- Drive watch (push) instead of 30s polling
- Resumable uploads >100MB
- Smarter "lessons vs assignments" classifier in the extension
- Refresh-token rotation propagation (noted out-of-scope in #195)

---

## 4. How to use this doc

Session start: read this file → check §3 → pick work. Session end: update §1 with what landed and §3 with what surfaced. `NEXT_SESSION.md` holds the short-form "do this first next time" note.
