# API And Data Design

Use this reference when defining interfaces, schemas, persistence, or migrations.

## API Shape

- Define request/response types, auth, validation, pagination, idempotency, and error format.
- Keep external APIs stable and version only when compatibility requires it.
- Prefer explicit domain names over transport/framework names.

## Data Shape

- Identify source-of-truth tables/entities and derived/cache data.
- Name uniqueness constraints, indexes, retention, deletion, and privacy requirements.
- Plan migrations as reversible or forward-fixable steps.
