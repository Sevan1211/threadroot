---
name: alignment-questions
description: Use when a request has ambiguous goals, missing constraints, unclear risk tolerance, or multiple reasonable implementation paths, so the agent can ask focused questions before acting.
license: MIT
compatibility: Threadroot-managed Agent Skills. Use for project work where shared understanding matters before changing code or harness behavior.
tags:
  - alignment
  - planning
  - requirements
---

# Alignment Questions

Use this skill to get fully aligned before work that could go in more than one reasonable direction.

## Workflow

1. Identify the smallest set of missing facts that could change the implementation, safety posture, user experience, or verification plan.
2. Ask only those questions. Prefer one to three concise questions.
3. When a reasonable default is safe, state the assumption and continue instead of blocking.
4. Stop and ask before acting when:
   - the request could affect secrets, credentials, destructive operations, external services, releases, or user data
   - the user is choosing between product behavior, UX tradeoffs, compatibility promises, or public API shape
   - the codebase has competing patterns and choosing the wrong one would create churn
5. After the user answers, restate the selected direction in one sentence, then proceed.
6. If new uncertainty appears while implementing, ask again only if the answer materially changes the next action.

## Question Style

- Ask concrete questions that are easy to answer.
- Name the decision the question affects.
- Offer a recommended default when helpful.
- Avoid broad questionnaires, performative confirmation, or asking questions that local context can answer.

## Good Defaults

- For low-risk internal fixes, inspect the code and proceed with the smallest scoped change.
- For user-facing behavior, preserve existing contracts unless the user explicitly wants a change.
- For Threadroot harness work, keep `.threadroot/` canonical and keep provider-native files opt-in.
