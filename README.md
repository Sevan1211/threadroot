# Threadroot

Threadroot is **git for your AI agent harness**: you author skills, rules, tools, and
memory once in a canonical `.threadroot/` directory, and Threadroot compiles them into
every vendor format (AGENTS.md, Claude, Copilot, Cursor) so your agents stay in sync.

It is local-first: a `tr` CLI for humans and CI, plus a local MCP server that exposes the
same harness to coding agents. V1 does not require a cloud account, API key, or hosted
service.

```bash
pnpm install
pnpm build
node dist/index.js --help
```

## Quick start

```bash
tr init                 # detect the repo, scaffold a harness, import existing
                        # vendor files once, and compile
tr status               # authored objects vs compiled outputs, with drift
tr context "write tests" # task-relevant skills, rules, tools, and memory
tr doctor               # health check for harness validity, drift, MCP hints, tool trust
tr diff                 # line diff between canonical sources and vendor files
```

`threadroot` is the full name; `tr` is the short alias.

## CLI surface

```bash
tr init [--force] [--no-import] [--profile <p>] [--adapters <list>]
tr status
tr diff
tr doctor
tr compile [--adapter <agents|claude|copilot|cursor>]
tr context "<task>"               # assemble the task-relevant harness slice
tr run <tool> [--input k=v ...] [-y]
tr install <source> [--kind skill|tool|rule|connection] [--path <p>] [--user]
tr remember "<note>" [--type project|current-focus|handoff|pitfalls]
tr memory read <type>
tr memory append <type> "<note>"
tr skills list | validate [--path <path>]
tr skills inspect <path>
tr tools list | detect | check
tr tools add <name> --description "<text>" [--run "<cmd>"]
tr tools create --from-command "<cmd>"
tr connections list | check
tr connections add <name> --provider <p> --command <cmd>
tr packs list | inspect <pack> | validate <pack> | install <pack>
tr mcp                            # run the local MCP server (stdio)
tr mcp setup [--write]            # wire MCP into agents
```

## The harness (`.threadroot/`)

The canonical, vendor-neutral source of truth:

```
.threadroot/
  harness.yaml          # manifest: name, profile, adapters, tools.allow
  skills/<name>/SKILL.md # modern folder skills with optional references/scripts/assets
  skills/*.md           # legacy/simple single-file skills are still supported
  rules/*.md            # always-on rules (optional applyTo glob)
  tools/*.yaml          # executable tool manifests (allow-listed)
  connections/*.yaml    # local CLI bridges used by connection-aware tools
  memory/*.md           # durable, typed project memory
  lock.json             # provenance for installed objects (commit SHA + integrity)
```

`tr compile` turns the harness into the big-four vendor formats. Hand-authored prose in a
vendor file is preserved; Threadroot only owns the block it marks as generated.

## Built-in content

`tr init` seeds a useful harness on an empty repo:

- **Starter skills:** system-design, build-skill, build-tool, code-review, security-review,
  add-test, debug-failure, write-docs, conventional-commits.
- **Starter tools:** wrapped from the repo's detected command surface (scripts, Make/just),
  auto-added to `tools.allow`.
- **Profile presets:** node-cli, web, python, etc. (detected by the scanner).
- **Adapters:** agents, claude, copilot, cursor enabled by default.

Modern skills use the Agent Skills-style folder shape:

```text
.threadroot/skills/system-design/
  SKILL.md
  references/
  scripts/
  assets/
  evals/triggers.json
```

`SKILL.md` should have a clear `description` that says what the skill does and when an
agent should use it. Keep the body procedural and move long details into `references/`.
Use `tr skills validate` to catch naming, trigger-description, broken links, missing
references, eval coverage, and progressive-disclosure issues. Use `tr skills inspect
<path>` before trusting installed skills; it prints the skill metadata plus references,
scripts, assets, evals, and declared allowed tools.

This repository also includes a public curated pack under `skills/`. Validate it with:

```bash
tr skills validate --path skills
tr skills inspect skills/system-design
```

## Tools and connections

Tools are explicit, testable agent capabilities. They can declare `risk`, `confirm`,
`connection`, inputs, and an optional finite `healthcheck`.

