# Threadroot Integration Contract

This document is the handoff surface for the future website/cloud repo. The OSS CLI remains the source of truth. The website should generate prompts and commands that drive this CLI instead of reimplementing harness logic.

## Product Boundary

Threadroot OSS is the local adaptive agent capability harness:

- `.threadroot/` is canonical project state.
- The CLI initializes, validates, routes context, scans skills, and exposes MCP.
- MCP exposes the same local harness to agent clients.
- Skills, tools, connections, memory, and policy execute locally.
- No secrets are stored in the repo.

The website/cloud repo can add:

- a polished prompt/command generator
- account login and repo/project bindings
- hosted skill/tool/connection authoring assistance
- optional cloud-saved project preferences
- future sync of approved harness objects into a local repo

The website/cloud repo must not bypass the local CLI trust model for execution.

## Website Inputs

Ask only for high-signal details:

- Project state: `new`, `existing`, or `existing-with-agent-files`.
- Primary agent/provider: `codex`, `claude`, `cursor`, `copilot`, `gemini`, `windsurf`, `antigravity`, `opencode`, or `all`.
- IDE/editor: VS Code, Cursor, terminal-only, other.
- Project profile: `nextjs`, `vite-react`, `fastapi`, `python-cli`, `node-cli`, `dbt`, or `empty`.
- Initial task: short natural language.
- Cloud/tooling needs: GitHub, AWS, Azure, GCP, Snowflake, dbt, Docker, Kubernetes, Vercel, none.
- Project clutter preference: local-only default, optional provider exposure.
- MCP preference: configure MCP now or skip.
- Automation consent: ask whether safe low-risk capability creation is approved for this project.

## Prompt-to-CLI Mapping

Prefer one bootstrap command plus verification:

```bash
threadroot bootstrap --yes \
  --agent <agent-or-all> \
  --profile <profile> \
  --task "<initial task>" \
  --mcp \
  --json
```

For a blank repo:

```bash
threadroot bootstrap --yes --no-import --profile empty --task "start this project" --json
```

For an existing repo, let Threadroot import useful existing agent/vendor context:

```bash
threadroot bootstrap --yes --profile <profile> --task "<task>" --json
```

If the user grants safe automation once for the project:

```bash
threadroot automation approve --json
```

Verification:

```bash
threadroot doctor --json
threadroot status --json
threadroot start "<task>" --json
threadroot mcp check --json
```

Success message:

```text
Success: Threadroot is ready. Run threadroot start "<task>" for future sessions.
```

Provider-native project files stay opt-in:

```bash
threadroot expose <agent>
threadroot skills expose <name-or-all> --agent <agent-or-universal>
```

## Default Harness Model

Every initialized project starts with four seed skills:

- `find-skills`
- `create-skill`
- `create-tool`
- `create-connection`

The website should describe these as adaptive capabilities, not a bundled library. Agents should:

1. Start with `threadroot start "<task>"`.
2. Use installed skills when relevant.
3. Search with `threadroot skills find "<query>"` when no installed skill fits.
4. Install through `threadroot skills add <source> --skill <name>`.
5. Create a project-specific skill under `.threadroot/skills/` when no good external skill exists.
6. Create tools/connections only through Threadroot commands.

## External Skill Mapping

Search:

```bash
threadroot skills find "optimize website performance" --json
```

Install:

```bash
threadroot skills add <source> --skill <name> --json
```

Examples:

```bash
threadroot skills add https://www.skills.sh/vercel-labs/skills/find-skills --json
threadroot skills add skills:anthropics/skills/skill-creator --json
threadroot skills add addyosmani/agent-skills --skill <name> --json
```

If a source contains multiple skills, the CLI returns `needsSelection: true` and candidate commands. Prefer named reruns:

```bash
threadroot skills add <source> --skill <candidate-name> --json
```

Use `--path` only when duplicate skill names make names ambiguous.

Security UX:

- Show scan risk and findings from `skills add`, `skills inspect`, or `skills scan`.
- Show Snyk Agent Scan status when available.
- Offer strict mode with `--require-snyk`; offer `--no-snyk` for local/offline testing.
- Tell users Threadroot detects risk signals but does not certify third-party skills.
- Ask users to inspect medium/high-risk skills before `threadroot skills trust <name>`.
- Never store skill secrets or provider credentials in prompts or `.threadroot/`.

## JSON Surfaces

The website/cloud repo should call these instead of scraping text:

```bash
threadroot bootstrap --json
threadroot start "<task>" --json
threadroot status --json
threadroot doctor --json
threadroot context "<task>" --json
threadroot mcp check --json
threadroot mcp setup --json
threadroot automation status --json
threadroot automation approve --json
threadroot skills find "<query>" --json
threadroot skills list --json
threadroot skills inspect <path> --json
threadroot skills scan <path> --json
threadroot skills add <source> --json
threadroot skills trust <name> --json
threadroot skills expose <name-or-all> --agent <agent-or-universal> --json
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
- `threadroot bootstrap --yes --json` initializes a temp repo.
- Initialized repos contain exactly the four seed skills by default.
- `threadroot doctor --json` reports `ok: true` or actionable findings.
- Skill installs write `.threadroot/lock.json` provenance.
- MCP check verifies the local stdio server.
- README and generated prompts reference only real commands.
