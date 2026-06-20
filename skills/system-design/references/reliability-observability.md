# Reliability And Observability

Use this reference when the system has queues, distributed calls, uptime expectations, or production operations.

## Reliability Questions

- What happens when each dependency is slow, unavailable, or returns bad data?
- What must be retried, deduplicated, idempotent, or dead-lettered?
- What data must never be lost, and what can be recomputed?
- What is the rollback path for schema, deploy, and config changes?

## Observability

- Track user-impacting symptoms first: latency, traffic, errors, and saturation.
- Add logs around decisions and failure boundaries, not every line of code.
- Emit metrics for queue depth, retry count, job age, dependency errors, and business-critical outcomes.
- Define an alert only when a human can take useful action.
