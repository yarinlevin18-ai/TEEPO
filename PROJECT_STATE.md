# PROJECT_STATE — TEEPO

_Last updated: 2026-05-23 (post v2 mockup migration sweep)_

---

## 1. Where we are right now

### Shipped (last 7 days, 18 PRs)
**Cream cleanup (#173–#181):** dark-theme debt removed, `GlowCard` deleted, lint warnings fixed, Google Fonts → `next/font`, shared `EmptyState` / `PageSkeleton` / `ErrorAlert` primitives, global `:focus-visible` + skip-link + reduced-motion + modal ARIA.

**v2 mockup migrations (#182–#190):** every page now matches `teepo-design/mockup_*_v2.html`:
| URL | PR | Source mockup |
|---|---|---|
| `/` | #185 | `mockup_landing.html` |
| `/auth` | #184 | `mockup_login.html` |
| `app/loading.tsx` + `<LoadingScreen />` | #183 | `mockup_loading.html` |
| `/dashboard` | #182 | `mockup_dashboard_v2.html` |
| `/assignments` | #188 | `mockup_tasks_v2.html` |
| `/todos` | #187 | `mockup_todos.html` |
| `/credits` | (cream cleanup #174) | — |
| `/courses` | #190 | `mockup_drive_organize.html` |
| `/courses/[id]` | #189 | `mockup_course.html` |
| `/summaries` | #186 | `mockup_summaries.html` |
| `/settings` | (cream cleanup #173) | — |
| `/moodle` | (cream cleanup #175) | — |
| `/university` | (cream cleanup #176) | — |

### Audit summary
- `tsc --noEmit` clean
- `vitest run` 160/160
- `next build` 26 routes compile
- `next lint` — 2 `aria-selected` warnings on treeitems in `components/drive/DriveOrganize.tsx` (lines 222, 249). Trivial 2-line fix.
- Zero TODO/FIXME markers in `app/`, `components/`, `lib/`
- No `GlowCard` references anywhere
- 45 `@media` queries across `app/globals.css` covering 10 distinct breakpoints

### Open PRs (not mine to merge)
- **#57** `feat(auth): JWT-first Google refresh + encrypted token upload (Stage 2)` — Draft, waiting on Stage 1 backend (#53)
- **#53** `feat(backend): encrypted server-side storage for Google refresh tokens` — Stage 1 backend, May 6

---

## 2. Local dev — currently running

**URL:** http://localhost:3000
**Dashboard (auth-bypass on):** http://localhost:3000/dashboard
**Background process id:** `bo93nie47`

The dev bypass is active via `.env.local` — no Google sign-in required. The fake user has an empty DB, so every page shows its empty state. **Hard-guarded against production** (refuses to activate when `NODE_ENV=production`).

**Routes to spot-check** (in your browser, devtools mobile mode):
```
/                  /auth              /dashboard         /assignments
/todos             /credits           /courses           /courses/extract
/courses/classify  /summaries         /settings          /moodle
/university        /diagnostics       /setup
```

---

## 3. Backlog — prioritized

### A. Mobile sweep + polish (picked next, in progress)
Current state of responsive coverage in `app/globals.css`:
| Breakpoint | Usages |
|---|---|
| `≤600px` | 11 (heaviest — `.settings-v2`, `.credits-v2`, `.moodle-v2`, others) |
| `≤700px` | 7 (`.todos-page`, `.summaries-page`) |
| `≤760px` | 7 (`.tasks-v2-page`, others) |
| `≤540px` | 4 |
| `≤420px` | 3 (smallest — small-iPhone targets) |
| `≤320px` | 0 ⚠️ **no rules** — pages rely on liquid layouts at 320px |

**Likely issues to verify in your browser at 320px / 375px / 768px / 1024px:**
- Landing hero text at 320px (the `teepo` wordmark + logo combo is large)
- Assignments cards: course-badge + title + meta + priority all in one row → likely overflows ≤480px
- Drive-organize tree: SVG connectors are computed by `useLayoutEffect` + `ResizeObserver`. Verify they redraw correctly on viewport change.
- TopNav mobile drawer — does it open / close correctly?
- Modal widths: settings modals, backup-restore confirm — verify they fit at 320px
- Touch targets: small action buttons (refresh, dismiss, delete) should be ≥ 44×44px

**Plan structure (3 PRs):**
- `fix/mobile-critical`: any pages that overflow / break at ≤375px + the 2 a11y warnings (`aria-selected`)
- `fix/mobile-important`: TopNav mobile UX, touch target sizing, table overflow patterns
- `fix/mobile-polish`: typography scaling, spacing, prefers-reduced-motion edge cases

### B. Schema gaps from v2 PRs
The v2 mockups surface fields that don't exist in the DB schema. Each one currently renders as an empty state — works but loses info:
- `Assignment.is_group_work`, `Assignment.collaborators[]`, `Assignment.drive_folder_url`, `Assignment.grade_weight` (from #188)
- `Course.course_average`, `Course.meeting_location`, `Course.lecturer_office_hours` (from #189)
- `StudentProfile.current_semester` explicit field (currently derived) (from #182)
- `EventNote` model for the dashboard day-board notes panel (from #182)

Each adds 1 schema migration + 1 form/UI + 1 mutation handler. ~1 PR each.

### C. Pre-launch (from `TASKS.md`)
- OAuth refresh Stage 2 frontend (#57 already drafted — needs Stage 1 backend #53 merged first)
- Playwright E2E tests for auth + course-import flows (scaffold exists, tests missing)
- Custom domain in Vercel/Render
- Paid tier upgrades (Supabase Pro / Render Starter)
- Legal review of privacy + terms

### D. Backend / extension (from `NEXT_SESSION.md`)
- Drive watch (push) instead of 30s polling
- Resumable uploads >100MB
- Smarter "lessons vs assignments" classifier in the Chrome extension

### E. Housekeeping
- `NEXT_SESSION.md` is from May 12 — still mentions GlowCard + "deferred visual refit". Out of date.
- `MORNING_REVIEW.md` is from the locked-design merge. Out of date.
- Empty git worktrees under `.claude/worktrees/` (the cleanup worktree from last week) — safe to remove
- Several old `feature/*` branches on origin not deleted after merge

---

## 4. How to use this doc

When starting a new session:
1. Open this file first
2. Verify dev server still running (`curl localhost:3000` should return 200)
3. Pick a section from **§3 Backlog** to work on
4. After shipping work, update §1 and §3

When ending a session:
1. Note any new backlog items in §3
2. Update **§1 Audit summary** counts (lint warnings, test count)
3. Note in §1 what new PRs landed
