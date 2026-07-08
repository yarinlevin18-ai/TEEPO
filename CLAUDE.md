# Project instructions for Claude

This file is loaded automatically by Claude Code in every conversation in this repo. Both contributors share it via git, so any change to workflow rules belongs here, not in personal settings.

## Source of truth

The human-facing workflow rules live in [CONTRIBUTING.md](./CONTRIBUTING.md). Read it before suggesting branch names, commit messages, or PR structure. The rules below are Claude-specific guardrails on top of it.

## Branching — non-negotiable

- **Never commit or push directly to `master`.** It is the protected integration branch (the docs call it `main`; the actual branch is `master` — flag this mismatch if asked).
- At the start of any task that will modify files, run `git status` first. If on `master`, **silently** (no need to ask the user) create a new branch before editing anything:
  ```bash
  git checkout master
  git pull
  git checkout -b <prefix>/<short-name>
  ```
  Pick the prefix and name from the task itself. Only ask the user about the branch name if the task is genuinely ambiguous.
- Prefixes: `feature/`, `fix/`, `chore/`, `refactor/`. Pick the one that matches the change.
- One branch = one task = one PR. If a second unrelated change comes up mid-work, open a new branch for it.
- Branches are short-lived. If a branch lives longer than a few days, rebase it on `master` and push.

## Commits

- English, present tense, imperative mood: `add notebook export`, not `added` or `adds`.
- Keep each commit focused. Split unrelated changes into separate commits.
- Never use `--no-verify`, `--force`, or `--amend` on a pushed commit without explicit user approval.
- Never commit `.env*`, credentials, or API keys. The `.gitignore` covers most of this — do not bypass it.

## Pull requests

- Push the branch and open a PR against `master` using `gh pr create`.
- Fill in the PR template (`.github/PULL_REQUEST_TEMPLATE.md`): what changed, why, how to test.
- Open as **Draft** while iterating; mark **Ready for review** when done.
- Never merge your own PR without the partner's approval.
- Squash-merge by default.

## Code conventions

- **UI / user-facing strings: Hebrew (RTL).** Test with `dir="rtl"` and Hebrew copy.
- **Code, identifiers, comments, commits, docs: English.**
- TypeScript strict mode; functional patterns; Zod for validation at boundaries.
- Frontend: prefer server components. Reach for `"use client"` only when state, effects, or browser APIs are actually needed.
- Reuse primitives in `components/ui/` before introducing new ones.
- Run `npm run lint` before pushing.
- **Frontend-only — there is no server.** The Python backend was retired (see [docs/REBUILD_PLAN.md](./docs/REBUILD_PLAN.md)). App logic lives in the Next.js app + a few serverless routes under `app/api/`. Server-side secrets (e.g. `ANTHROPIC_API_KEY`) are read from the environment inside those routes only — never `NEXT_PUBLIC_*`.
- **Data storage:** per-user data is a JSON blob in the user's Google Drive (`TEEPO/db.json`, via `lib/drive-db.ts` + `lib/db-context.tsx`), NOT a database. Supabase is auth-only (`supabase/README.md`). To add a persisted field, extend the `DriveDB` interface + `EMPTY_DB` and add CRUD to the db-context — no SQL migration.

## Coordination between contributors

Two people work on this repo, each with their own Claude. To avoid stepping on each other:

- Always `git pull` on `master` before creating a new branch.
- If a file is being edited on another open PR, prefer waiting or coordinating before touching it.
- When in doubt about whether a change overlaps with the partner's work, ask the user to check with them before proceeding.

## Things to ask before doing

- Pushing a branch for the first time (it becomes visible to the partner).
- Opening, closing, or merging a PR.
- Force-pushing, resetting, or deleting any branch.
- Touching CI config, deploy config, or anything under `.github/`.
- Adding a new dependency.

## Local dev notes

- The repo must not live inside iCloud / OneDrive / Google Drive sync folders — cloud stubs break git and `npm install`.
- Each contributor uses their own Anthropic API key; billing rolls up to the shared workspace.
