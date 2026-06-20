---
name: conventional-commits
description: Use when writing, reviewing, or suggesting git commit messages, release notes, changelog entries, or structured commit summaries.
scope: project
tags:
  - git
  - commits
---

# Conventional Commits

Write commits as `type(scope): subject`.

## Types

- `feat`: user-visible feature.
- `fix`: bug fix.
- `docs`: documentation only.
- `refactor`: behavior-preserving code change.
- `test`: test-only change.
- `chore`: maintenance.
- `build` or `ci`: build system or CI.

## Rules

- Keep the subject imperative, specific, and under about 72 characters.
- Do not add a trailing period.
- Explain why in the body when the change is non-obvious.
- Mark breaking changes with `!` or a `BREAKING CHANGE:` footer.
