# Contributing

Threadroot is a local-first AI agent harness compiler. Contributions should make the repo more trustworthy, easier to install, or more useful to coding agents without adding hosted/cloud assumptions to the OSS core.

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Before opening a PR, run:

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

Release-facing changes should update:

- `README.md` for user-facing behavior.
- `RELEASE.md` for publish process changes.
- `SECURITY.md` for trust-model changes.
- `CHANGELOG.md` for notable user-visible changes.
