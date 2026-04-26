# Roadmap

Where the product is now and what's next. Updated whenever a feature finishes, a milestone shifts, or priorities change. PR-based, like everything else.

> **Last updated:** 2026-04-26

---

## Current phase

**Phase 1 — MVP for BGU + TAU students** (per `TEEPO_v2.1.docx`)

Single-user platform: course import from Moodle + Portal, assignments + grades, AI study assistant grounded on the user's own Drive content, credit tracking against a structured catalog, Google Calendar sync.

## In flight

| Feature | Owner | Status | PR |
|---|---|---|---|
| _(claim a feature here when you start it)_ | | | |

## Next up

Pull from this list when you finish a feature. Top of list = highest priority.

1. _(populate from open GitHub Issues)_
2.
3.

## Pre-launch checklist

Tracked as GitHub Issues. Tick when the issue closes.

- [ ] Supabase keep-alive (`.github/workflows/supabase-keepalive.yml`) OR upgrade to Pro
- [ ] Render: upgrade to paid tier ($7/mo) — kills cold starts
- [ ] Custom domain on Vercel + Render
- [ ] Google OAuth refresh-token mechanism (current one is fragile per spec)
- [ ] Vitest + 5 critical frontend tests
- [ ] pytest + 5 critical backend tests
- [ ] Playwright E2E: OAuth flow + course-import flow
- [ ] Moodle/Portal scrapers: biweekly manual sanity check until automated
- [ ] Privacy policy + Terms of Service: legal review
- [ ] Backup strategy for Drive DB corruption (last-write-wins is fragile)

## Phase 2 backlog (exam prep — not started)

Per `TEEPO_v2.1.docx` Appendix A. Don't start until Phase 1 ships.

- Smart review plan generator (per course, per exam)
- Exercise + flashcard generators from course material
- Past-exams library + simulated exam mode with timer
- Study groups (shared notes, Q&A board, shared task list for exam prep)

## Phase 3 (background, not in focus)

- Other Israeli universities (Technion, HUJI, Reichman, colleges)
- Move from scraping to official university APIs where possible
- Institution-level deployment model

---

## Owner directory

Each person picks whole features end-to-end (frontend + backend + Drive).

| Person | Currently owning | GitHub |
|---|---|---|
| Yarin | _(fill in)_ | @yarinlevin18-ai |
| Partner | _(fill in)_ | @_partner_ |

Cross-cutting changes (shared types, deploy config, schema migrations) — discuss in the issue before touching. See [`WORKFLOW.md`](WORKFLOW.md#when-to-discuss-before-touching).
