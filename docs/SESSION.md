# Session checklist

The 2-minute ritual you run at the start and end of every coding session. **This file evolves.** When a step proves wrong, slow, or stale — fix it via PR. The partner approves quickly and we're aligned by the next session.

> **Phase:** Phase 1 (MVP for BGU + TAU)
> **Last updated:** 2026-04-26

---

## Session start

1. **Sync `main`:**
   ```bash
   git checkout main
   git pull
   ```
2. **Pick a task:** Open [GitHub Issues](https://github.com/yarinlevin18-ai/bgu-study-organizer/issues). Either continue an issue assigned to you, or claim one (assign yourself, set status to "In progress").
3. **Branch:**
   ```bash
   git checkout -b feature/<short-name>
   ```
   Prefixes: `feature/`, `fix/`, `chore/`, `refactor/`.
4. **Quick health check (skip if you ran it today):**
   - `npm run dev` boots without errors
   - Backend `/health` responds (warms Render if it was sleeping)

## During work

- Commit small. Push the branch on the first commit so your partner can see WIP if they ask.
- Open a **Draft PR** the moment you want feedback or want a Vercel preview URL.
- Stuck? Comment on the issue and tag your partner.

## Session end

1. **Push:**
   ```bash
   git add .
   git commit -m "what I did"
   git push
   ```
2. **PR status:**
   - Feature complete → mark **Ready for review**, ping partner.
   - Still WIP → leave on Draft, write a one-line "next step" in the PR body so future-you (or partner) can resume.
3. **Update the issue:** add a brief comment on what moved.
4. **Close laptop.** Don't merge your own PR.

---

## How to evolve this file

If a step here doesn't match reality, change it:

```bash
git checkout -b chore/session-update
# edit docs/SESSION.md
git commit -am "session: drop dev-server step (we test in preview now)"
git push -u origin chore/session-update
```

Open a one-line PR. Partner approves in 30 seconds. The ritual is now updated for both of you.

### Phase shifts

When the project moves to a new phase, this file gets new sections:

- **Pre-launch:** add "verify Supabase keep-alive ran in last 24h", "check Render status", "review feedback from beta users".
- **Phase 2 (exam prep):** add "test exam-mode toggle", "verify flashcard generator picks up new course material".

Update the **Phase** and **Last updated** lines at the top whenever sections change.
