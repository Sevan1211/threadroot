# Threadroot Integration Contract

This document is the handoff surface for the future website/cloud repo. The OSS CLI is the local execution authority. The website should generate prompts and commands that drive this CLI instead of reimplementing harness logic.

## Product Boundary

Threadroot OSS is the local repo intelligence runtime for coding agents:

- `.threadroot/` is the only default project artifact.
- `.threadroot/` is local-only in `0.2.1` and should not be committed to git.
- The CLI initializes, validates, indexes repo context, routes task packets, imports existing provider files non-destructively, scans skills, evaluates context quality, applies guarded repo-local trace lessons, and serves MCP.
- MCP exposes the same local harness to agent clients.
- Skills, tools, connections, memory, web fetch, and policy execute locally.
- No secrets are stored in the repo.

The future website/cloud repo can add:

- polished prompt/command generation
- account login and repo/project bindings
- hosted skill/tool/connection authoring assistance
- selected `.threadroot/` sync/versioning
- team-approved context snapshots and provenance
- future marketplace/distribution flows

The cloud must not bypass the local CLI trust model for execution.

## Website Inputs

Ask only for high-signal details:

- Project state: `new`, `existing`, or `existing-with-agent-files`.
- Primary agent/provider: `codex`, `claude`, `cursor`, `vscode`, `copilot`, `gemini`, `windsurf`, `opencode`, `antigravity`, or `all`.
- IDE/editor: VS Code, Cursor, terminal-only, other.
- Project profile: `nextjs`, `vite-react`, `fastapi`, `python-cli`, `node-cli`, `dbt`, or `empty`.
- Initial task: short natural language.
- Cloud/tooling needs: GitHub, AWS, Azure, GCP, Snowflake, dbt, Docker, Kubernetes, Vercel, none.
- Provider-file preference: default hidden/local, or explicit visible project files.
- Automation consent: ask whether safe low-risk capability creation is approved for this project.

## Prompt-to-CLI Mapping

Prefer the 0.2.1 public path:

```bash
threadroot init --profile <profile> --json
threadroot connect <agent> --refresh-skill --json
threadroot task "<initial task>" --json
```

For a blank repo:

```bash
threadroot init --no-import --profile empty --json
threadroot connect <agent> --json
```

For an existing repo with provider files:

```bash
threadroot init --profile <profile> --json
threadroot import --json
```

Provider-native project files stay opt-in:

```bash
threadroot connect <agent> --project-files --json
```

Verification:

```bash
threadroot task "<task>" --json
threadroot trace start "<task>" --json
threadroot trace finish --status partial --json
threadroot eval traces --latest --json
threadroot improve latest --json
threadroot providers --json
threadroot loop start "<goal>" --agent <agent> --time 60m --max-iterations 6 --json
threadroot loop run --iterations 1 --require "pnpm typecheck" --json
threadroot index --status --json
threadroot eval context --json
threadroot map --check --json
threadroot doctor --json
threadroot status --json
threadroot mcp check --json
```

Success message:

```text
Success: Threadroot is ready. Run threadroot task "<task>" for future sessions.
```

## Default Harness Model

Every initialized project starts with seven seed skills:

- `threadroot`
- `find-skills`
- `create-skill`
- `create-tool`
- `create-connection`
- `closing-loop-research`
- `loop-automation-engineering`

The website should describe these as adaptive procedures, not a bundled library. Agents should:

1. Start with `threadroot task "<task>"`.
2. Read the task packet's first files before broad repo exploration.
3. Use `threadroot refresh --json` for explicit preflight when a UI, hook, or hosted workflow wants fresh map/index state before asking for a task packet.
4. Use installed skills only when relevant.
5. Search with `threadroot skills find "<query>"` when no installed skill fits and a reusable procedure is needed.
6. Install through `threadroot skills ingest <source> --skill <name>`.
7. Create a project-specific skill under `.threadroot/skills/` when no good external skill exists.
8. Create tools/connections only through Threadroot commands.

## JSON Surfaces

The website/cloud repo should call these instead of scraping text:

```bash
threadroot init --json
threadroot connect <agent> --json
threadroot task "<task>" --json
threadroot refresh --json
threadroot index --status --json
threadroot eval context --json
threadroot eval traces --json
threadroot embeddings status --json
threadroot providers --json
threadroot import --json
threadroot status --json
threadroot doctor --json
threadroot map --check --json
threadroot mcp check --json
threadroot trace start "<task>" --json
threadroot trace event note --message "<note>" --json
threadroot trace finish --status partial --json
threadroot trace latest --json
threadroot improve latest --json
threadroot loop start "<goal>" --json
threadroot loop next --json
threadroot loop run --json
threadroot loop report --json
threadroot loop finish --json
threadroot web status --json
threadroot web fetch <url> --json
threadroot automation status --json
threadroot automation approve --json
threadroot memory gc --json
threadroot skills match "<task>" --json
threadroot skills find "<query>" --json
threadroot skills list --json
threadroot skills inspect <path> --json
threadroot skills scan <path> --json
threadroot skills ingest <source> --json
threadroot skills trust <name> --json
threadroot skills validate --json
threadroot tools list --json
threadroot tools detect --json
threadroot tools create --json
threadroot tools check --json
threadroot run <tool> --brief --json
threadroot connections discover --json
threadroot connections list --json
threadroot connections add <name> --provider <provider> --command <command> --json
threadroot connections check --json
```

Until `1.0`, JSON shapes are alpha contracts. Parse only fields you use and tolerate extra fields.

## External Skill Mapping

Search:

```bash
threadroot skills find "optimize website performance" --json
```

Install:

```bash
threadroot skills ingest <source> --skill <name> --json
```

Security UX:

