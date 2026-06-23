# Threadroot Integration Contract

This document is the handoff surface for the future website/cloud repo. The OSS CLI is the local execution authority. The website should generate prompts and commands that drive this CLI instead of reimplementing harness logic.

## Product Boundary

Threadroot OSS is the local context router for coding agents:

- `.threadroot/` is the only default project artifact.
- `.threadroot/` is local-only in `0.1.8` and should not be committed to git.
- The CLI initializes, validates, routes context, imports existing provider files non-destructively, scans skills, and exposes MCP.
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

Prefer the 0.1.8 public path:

```bash
threadroot init --profile <profile> --json
threadroot connect <agent> --json
threadroot start "<initial task>" --json
threadroot working-set "<initial task>" --json
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
threadroot expose <agent>
threadroot skills expose <name-or-all> --agent <agent-or-universal>
```

Verification:

```bash
threadroot working-set "<task>" --json
threadroot map --check --json
threadroot doctor --json
threadroot status --json
threadroot mcp check --json
```

Success message:

```text
Success: Threadroot is ready. Run threadroot start "<task>" and threadroot working-set "<task>" for future sessions.
```

## Default Harness Model

Every initialized project starts with five seed skills:

- `threadroot`
- `find-skills`
- `create-skill`
- `create-tool`
- `create-connection`

The website should describe these as adaptive procedures, not a bundled library. Agents should:

1. Start with `threadroot start "<task>"`.
2. Ask for `threadroot working-set "<task>"` before broad reads.
3. Refresh stale codebase navigation with `threadroot map --write`.
4. Use installed skills only when relevant.
5. Search with `threadroot skills find "<query>"` when no installed skill fits and a reusable procedure is needed.
6. Install through `threadroot skills add <source> --skill <name>`.
7. Create a project-specific skill under `.threadroot/skills/` when no good external skill exists.
8. Create tools/connections only through Threadroot commands.

## JSON Surfaces

The website/cloud repo should call these instead of scraping text:

```bash
threadroot init --json
threadroot connect <agent> --json
threadroot start "<task>" --json
threadroot working-set "<task>" --json
threadroot import --json
threadroot status --json
threadroot doctor --json
threadroot context "<task>" --json
threadroot map --write --json
threadroot map --check --json
threadroot mcp check --json
threadroot web status --json
threadroot web fetch <url> --json
threadroot automation status --json
threadroot automation approve --json
threadroot skills match "<task>" --json
threadroot skills find "<query>" --json
threadroot skills list --json
threadroot skills inspect <path> --json
threadroot skills scan <path> --json
threadroot skills add <source> --json
threadroot skills trust <name> --json
threadroot skills validate --json
threadroot tools list --json
threadroot tools detect --json
threadroot tools create --json
threadroot tools check --json
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
threadroot skills add <source> --skill <name> --json
```

Security UX:

- Show scan risk and findings from `skills add`, `skills inspect`, or `skills scan`.
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
- MCP cannot self-confirm risky tool execution.
- MCP can create low-risk tool/connection manifests only after `threadroot automation approve`.
- High-risk, destructive, secret-bearing, or cloud-mutating actions require local human review.

## Web

Threadroot-native web support in `0.1.8` is known-URL fetch:

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
- Initialized repos contain exactly the five seed skills by default.
- `threadroot working-set "<task>" --json` returns ranked files and token estimates.
- `threadroot doctor --json` reports `ok: true` or actionable findings.
- Skill installs write `.threadroot/lock.json` provenance.
- MCP check verifies the local stdio server where configured.
- README and generated prompts reference only real commands.
