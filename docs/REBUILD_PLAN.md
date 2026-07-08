# TEEPO architecture & rebuild plan

_Last updated: 2026-07-08. This is the current-state doc; it replaces the stale
`PROJECT_STATE.md` / `NEXT_SESSION.md` that were removed._

## What TEEPO is now

A **frontend-only** study-organization app for Israeli university students,
plus AI-graded practice quizzes. There is no server to maintain:

- **Next.js 14 (app router)** on Vercel — all pages, plus a few serverless API
  routes (`app/api/*`).
- **Supabase** — authentication only (Google OAuth). Zero application tables;
  see [`supabase/README.md`](../supabase/README.md).
- **Google Drive** — the actual per-user database is `TEEPO/db.json` in the
  user's own Drive ([`lib/drive-db.ts`](../lib/drive-db.ts),
  [`lib/db-context.tsx`](../lib/db-context.tsx)).
- **Anthropic API** — powers the practice quizzes via `app/api/quiz/*`
  (server-side `ANTHROPIC_API_KEY`).
- **Chrome extension** (`chrome-extension/`) — discovers Moodle courses and
  uploads their files into Drive. It talks to Drive + the `app/api/drive/*` and
  `app/api/courses/import` routes directly; it does **not** need any Python
  backend.

## The Python backend was retired (2026-07-08)

The old Flask/Selenium backend on Render (Moodle scraper + study-buddy chat +
assignment breakdown + grade scrape) was deleted. It was fragile (headless
Chrome OOM-ing on a 512MB free dyno), barely maintained (`autoDeploy: false`,
kept alive by a cron), and the frontend already routed around it. What each of
its features became:

| Retired backend feature | Replacement |
| --- | --- |
| Moodle course/grade scraping, `/api/sync/all` | Removed. The Chrome extension already imports courses+files into Drive. |
| Study-buddy chat (Socket.IO) | Removed (the Dartmouth study TEEPO is modeled on found the chat was the unused part). |
| AI assignment breakdown into subtasks | Removed; assignments are created without AI subtasks. Could return as a Next.js `/api/*` route later. |
| Manual grade save + grade list | Now Drive-DB: `upsertStudentCourse` / `db.student_courses`. |
| Google token refresh | Already moved to Vercel (`app/api/auth/refresh-google`). |

Removed along with it: `backend/`, `render.yaml`, the render-keepalive +
test-backend CI workflows, `lib/backend-url.ts`, `lib/run-sync.ts`,
`lib/use-auto-sync.ts`, `lib/use-moodle-status.ts`, `lib/use-wakeup.ts`,
`components/WakeupBanner.tsx`, `components/sync/*`, the `/moodle` page, the
announcements feature, `lib/extension-bridge.ts` (Moodle→Drive handoff), the
`socket.io-client` dep, and the stale `supabase/schema.sql` + `rls_audit.sql`.

## Practice quizzes (the pivot — working)

Phosphor-style retrieval practice. Two surfaces:

- **`/courses/[id]/practice`** — generate a quiz from a course's Drive files
  (and/or pasted text); quizzes + attempts persist to `db.json`.
- **`/practice`** — standalone: paste any material → graded quiz. Ephemeral,
  works with no Drive access (and, under the dev bypass, no sign-in).

Both use `/api/quiz/generate` (files/text → Claude → open questions + rubrics)
and `/api/quiz/grade` (answer + rubric → score + Hebrew feedback), shared
`components/practice/QuizRunner.tsx`, and Zod schemas in `lib/practice/`.

## What's next (not done yet)

- **Week-centric dashboard** — surface "this week's material + this week's
  quiz" as the dashboard's center of gravity.
- **Engagement view** — per-course streaks / attempt history from stored
  attempts.
- **Optional:** re-add AI assignment breakdown as a Next.js `/api/*` route if
  it's missed (it was a pure LLM call — no scraping needed).

## Honesty note on the research

The Dartmouth/Phosphor result is correlational (no RCT); ~90% opted in but only
~11% reached full engagement. The 0.71–1.30 SD effect is promising, not proven.
The quiz feature is cheap to run — use it for real studying and let that decide
how far to invest in phases 2–3.