- Show scan risk and findings from `skills ingest`, `skills inspect`, or `skills scan`.
- Show Snyk Agent Scan status when available.
- Offer strict mode with `--require-snyk`; offer `--no-snyk` for local/offline testing.
- Tell users Threadroot detects risk signals but does not certify third-party skills.
- Ask users to inspect medium/high-risk skills before `threadroot skills trust <name>`.
- Never store skill secrets or provider credentials in prompts or `.threadroot/`.

## Tools And Connections

Tool creation stays local and explicit:

```bash
threadroot tools create \
  --from-command "pnpm test" \
  --description "Run the test suite" \
  --risk low \
  --healthcheck "pnpm --version" \
  --json
```

Connection creation wraps official local CLIs only:

```bash
threadroot connections discover --json
threadroot connections add aws-dev \
  --provider aws \
  --command aws \
  --profile dev \
  --risk high \
  --confirm \
  --allow "sts get-caller-identity,s3 ls,logs tail" \
  --deny "delete,terminate,iam" \
  --healthcheck "aws sts get-caller-identity --profile dev" \
  --json
```

Rules:

- Connections must not store credentials.
- Users authenticate through official CLIs such as `gh`, `aws`, `az`, `gcloud`, or Snowflake CLI.
- Prefer `threadroot connections discover --json` before asking users to hand-author manifests; it reports local CLI candidates, risk, healthcheck, allow/deny fragments, rationale, and the exact add command.
- MCP cannot self-confirm risky tool execution.
- MCP can create low-risk tool/connection manifests only after `threadroot automation approve`.
- High-risk, destructive, secret-bearing, or cloud-mutating actions require local human review.

## Context And Indexing

The website should treat `threadroot task "<task>" --json` as the canonical context API. The task packet includes ranked files and tests, symbol outlines, selected snippets, likely commands, recommended skills without full skill bodies, relevant memory, warnings, index status, token estimate, omitted sections, and optional debug-ranking evidence.

`threadroot index --status --json` reports whether Threadroot is using SQLite/FTS5 or degraded fallback. Missing index is acceptable before the first task. Stale or degraded index should be shown as a context-quality warning, not a security failure.

`threadroot eval context --json` is the local quality gate for routing changes. Built-in cases that do not apply to the current repo are skipped and reported in `skippedCases`. Cloud dashboards can display recall, precision, MRR, nDCG, irrelevant-file, command-hit, skill-hit, skipped-case, and token metrics.

Built-in local hashing embeddings are always available through the repo index and require no keys, network, or upload. Do not ask for API keys during onboarding unless the user explicitly wants an external embedding provider and accepts upload/cost implications.

## Loop Automation

Loop mode is local-first agent orchestration. The website should generate commands that keep Threadroot as the controller and the user's provider CLI as the worker:

```bash
threadroot loop start "<goal>" --agent codex --time 60m --max-iterations 6 --risk low --json
threadroot providers --json
threadroot loop run \
  --iterations 1 \
  --require "pnpm typecheck" \
  --require "pnpm test" \
  --json
threadroot loop report --json
```

Rules:

- Do not require a Threadroot API key or hosted model for loop mode.
- Prefer provider subscriptions the user already has, such as Codex or Claude Code.
- Use `threadroot providers --json` first to detect which CLIs are installed, which providers are MCP-first, and which default runner is safe on the current machine.
- Treat Codex and Claude Code as default automated runner targets when their CLIs are available; treat Cursor as MCP-first unless the user supplies a verified `--agent-command`.
- Use `--agent-command` and `--agent-adapter codex|claude|custom` when the provider binary path is not the default command.
- Treat `improve latest` output as ranked candidates plus an `applied` report. Guarded repo-local routing/eval/validation-skill lessons may apply automatically; memory, new tools, connections, and higher-risk changes still require local policy/user approval.
- Show `reportPath`, `finalReportPath`, provider output paths, compact output paths, verification output paths, stopped reason, compression metrics, and trace-eval metrics.
- Stop or ask for review on failed verification, timeouts, high-risk tools, cloud mutation, deploys, or secrets.

## Web

Threadroot-native web support in `0.2.1` is known-URL fetch:

```bash
threadroot web status --json
threadroot web fetch https://example.com/docs --max-tokens 4000 --json
```

General search is provider-native or delegated to a configured search MCP server until Threadroot has a native search provider.

## Future Cloud/Auth CLI Contract

Do not implement these in OSS until the cloud repo exists, but reserve the shape:

```bash
threadroot login
threadroot auth status --json
threadroot link --repo owner/name --project <project-id>
threadroot sync status --json
threadroot sync pull --json
threadroot sync push --json
threadroot sync apply --from cloud --json
```

Potential future files:

```text
.threadroot/cloud.json       # repo binding, no secrets
~/.threadroot/auth.json      # local auth cache or pointer, never committed
```

The auth flow should use device/browser login and store tokens outside the repository. Repo sync should operate on harness objects, not source code, and should always show status/diff before applying remote changes.

## Website Readiness Checklist

The OSS core is ready for website work when:

- `pnpm release:check` passes.
- `threadroot init --json` initializes a temp repo with no visible provider files.
- `threadroot connect <agent> --json` writes only `.threadroot/providers/<agent>/connection.json` by default.
- `threadroot providers --json` reports provider CLI availability, MCP setup, default runner status, event capture, and compression guidance.
- Initialized repos contain exactly the seven seed skills by default.
- `threadroot task "<task>" --json` returns ranked files, symbols, snippets, commands, skills, memory, index status, and token estimates.
- `threadroot doctor --json` reports `ok: true` or actionable findings.
- Skill installs write `.threadroot/lock.json` provenance.
- MCP check verifies the local stdio server where configured.
- Loop smoke verifies trace, eval, improve, loop report, and required verification command output.
- README and generated prompts reference only real commands.
