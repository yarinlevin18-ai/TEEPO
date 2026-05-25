---
description: Fix a bug shown in an attached screenshot
argument-hint: (attach screenshot, optionally add notes)
---

# Fix bug from screenshot

The user has attached a screenshot showing a bug in TEEPO (the Hebrew learning platform in this repo). Your job: diagnose and fix the actual bug shown.

Additional user notes: $ARGUMENTS

## How to approach this

1. **Read the screenshot carefully.**
   - What page is it (URL in the address bar, visible UI elements)?
   - What error message is shown? (Hebrew text is common — translate if needed.)
   - What was the user likely trying to do when it broke?
   - Any obvious visual glitches, missing data, misaligned elements?

2. **Locate the code.**
   - Map the URL path to the route file. For `/courses/[id]` → `app/(dashboard)/courses/[id]/page.tsx`, etc.
   - Grep for the exact error message string (Hebrew or English) to find where it's thrown.
   - If the error is a generic "שגיאה..." string, trace the function that throws it and check what it calls (Drive DB, backend API, etc.).

3. **Diagnose the root cause, don't just patch the symptom.**
   - Check recent changes in the area (this repo just migrated from Supabase → Google Drive per-user DB via `lib/drive-db.ts` + `lib/db-context.tsx` — many bugs will be related to that migration).
   - Consider: missing Drive scope? Token refresh issue? Race between DB load and first user action? Stale reference to old `api.*` calls? Type mismatch after the Course/Lesson interface change?
   - Check the browser console errors the user can see (if visible in screenshot) — those are gold.

4. **Fix it properly.**
   - Edit the actual source of the bug, not a wrapper around it.
   - If the fix involves the Drive DB layer, remember: state updates are optimistic and Drive saves are debounced 600ms in `db-context.tsx`.
   - Preserve Hebrew strings and RTL layout.
   - Don't add `console.log` debugging unless you remove it after.

5. **Verify.**
   - Run `npx tsc --noEmit` to confirm no type errors introduced.
   - Explain the root cause and the fix in 2-3 sentences so the user understands what broke.

## Important context about this codebase

- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind. Hebrew RTL. Dark theme (`#0f1117` / indigo-violet gradients).
- **Auth:** Supabase Auth with Google OAuth. Scopes: `calendar.readonly` + `drive.file`.
- **Data:** Per-user database in the user's own Google Drive (`TEEPO/db.json`). Accessed via `useDB()` / `useCourses()` / `useCourse()` / `useLessons()` hooks from `lib/db-context.tsx`. Supabase is auth-only now.
- **Backend:** Flask at `backend/` — mostly legacy (was Supabase-backed). Still used for BGU Moodle scraping, AI summaries/quizzes, and assignment breakdown. Not for CRUD anymore.
- **Common migration gotchas:**
  - A page still importing `api.courses.*` / `api.tasks.*` / `api.assignments.*` for CRUD → should use `useDB()` instead.
  - DB operations before `ready === true` fail silently — UI should wait for `ready`.
  - `drive.file` scope was just added — users who logged in before the migration need to re-auth (sign out + sign in) before Drive writes work.

## Don't

- Don't guess. If you can't see enough in the screenshot to be confident, say what you'd need to see and ask.
- Don't make unrelated "improvements" while fixing — keep the diff focused on the bug.
- Don't commit changes unless the user asks.
