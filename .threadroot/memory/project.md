# Project

- What it is: Threadroot is a local-first AI agent capability harness compiler. It keeps project skills, tools, connections, memory, repo maps, policy, and provenance under `.threadroot/` and exposes them through CLI and MCP.
- Product direction: OSS core stays local, portable, secure, and version-controlled. Website/cloud work is planned separately for prompt generation, hosted authoring, project sync, auth, and future marketplace features.
- Key technologies: TypeScript ESM CLI, Commander, YAML/Zod-style validation, Vitest tests, tsup build, npm package distribution.
- Current release baseline: 0.1.7 adds self-use harness support, repo maps, compact codebase navigation, MCP repo search/read/map tools, and five seed skills: `threadroot`, `find-skills`, `create-skill`, `create-tool`, `create-connection`.
- How to run it: use `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm package:smoke`, `pnpm pack:check`, or `pnpm release:check`.
- Development rule: prefer `threadroot start "<task>"`, refresh stale repo maps with `threadroot map --write`, load full skills only when task-relevant, and keep provider-native files opt-in.
