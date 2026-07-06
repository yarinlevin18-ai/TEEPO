# TEEPO Rebuild Plan — retrieval-practice pivot

_Last updated: 2026-07-06. This replaces PROJECT_STATE.md, NEXT_SESSION.md, TASKS.md,
MORNING_REVIEW.md and claude-code-handoff.md, which were months stale and have been removed._

## The idea

TEEPO's next core feature is **module practice quizzes**, modeled on the architecture of
"Phosphor" (Kestin et al., re-deployed at Dartmouth, Spring 2026): structured
retrieval-practice quizzes over course material, with **constructed-response questions
graded by Claude against rubrics**. The study's learning gains came from the quiz loop,
not from a chat assistant — so TEEPO gets no chatbot. The AI is a grader, invisible in
the day-to-day UX.

TEEPO's twist vs Phosphor: there is no instructor authoring content. Each student's
quizzes are **generated from their own course material** already organized in their
Drive by the Brain. The Brain becomes the content-ingestion layer.

## What we keep (the spine)

- `lib/auth-context.tsx` — Google OAuth + token refresh. Battle-tested. Do not touch
  casually; PRs #53/#57 are active here.
- `lib/db-context.tsx` + `lib/drive-db.ts` — the Drive `db.json` engine.
- The Brain (`/summaries`, `components/drive/DriveOrganize.tsx`) — the differentiator,
  and now the quiz content source.
- Dashboard, assignments, credits, course pages, the cream/RTL design system.

## Phase 1 — the grading loop (in progress, branch `feature/module-quizzes`)

End-to-end for one course:

1. Student picks a course + source files (a week's material) → `POST /api/quiz/generate`
   reads the files from Drive and has Claude write 4–6 constructed-response questions,
   each with a hidden grading rubric.
2. Student answers in free text → `POST /api/quiz/grade` scores each answer against its
   rubric with concrete feedback (Hebrew).
3. Quizzes + attempts stored per-user in the Drive `db.json` (they are self-generated
   and per-user, so no cross-user store is needed yet; revisit Supabase if shared
   quizzes or cohort analytics ever land).

Requires `ANTHROPIC_API_KEY` in the frontend env (Vercel / `.env.local`). Runs as
Next.js API routes — no Python backend involvement.

## Phase 2 — week-centric dashboard

The Phosphor unit is the module/week. TEEPO's Drive tree is already week-organized.
Surface "this week's material + this week's quiz" as the dashboard's center of gravity.
See `design/mockups/teepo-week-dashboard-mockup.html` for the design exploration.

## Phase 3 — engagement view

Per-course streaks / attempt history from stored attempts, on the dashboard.

## Deferred (known debt, deliberately not in this pass)

- **Moodle scraper stack** (`backend/services/moodle_scraper.py`, `routes/university.py`,
  `routes/sync.py`, the `/moodle` page): ~90% of the Python backend, fragile, on a
  sleeping free Render instance. Candidate for removal in its own PR — big blast radius,
  decide together first.
- **Socket.IO chat**: `backend/routes/websocket.py`, `agent_conversations` table,
  `socket.io-client` dep. No frontend UI exists. Kill in the same backend-trim PR.
- **Dual SQL schemas**: `supabase/schema.sql` and `backend/create_tables.sql` disagree
  (user_id types, quiz shapes). Reconcile when the backend is trimmed.
- **Backend auth refresh route**: superseded by the Vercel `/api/auth/refresh-google`
  route; remove with the backend trim (coordinate with PR #53/#57 first).

## Honesty note on the research

The Dartmouth result is correlational (no RCT); ~90% opted in but only ~11% reached full
engagement. The 0.71–1.30 SD effect is promising, not proven. Phase 1 is deliberately
cheap: build it, use it for two real weeks of studying, and let that decide Phase 2.
