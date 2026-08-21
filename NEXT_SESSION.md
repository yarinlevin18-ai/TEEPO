# Next session — start here

_Updated 2026-08-22, end of the overnight revival build._

## What just happened (short version)

The project was revived after ~3 months idle. Full story in `PROJECT_STATE.md` §1. Highlights: production landing/login/loading/todos pages had shipped with **no CSS at all** — fixed and deployed (#193). Baseline (types, tests, build, lint, backend pytest) is fully green.

## Do this first

1. **Review + merge the three draft PRs**: #194 (mobile fixes), #195 (encrypted refresh-token storage), #196 (bypass E2E tier).
2. **For #195 to actually work** (it degrades gracefully until then):
   - Run `backend/migrate_006.sql` in the Supabase SQL editor.
   - In Vercel env (server-side, no `NEXT_PUBLIC_` prefix): set `TOKEN_ENCRYPTION_SECRET` (any long random string) + `SUPABASE_SERVICE_KEY`.
3. **Verify production end-to-end with a real account** (nobody has since May): sign in → add course → Drive folders appear → extension upload lands files → they show on `/summaries`. The May bugs were fixed by #82–#84 but never re-verified.

## Known small polish items (not blocking)

- Inline text links under 36px on `/moodle` and the landing/auth footers.
- `todos-v2-meta-piece` has no dedicated CSS rule (renders fine as plain inline text).

## Environment notes

- Dev without Google: `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` in `.env.local` → `/dashboard` works with a fake user.
- E2E bypass tier: `NEXT_PUBLIC_DEV_BYPASS_AUTH=true npx playwright test e2e/bypass`.
- Remote sandboxes: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium` skips browser downloads.
