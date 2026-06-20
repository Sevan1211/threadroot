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
tr install <source> [--kind skill|tool|rule] [--path <p>] [--user]
tr remember "<note>" [--type project|current-focus|handoff|pitfalls]
tr memory read <type>
tr memory append <type> "<note>"
tr tools list | detect | add <name> --description "<text>" [--run "<cmd>"]
tr mcp                            # run the local MCP server (stdio)
tr mcp setup [--write]            # wire MCP into agents
```

## The harness (`.threadroot/`)

The canonical, vendor-neutral source of truth:

```
.threadroot/
  harness.yaml          # manifest: name, profile, adapters, tools.allow
  skills/*.md           # when-to-use guidance with frontmatter
  rules/*.md            # always-on rules (optional applyTo glob)
  tools/*.yaml          # executable tool manifests (allow-listed)
  memory/*.md           # durable, typed project memory
  lock.json             # provenance for installed objects (commit SHA + integrity)
```

`tr compile` turns the harness into the big-four vendor formats. Hand-authored prose in a
vendor file is preserved; Threadroot only owns the block it marks as generated.

## Built-in content

`tr init` seeds a useful harness on an empty repo:

- **Starter skills:** conventional-commits, code-review, add-test, write-docs, debug-failure.
- **Starter tools:** wrapped from the repo's detected command surface (scripts, Make/just),
  auto-added to `tools.allow`.
- **Profile presets:** node-cli, web, python, etc. (detected by the scanner).
- **Adapters:** agents, claude, copilot, cursor enabled by default.

## Installing objects

```bash
tr install github:owner/repo/skills/code-review.md@v1
tr install ./local/tools/echo.yaml --kind tool
```

Fetches shell out to `git` (shallow clone, no `.git` kept, never runs repo scripts), pin the
resolved commit SHA plus a `sha256:` integrity digest into `lock.json`, and mark installed
tools **untrusted** until you add them to `tools.allow`.

## MCP

Threadroot runs a local MCP server over stdio that exposes the harness to agents:

```bash
tr mcp
tr mcp setup            # print config snippets and a pasteable agent bootstrap prompt
tr mcp setup --write    # write project-local MCP config for supported agents
```

Tools: `context`, `skills_list`, `skills_get`, `tools_list`, `tools_run`, `tools_create`,
`tools_detect`, `memory_read`, `memory_append`, `status`, `doctor`.

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
node "$THREADROOT_ROOT/dist/index.js" diff
node "$THREADROOT_ROOT/dist/index.js" doctor
find .threadroot -maxdepth 2 -type f | sort
```