```bash
tr tools create --from-command "pnpm test" --description "Run the test suite"
tr tools check
tr run test
```

Connections wrap locally authenticated CLIs without storing secrets:

```bash
tr connections add aws-dev \
  --provider aws \
  --command aws \
  --profile dev \
  --risk high \
  --confirm \
  --healthcheck "aws sts get-caller-identity --profile dev"
tr connections check
```

Use official CLIs for auth (`gh auth login`, `aws configure sso`, `az login`, Snowflake
CLI config). Threadroot records what the agent may use; it does not become a secret vault.

## Capability packs

Packs install curated sets of skills, tools, rules, and connections:

```bash
tr packs list
tr packs inspect typescript-node
tr packs install testing
```

Built-in v1 packs: `typescript-node`, `react-app`, `python`, `testing`, `code-review`,
`security-review`, and `system-design`.

## Installing objects

```bash
tr install github:Sevan1211/threadroot/skills/system-design@main --kind skill
tr install github:Sevan1211/threadroot/skills/build-tool@main --kind skill
tr install github:owner/repo/skills/code-review.md@v1
tr install ./local/tools/echo.yaml --kind tool
```

Fetches shell out to `git` (shallow clone, no `.git` kept, never runs repo scripts), pin the
resolved commit SHA plus a `sha256:` integrity digest into `lock.json`, and mark installed
tools **untrusted** until you add them to `tools.allow`. Skill directories are copied as a
folder and recorded with a deterministic tree hash. External skills that include scripts
or declare allowed tools are surfaced by `tr doctor` as trust warnings so humans and agents
inspect them before use.

## MCP

Threadroot runs a local MCP server over stdio that exposes the harness to agents:

```bash
tr mcp
tr mcp setup            # print config snippets and a pasteable agent bootstrap prompt
tr mcp setup --write    # write project-local MCP config for supported agents
```

Tools: `context`, `skills_list`, `skills_get`, `tools_list`, `tools_check`, `tools_run`,
`tools_create`, `tools_detect`, `connections_list`, `connections_check`, `memory_read`,
`memory_append`, `status`, `doctor`.

`tr mcp setup` also prints a copy/paste agent prompt that follows the real CLI flow:
check availability, run `threadroot init` when needed, inspect `status`, review `diff` on
drift, and optionally write MCP config.

## Profiles

`nextjs`, `vite-react`, `fastapi`, `python-cli`, `node-cli`, `dbt`, `empty`.

## Development

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Smoke test this checkout

Use a temporary copy when testing generated files against Threadroot itself:

```bash
pnpm install
pnpm build
THREADROOT_ROOT="$(pwd)"
TMP_REPO="$(mktemp -d /tmp/threadroot-smoke.XXXXXX)"
rsync -a --exclude .git --exclude node_modules --exclude dist ./ "$TMP_REPO/"
cd "$TMP_REPO"
node "$THREADROOT_ROOT/dist/index.js" init --no-import
node "$THREADROOT_ROOT/dist/index.js" status
node "$THREADROOT_ROOT/dist/index.js" context "write tests"
node "$THREADROOT_ROOT/dist/index.js" skills validate
node "$THREADROOT_ROOT/dist/index.js" skills validate --path skills
node "$THREADROOT_ROOT/dist/index.js" skills inspect skills/system-design
node "$THREADROOT_ROOT/dist/index.js" packs list
node "$THREADROOT_ROOT/dist/index.js" packs inspect testing
node "$THREADROOT_ROOT/dist/index.js" tools create --from-command "node --version" --description "Check Node.js"
node "$THREADROOT_ROOT/dist/index.js" tools check
node "$THREADROOT_ROOT/dist/index.js" connections add node-local --provider node --command node --risk low --healthcheck "node --version"
node "$THREADROOT_ROOT/dist/index.js" connections check
node "$THREADROOT_ROOT/dist/index.js" compile
node "$THREADROOT_ROOT/dist/index.js" diff
node "$THREADROOT_ROOT/dist/index.js" doctor
find .threadroot -maxdepth 2 -type f | sort
```
