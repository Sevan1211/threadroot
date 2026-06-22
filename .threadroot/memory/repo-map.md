<!-- threadroot:repo-map-v1 tree-hash=fded0700af15fc434c5b12ea1fd5077f2639885e0e8e4f2eb7e48c60e49457d6 generated=2026-06-22T04:34:44.653Z -->
# Repo Map

Compact navigation context for agents. Use this map to choose targeted file reads instead of loading the whole repository.

## Overview

- Profile: node-cli
- Files scanned: 117
- Tree hash: fded0700af15fc434c5b12ea1fd5077f2639885e0e8e4f2eb7e48c60e49457d6

## Command Surface

- `build`: `pnpm build` - Detected package script: tsup src/index.ts --format esm --dts --clean
- `dev`: `pnpm dev` - Detected package script: tsx src/index.ts
- `prepack`: `pnpm prepack` - Detected package script: pnpm build
- `prepublishOnly`: `pnpm prepublishOnly` - Detected package script: pnpm typecheck && pnpm lint && pnpm test
- `pack:check`: `pnpm pack:check` - Detected package script: npm --cache /tmp/threadroot-npm-cache pack --dry-run
- `package:smoke`: `pnpm package:smoke` - Detected package script: node scripts/package-smoke.mjs
- `release:check`: `pnpm release:check` - Detected package script: pnpm typecheck && pnpm lint && pnpm test && pnpm pack:check && pnpm package:smoke
- `test`: `pnpm test` - Detected package script: vitest run
- `typecheck`: `pnpm typecheck` - Detected package script: tsc --noEmit
- `lint`: `pnpm lint` - Detected package script: eslint .

## Important Config Files

- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- [package.json](../../package.json)
- [pnpm-lock.yaml](../../pnpm-lock.yaml)
- [tsconfig.json](../../tsconfig.json)

## Primary Directories

- [src/](../../src/) - 83 file(s)
- [test/](../../test/) - 20 file(s)
- [.github/](../../.github/) - 1 file(s)
- [scripts/](../../scripts/) - 1 file(s)

## Source Areas

- [src/](../../src/) - 83 file(s)
- [test/](../../test/) - 20 file(s)

## Likely Entrypoints

- [src/cli.ts](../../src/cli.ts)
- [src/index.ts](../../src/index.ts)

## Tests

- [test/bootstrap.test.ts](../../test/bootstrap.test.ts)
- [test/cli-smoke.test.ts](../../test/cli-smoke.test.ts)
- [test/compile.test.ts](../../test/compile.test.ts)
- [test/connections.test.ts](../../test/connections.test.ts)
- [test/doctor.test.ts](../../test/doctor.test.ts)
- [test/hardening.test.ts](../../test/hardening.test.ts)
- [test/harness-schema.test.ts](../../test/harness-schema.test.ts)
- [test/harness-store.test.ts](../../test/harness-store.test.ts)
- [test/harness-surface.test.ts](../../test/harness-surface.test.ts)
- [test/init.test.ts](../../test/init.test.ts)
- [test/install.test.ts](../../test/install.test.ts)
- [test/mcp-check.test.ts](../../test/mcp-check.test.ts)
- [test/mcp-server.test.ts](../../test/mcp-server.test.ts)
- [test/mcp-setup.test.ts](../../test/mcp-setup.test.ts)
- [test/repo-map.test.ts](../../test/repo-map.test.ts)
- [test/setup.test.ts](../../test/setup.test.ts)
- [test/skills-find.test.ts](../../test/skills-find.test.ts)
- [test/skills-install.test.ts](../../test/skills-install.test.ts)
- [test/skills.test.ts](../../test/skills.test.ts)
- [test/tools.test.ts](../../test/tools.test.ts)

## Agent Notes

- Start with `threadroot start "<task>"` for task context.
- Use this map to pick likely files, then search/read only what is relevant.
- Use MCP `repo_search` and `repo_read` when available; otherwise use `rg` and targeted file reads.
- Do not load generated, dependency, build, cache, or secret files unless the user explicitly asks.
