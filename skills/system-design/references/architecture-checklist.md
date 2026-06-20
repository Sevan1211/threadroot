# Architecture Checklist

Use this checklist to keep architecture useful and grounded.

## Product Fit

- Name the primary user and the job the system performs.
- State what must work on day one versus what can wait.
- Prefer a boring design when requirements are uncertain.

## Boundaries

- Define module/service ownership and data ownership.
- List synchronous calls, async jobs, external services, and human/manual steps.
- Avoid splitting services until ownership, scale, or deployment needs justify the split.

## Tradeoffs

- Explain why the chosen design is simpler or safer than alternatives.
- Call out which assumptions would force a redesign.
- Include migration and rollback paths for risky changes.

## Production Readiness

- Include authn/authz, secrets, rate limits, validation, logging, metrics, alerts, backups, and disaster recovery when relevant.
- Include a small validation plan: tests, load checks, security checks, smoke checks, and manual acceptance.
