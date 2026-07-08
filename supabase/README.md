# Supabase in TEEPO — auth only

TEEPO uses Supabase for **one thing: authentication** (Google OAuth via
`@supabase/ssr` / `@supabase/supabase-js`). There is no application data in
Postgres — the app makes zero table queries (`grep -r ".from(" app lib components`
returns nothing; only `supabase.auth.*` is used).

## Where the data actually lives

All per-user data is a single JSON blob in the user's own Google Drive:
`TEEPO/db.json`, managed by [`lib/drive-db.ts`](../lib/drive-db.ts) and
[`lib/db-context.tsx`](../lib/db-context.tsx). Courses, lessons, tasks,
assignments, notes, credits, and practice quizzes all live there. See the
`DriveDB` interface for the shape.

This is deliberate: it needs no server-side database to run, the user owns
their data, and it works offline-first with debounced sync.

## History

Earlier versions kept a Postgres schema here (`schema.sql`, `rls_audit.sql`)
and a Python backend mirrored some tables. Both were removed when the project
retired the backend (see [`docs/REBUILD_PLAN.md`](../docs/REBUILD_PLAN.md)).
The schema described tables that nothing read or wrote — it was kept only as
legacy. If a shared/relational store is ever needed again (e.g. cohort quiz
analytics), reintroduce a schema here at that point, matched to a real reader.

## Configuring auth

Only two env vars are needed (see [`.env.example`](../.env.example)):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Google OAuth must be enabled as a provider in the Supabase dashboard, with the
Drive + Calendar scopes configured on the Google side.
