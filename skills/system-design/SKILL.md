---
name: system-design
description: Use when designing, reviewing, or changing software architecture, APIs, data models, scaling strategy, reliability, observability, security, deployment, or technical tradeoffs for a new or existing system.
scope: project
tags:
  - architecture
  - system-design
  - planning
---

# System Design

Use this skill before major implementation when architecture decisions could be expensive to reverse.

## Workflow

1. Clarify the product goal, users, constraints, traffic, data sensitivity, integration points, and deployment target.
2. Separate hard requirements, soft preferences, non-goals, and unknowns.
3. Propose the simplest architecture that satisfies the known constraints before adding scale patterns.
4. Define API boundaries, data ownership, background jobs, and external dependencies.
5. Identify failure modes, abuse cases, operational risks, rollback strategy, and observability.
6. Compare tradeoffs explicitly: reliability, security, performance, cost, operability, and delivery speed.
7. Produce a concrete implementation plan and validation plan.

## Output Shape

Return concise sections: Goal, Requirements, Non-goals, Constraints, Proposed Architecture, Data Model, API Surface, Background Jobs, Failure Modes, Security, Observability, Cost/Scale Assumptions, Tradeoffs, Implementation Plan, Validation Plan.

## Reference Loading

- Read `references/architecture-checklist.md` for architecture review prompts.
- Read `references/reliability-observability.md` when uptime, incidents, metrics, queues, or distributed behavior matter.
- Read `references/api-data-design.md` when designing public APIs, schemas, migrations, or integration boundaries.
