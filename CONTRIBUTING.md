# Contributing

Thanks for working on TEEPO. This guide covers our day-to-day workflow.

## Branching

- `main` is protected. No direct pushes — everything lands via PR.
- Branch from `main` using a descriptive prefix:
  - `feature/<short-name>` — new functionality
  - `fix/<short-name>` — bug fix
  - `chore/<short-name>` — tooling, deps, docs
  - `refactor/<short-name>` — internal restructure, no behavior change

```bash
git checkout main
git pull
git checkout -b feature/notebook-export
```

## Commits

- Write commits in English, present tense, imperative mood.
  - Good: `add notebook export to Word`
  - Bad: `added stuff`, `fixes things`
- Keep commits focused. Multiple unrelated changes → multiple commits.
- Reference an issue when relevant: `fix(auth): redirect after login (#42)`

## Pull requests

1. Push your branch and open a PR against `main`.
2. Fill in the PR template — what changed, why, how to test.
3. Mark as **Draft** while you're still iterating; mark **Ready for review** when you want eyes on it.
4. At least one approval required before merge.
5. Squash-merge by default. Keep the squashed commit message clean.

### What goes in a PR

- Code changes
- Tests where reasonable
- Updated docs (README, comments) if behavior changed
- Migration files if schema changed

### What does NOT go in a PR

- Secrets (`.env`, API keys, credentials) — these are gitignored for a reason
- Build artifacts (`.next/`, `node_modules/`, `__pycache__/`)
- IDE files unless we agreed to commit them
- Cloud-provider runtime data (e.g. Chrome profiles, scraper cookies)

## Code style

### Frontend (TypeScript / React)

- Follow the existing patterns in `components/` and `app/`.
- Use the existing UI primitives in `components/ui/` before adding new ones.
- RTL/Hebrew first — test with `dir="rtl"` and Hebrew copy.
- Prefer server components; reach for `"use client"` only when you actually need state, effects, or browser APIs.
- Run `npm run lint` before pushing.

### Backend (Python)

- Python 3.11+ syntax.
- Type hints on public functions.
- Routes go in `backend/routes/`, agents in `backend/agents/`, business logic in `backend/services/`.
- Don't import secrets directly — use `config.py`.

### Database

- Schema changes require a numbered migration file in `backend/` (`migrate_NNN.sql`) — never edit existing migrations.
- Update `supabase/schema.sql` to reflect the cumulative schema.
- Verify RLS policies still pass `supabase/rls_audit.sql`.

## Secrets and credentials

- **Never commit secrets.** If you do by accident, rotate the key immediately and tell the other maintainer.
- Share secrets through 1Password / Bitwarden, never Slack / email / git.
- Each contributor should have their **own** Anthropic API key — billing can roll up to a shared workspace.

## Local dev tips

- Don't put the repo inside OneDrive, iCloud Drive, or any cloud-sync folder. Cloud-only stubs break git and dev tooling. Use `C:\Projects\` or `~/dev/`.
- The Moodle scraper drops a Chrome profile under `backend/data/chrome_profile/` — this is gitignored, don't commit it.
- If `npm install` or git acts strange, first check that no parent folder is cloud-synced.

## Issue triage

- Use GitHub Issues for bugs, feature requests, and tasks.
- Labels:
  - `bug`, `enhancement`, `chore`
  - `frontend`, `backend`, `infra`, `docs`
  - `good first issue` — small and well-scoped
  - `blocked` — waiting on something external

## Communication

- Quick questions: shared chat.
- Decisions worth a record: comment on the PR or the issue.
- Architectural changes: open a discussion or a draft PR with a written rationale before writing code.

## Releasing

We don't tag releases yet. Production tracks `main`:

- **Frontend** auto-deploys to Vercel on merge to `main`.
- **Backend** auto-deploys to Render on merge to `main`.

Always verify the live URL after a merge that touches deploy config.
