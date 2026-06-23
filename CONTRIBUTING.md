# Contributing

Threadroot is open source, but the product direction is intentionally tight while the core CLI, trust model, and agent workflow settle.

## Project Policy

- Issues: open.
- Bug reports: open.
- Feature requests: open.
- Pull requests: welcome, but not guaranteed to be accepted.
- The maintainer decides final product direction, scope, and release timing.

High-signal reports are most useful when they include the repo shape, agent/provider, command output, expected behavior, and actual behavior. Feature requests are most useful when they describe a painful agent workflow rather than a broad platform idea.

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Before opening a PR, run the release gate when possible:

```bash
pnpm release:check
```

## Product principles

- Keep the OSS core local-first.
- Prefer explicit files over hidden state.
- Treat tools and connections as security-sensitive.
- Keep generated agent context compact and inspectable.
- Avoid adding cloud, account, or hosted registry requirements to v1 behavior.

## Skills

Validate seed skills after changes:

```bash
threadroot skills validate --path skills
```

Good skills use compact `SKILL.md` instructions, linked references only when needed, and clear trigger descriptions. Good tools are small wrappers around commands the repo already trusts.

## Release changes

Release-facing changes may need updates to:

- `README.md` for user-facing behavior.
- `RELEASE.md` for publish process changes.
- `SECURITY.md` for trust-model changes.
- `CHANGELOG.md` for notable user-visible changes.
