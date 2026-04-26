# Git cheat sheet

The 6 commands you actually use.

## Start a change

```bash
git checkout main
git pull
git checkout -b feature/my-thing
```

## Save your work

```bash
git add .
git commit -m "what I did"
git push -u origin feature/my-thing   # first push only — drops the -u after
```

After the first push, just `git push`.

## After your PR is merged

```bash
git checkout main
git pull
git branch -d feature/my-thing
```

## Pull in main mid-work (someone else merged something)

```bash
git fetch origin
git rebase origin/main
# resolve conflicts if any, then:
git push --force-with-lease
```

## Oops

| Problem | Fix |
|---|---|
| Started on `main` by accident | `git stash` → `git checkout -b feature/x` → `git stash pop` |
| Bad commit message (not pushed) | `git commit --amend -m "better"` |
| Want to undo last commit, keep changes | `git reset --soft HEAD~1` |
| Mid-rebase, want out | `git rebase --abort` |

That's it. Anything more advanced — ask Claude or look it up.
