# Workflow

The rules. Rarely changes. If something here is wrong, fix it via PR.

## Branching

- `main` is protected. No direct pushes — GitHub will reject them.
- One branch per change. Prefix the name:
  - `feature/<name>` — new functionality
  - `fix/<name>` — bug fix
  - `chore/<name>` — tooling, deps, docs
  - `refactor/<name>` — internal cleanup
- Lowercase, hyphens. Short.

## Pull requests

- 1 PR = 1 logical change.
- Use **Draft** while iterating, mark **Ready for review** when done.
- 1 approval required. Squash-merge. Delete the branch after.
- Don't merge your own PR. Wait for partner.
- Fill in the PR template — what, why, how to test.

## Deploy chain

| Push to | Triggers |
|---|---|
| any branch | Vercel preview URL on the PR |
| `main` | Vercel production + Render production |

If a deploy fails, fix forward in a new PR. Don't revert unless it's an emergency.

## Schema changes (Supabase)

1. Write a numbered migration: `backend/migrate_NNN.sql` (NNN = next available number).
2. Run it manually in the Supabase SQL editor.
3. Update `supabase/schema.sql` to reflect the cumulative schema.
4. Commit migration file + schema update in the same PR.
5. Never edit an existing migration. Only add new ones.

## Secrets

- Never commit `.env`, API keys, or credentials. They're gitignored — keep it that way.
- Share via 1Password / Bitwarden shared vault. Not Slack, not email, not Telegram.
- Each partner has their **own** Anthropic API key (billed to one workspace) so they can be rotated independently.
- If a secret leaks (committed by accident, screenshot, anything): rotate the key immediately and tell the other partner.

## Conventions

- **Hebrew + RTL first.** Every UI change tested with `dir="rtl"` and Hebrew copy. Don't add CSS that assumes LTR.
- **Drive folder names in Hebrew.** Root folder is `לימודים/`, not `TEEPO/` or `Studies/`.
- **Catalogs** (`lib/bgu-catalog.ts`, `lib/tau-catalog.ts`) are client-side bundled. Update them at the start of each academic year.
- **Cold start ping.** Frontend must ping backend `/health` on app start to wake Render free tier.
- **No new state libs.** Stick with React Context (`auth-context`, `db-context`, `theme-context`). No Redux, no Zustand.

## When to discuss before touching

These are shared surfaces. Open the issue, mention it, agree on the change before pushing:

- `types/index.ts` — shared TypeScript interfaces
- `tailwind.config.ts` / `next.config.js`
- Deploy config: `vercel.json`, `render.yaml`, `backend/Dockerfile`
- Auth flow: `lib/auth-context.tsx`, `app/auth/`, OAuth scopes
- DB schema: any new migration

Everything else — own it within your feature.
