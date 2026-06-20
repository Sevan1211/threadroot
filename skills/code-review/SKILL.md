---
name: code-review
description: Use when reviewing code, pull requests, diffs, generated changes, or agent output for correctness, regressions, risk, maintainability, security, and missing tests.
scope: project
tags:
  - review
  - quality
---

# Code Review

Review behavior before style.

## Workflow

1. Identify the claimed intent of the change.
2. Inspect the behavioral path, data flow, edge cases, and failure handling.
3. Check for security issues: input validation, auth boundaries, path traversal, command execution, secrets, unsafe defaults.
4. Check tests: missing coverage, weak assertions, untested failures, snapshots that hide behavior.
5. Report findings first, ordered by severity, with file/line references when available.

## Output

Lead with findings. If there are no material issues, say so and mention residual risk or test gaps.
