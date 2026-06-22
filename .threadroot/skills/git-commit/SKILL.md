---
name: git-commit
description: Use when preparing, reviewing, or creating git commits so commit scope, staging, and messages stay consistent and reviewable.
license: MIT
compatibility: Threadroot-managed Agent Skills. Use with local git commands through normal agent approval and repository safety rules.
tags:
  - git
  - commits
  - workflow
---

# Git Commit

Use this skill to create focused, consistent commits without relying on broad provider tool permissions.

## Workflow

1. Inspect scope before staging:

```bash
git status -sb
git diff --stat
git diff
```

2. If the worktree contains unrelated changes, ask which files belong in the commit.
3. Run the relevant validation before committing. Prefer Threadroot tools when available:

```bash
threadroot run quick-check
```

4. Stage only the intended files. Prefer explicit paths over `git add -A` unless the whole worktree is confirmed in scope.
5. Write a detailed commit message:
   - Subject: concise conventional-commit style when it fits, such as `fix(skills): harden skills.sh intake`
   - Body: explain what changed, why it changed, user/product impact, and validation performed
6. Commit with a multi-paragraph message using `git commit -m` with repeated `-m` flags.
7. After commit, report the commit SHA, changed scope, validation, and whether anything remains unstaged.

## Safety

- Do not change git config, rewrite history, reset, force-push, or delete branches unless the user explicitly asks.
- Do not commit secrets, credentials, `.env` files, local caches, or generated provider folders unless they are intentionally part of the requested change.
- Do not stage unrelated user changes silently.
