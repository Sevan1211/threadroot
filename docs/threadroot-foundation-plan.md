# Threadroot 0.1.8 Foundation Plan

Date: 2026-06-22

Release target: `0.1.8` current package baseline is `0.1.7`. The user may call this the "1.8" release in conversation; in code and npm metadata this means `0.1.8` unless the versioning policy changes.

## Locked Product Decisions

Threadroot should become the local context and capability router for coding agents.

The first ICP is a solo, AI-heavy developer who uses multiple coding agents and wants faster onboarding, lower token cost, better accuracy, and better agent performance without turning every repo into a pile of provider-specific files.

The first five-minute promise:

> Stop paying your coding agent to rediscover your repo.

The product should make this path feel obvious:

```bash
threadroot init
threadroot connect <agent>
threadroot start "fix the auth bug"
```

Where `<agent>` can be any large provider Threadroot supports: Codex, Claude, Cursor, VS Code/Copilot, Gemini CLI, Windsurf, OpenCode, and later other MCP-capable tools.

Default project visibility rule:

- A user opening the project directory should see `.threadroot/` as the only new Threadroot artifact.
- Provider-specific files must either live under `.threadroot/` or be written to provider user/local/global config outside the project tree.
- Threadroot must not create top-level `AGENTS.md`, `CLAUDE.md`, `.codex/`, `.claude/`, `.cursor/`, `.vscode/`, `.github/copilot-instructions.md`, `.mcp.json`, or similar provider files by default.
- Top-level provider files are allowed only behind an explicit, scary-enough opt-in such as `--project-files` or `--visible-provider-files`.

Git policy:

- Nothing under `.threadroot/` should be committed for now.
- The future cloud platform may become the sync/version-control layer for `.threadroot/`, but git is not that layer in `0.1.8`.
- Default init should avoid editing root `.gitignore` when possible. In a git repo, prefer adding `.threadroot/` to `.git/info/exclude` so the only visible project artifact remains `.threadroot/`.
- Doctor should warn when `.threadroot/` is tracked or not ignored. It should no longer warn merely because the whole `.threadroot/` directory is ignored.

Feature stance:

- Context, skills, tools, connections, memory, provider connection, and web research are all important.
- They must be organized around the user's outcome, not presented as a framework taxonomy.
- Anything that does not improve onboarding speed, token cost, agent accuracy, or agent performance should be hidden, deferred, or cut.

## Product Shape

Threadroot has seven user-visible capability layers:

1. **Working Set**
   - The agent asks for task-specific context.
   - Threadroot returns ranked files, commands, tests, risks, relevant memory, likely skills, freshness, trust, and token estimates.
   - This is the hero primitive because it directly lowers waste and improves output.

2. **Memory**
   - Project facts, pitfalls, current focus, handoffs, and repo maps live under `.threadroot/`.
   - For `0.1.8`, all of it is local-only and git-ignored.
   - Future cloud sync can decide what becomes shared, reviewed, or versioned.

3. **Skills**
   - Skills are lazy procedures, not always-on facts.
   - Threadroot should route agents to skill metadata first and full bodies only when relevant.
   - Threadroot should help agents find, create, and suggest skills, but never auto-install external skills without scan/provenance and user review.

4. **Tools**
   - Tools are explicit, repeatable local commands with risk, confirmation, and healthchecks.
   - Tools should turn repeated agent shell behavior into inspectable project capabilities.

5. **Connections**
   - Connections wrap locally authenticated CLIs such as `gh`, `aws`, `gcloud`, `az`, `kubectl`, `vercel`, `dbt`, or `snow`.
   - They must never store credentials.
   - Connections are important but must not appear in first-run onboarding unless the task needs one.

6. **Provider Bridge**
   - `threadroot connect <agent>` makes the chosen agent able to use Threadroot.
   - The default path must use provider user/local/global config or provider CLIs.
   - Project-visible provider shims are legacy/advanced, not the default.

7. **Web Research**
   - Threadroot should expose whether web access is available.
   - `web_fetch(url)` should be the first Threadroot-native capability: open a known public URL, extract relevant text, cache with provenance, and return citations/source metadata.
   - General `web_search(query)` can be provider-native or delegated to a configured external MCP/search provider in `0.1.8`; Threadroot should not pretend it has native search if it does not.

## Source Ledger

Facts:

- MCP uses JSON-RPC and defines stdio and Streamable HTTP transports. Clients should support stdio when possible; stdio clients launch the server as a subprocess and the server must write only valid MCP messages to stdout.
- MCP Streamable HTTP servers need Origin validation, localhost binding for local servers, and authentication.
- MCP tools support input schemas, optional output schemas, annotations, and list-changed notifications.
- MCP resources support URI, name, MIME type, size, annotations such as audience, priority, and lastModified, plus custom schemes such as `threadroot://`.
- Codex reads `AGENTS.md` files before work, but its MCP configuration lives in `~/.codex/config.toml` by default and can also be project-scoped in `.codex/config.toml` for trusted projects.
- Claude Code supports MCP local, project, and user scopes. Project scope writes shareable `.mcp.json`; local and user scopes avoid project-visible provider files. Claude plugins can bundle MCP config.
- Claude skills load bodies only when used. Claude's docs explicitly distinguish skills from always-on memory/instructions: create a skill for repeated instructions, checklists, or multi-step procedures.
- VS Code can install MCP servers in a user profile or workspace; workspace install writes `.vscode/mcp.json`, while user profile config avoids project-visible files. VS Code also supports `code --add-mcp`.
- VS Code guidance recommends concise context, fresh docs, progressive context, separate sessions, token/cache inspection, avoiding context dumping, and disabling unneeded tools/MCP servers.
- GitHub Copilot repository instructions are automatically included when `.github/copilot-instructions.md` or related instruction files are used, which makes them powerful but also token-expensive and visible.
- OpenAI and Anthropic both expose web-search tools in their APIs, but availability varies by product surface, plan, admin setting, provider, and runtime.

Local evidence:

- `package.json` and `src/core/version.ts` are currently `0.1.7`.
- README still positions Threadroot as "skills, tools, connections, and memory" and says `.threadroot/` is version-controlled harness state. This is stale for the new `0.1.8` direction.
- README still teaches `threadroot bootstrap --yes --mcp` as the quick start. This should move to `init`, `connect`, `start`.
- Current CLI has `bootstrap`, `setup`, `expose`, and `mcp setup` surfaces that overlap and make the first-run story too complex.
- Current MCP server exposes tools only: context, repo map/search/read, skills, tools, connections, memory, status, and doctor.
- Current MCP check is Codex-centric.
- Current project MCP config writing targets `.vscode/mcp.json`, `.cursor/mcp.json`, and `.mcp.json`, which violates the new default visibility rule.
- Current repo map hashes file paths, not file contents, so content-only changes can leave maps falsely fresh.
- Current `repo_search` is a sequential line scan rather than `rg`/ranked retrieval.
- Current `threadroot start` surfaces optional GitHub connection healthcheck failure as a doctor error, which hurts first-run trust.
- Current doctor warns when the whole `.threadroot/` directory is ignored. That finding is now backwards for `0.1.8`.
- Current `.gitignore` in this repo ignores `.threadroot/`, which now matches the product decision for local-only harness state.

Inferences:

- There is no universal way today to make all provider agents automatically discover `.threadroot/` without any provider-specific configuration.
- The right workaround is not "zero provider config." It is "zero visible provider files in the project by default."
- The best default bridge is provider user/local/global config that points the agent to `threadroot mcp`.
- The future cloud platform can become the portable sync/version layer for `.threadroot/`, but the local CLI must work without cloud.
- Skills are a core differentiator only if Threadroot makes them easier, safer, and cheaper than dumping long instructions into every prompt.
- Provider-native skills and instruction files should be treated as adapter outputs, not as the source of truth.

Unknowns to verify during implementation:

- Cursor's current official user/local/project MCP config paths and CLI support.
- Windsurf's current MCP/instruction config paths and whether it supports user-scoped MCP.
- OpenCode's current MCP config path and project/user config split.
- Gemini CLI's latest user/project settings behavior beyond its documented `settings.json` MCP server support.
- Whether each provider can pass the current project root to a globally configured MCP server without a project-visible shim.

## Component Classification

| Component | 0.1.8 Classification | Decision |
| --- | --- | --- |
| `.threadroot/` local harness | Core MVP | Keep as the only visible project artifact; git-ignore it by default. |
| `threadroot init` | Core MVP | Make it the first command. It creates local harness only. |
| `threadroot connect <agent>` | Core MVP | Add/finish it as the provider bridge. It replaces "bootstrap/setup/mcp setup" in docs. |
| `threadroot start "<task>"` | Core MVP | Keep as the agent session front door. It should not hard-fail on optional integrations. |
| `working_set(task)` | Core MVP | Add CLI and MCP. This is the core output-quality engine. |
| Repo map | Core MVP | Keep, but treat as orientation, not relevance. Make freshness content-aware. |
| Repo search/read | Core MVP | Keep; switch search baseline to `rg`/ranked results where possible. |
| Skills | Core MVP | Keep; route lazily and add create/suggest flows. |
| External skill discovery | Useful but controlled | Keep behind scan/provenance/trust; do not foreground in first-run. |
| Provider-native skill exposure | Useful but later/advanced | Keep only as explicit adapter output under `--project-files` or `.threadroot/providers`. |
| Tools | Core MVP | Keep for repeatable safe commands. Hide until needed. |
| Connections | Core MVP but not first-run | Keep local/user-scoped; no secrets; optional health failures must not block start. |
| Automation approval | Core MVP for safety | Keep, but simplify UX and keep high-risk paths explicit. |
| MCP stdio | Core MVP | Keep as primary local transport. |
| MCP resources/prompts | Useful soon | Add resources for files/maps/skills/memory after `working_set`; prompts can come later. |
| Streamable HTTP MCP | Later platform/cloud | Do not build local daemon now. Use for cloud later with auth. |
| Web fetch | Core MVP if scoped | Add known-URL fetch/cache/provenance. |
| General web search | Useful but later/delegated | Detect/provider-delegate in 0.1.8; native search later. |
| Cloud sync/versioning | Later platform | Design hooks only; do not build now. |
| Marketplace | Later platform | Do not build now. |
| Rust rewrite | Probably unnecessary now | Spawn `rg`, git, and language tools from Node first. |
| Python/ML indexer | Probably unnecessary now | Benchmark before embeddings. |

## Provider Bridge Plan

Goal: users should not see provider files in the project directory. They should see `.threadroot/` only.

Add or complete:

```bash
threadroot connect <agent>
threadroot connect <agent> --check
threadroot connect <agent> --undo
threadroot connect --status
threadroot connect --all
```

Default behavior:

- Configure one provider at a time.
- Prefer provider CLI/user/local config outside the project tree.
- Verify the MCP handshake after connecting.
- Record a non-secret connection receipt under `.threadroot/providers/<agent>/connection.json`.
- Do not create project-visible provider files.

Advanced behavior:

```bash
threadroot connect <agent> --project-files
threadroot expose <agent> --project-files
threadroot skills expose <skill> --agent <agent> --project-files
```

These commands may create visible provider files, but only after the user explicitly asks.

Provider-specific default strategy:

- Codex:
  - Prefer `codex mcp add` or direct user config in `~/.codex/config.toml`.
  - Do not write `.codex/config.toml` by default because it creates a visible top-level provider folder.
  - Do not create `AGENTS.md` by default.

- Claude:
  - Prefer `claude mcp add --scope local` for repo-specific local config or `--scope user` for all repos.
  - Avoid project `.mcp.json` unless `--project-files` is explicit.
  - Treat Claude plugin support as a later distribution path.

- VS Code / Copilot:
  - Prefer user profile MCP config via `code --add-mcp`.
  - Avoid `.vscode/mcp.json` unless `--project-files` is explicit.
  - Avoid `.github/copilot-instructions.md` by default because it is always-on, visible, and token-expensive.

- Cursor:
  - Verify current official MCP config locations before implementing.
  - Prefer user/global config if supported.
  - Avoid `.cursor/` project files unless `--project-files` is explicit.

- Gemini CLI:
  - Use documented `settings.json` MCP server support.
  - Prefer user settings if available; otherwise make the limitation explicit and do not write project-visible files by default.

- Windsurf/OpenCode:
  - Verify current docs and config behavior.
  - Support user/global config where available.
  - If only project-visible config is available, `connect` should say so and require `--project-files`.

Acceptance criteria:

- After `threadroot init` in a clean git repo, `ls -A` shows no new visible file except `.threadroot/` unless a normal `.gitignore` already existed and the user opted into editing it.
- `git status --short` does not show `.threadroot/`.
- `threadroot doctor` does not warn that `.threadroot/` is wholly ignored.
- `threadroot doctor` warns or errors if files under `.threadroot/` are tracked by git.
- Connecting Codex, Claude, VS Code/Copilot, Cursor, Gemini, Windsurf, or OpenCode never creates visible provider project files unless `--project-files` is passed.

## Context And Working Set

Current problem:

- Repo maps orient the agent but do not choose the right working set.
- Line search alone is weak for vague tasks.
- Always-on docs and provider instruction files burn tokens and drift stale.

Add:

```bash
threadroot working-set "fix flaky billing retry test"
threadroot working-set "fix flaky billing retry test" --json
```

MCP tool:

```text
working_set(task, budgetTokens?, include?)
```

Return:

- task summary
- ranked files with reasons
- ranked tests
- likely commands
- relevant memory excerpts
- relevant skills as metadata
- recommended next reads
- freshness warnings
- trust warnings
- permission warnings
- token estimate
- omitted sections with reasons

Retrieval stack for `0.1.8`:

1. Git/file/package overview.
2. `rg` lexical search.
3. Current open/active file if provider passes it or user supplies it.
4. Changed files and recent git diff.
5. Package scripts and test file conventions.
6. Simple import/reference graph for JS/TS if cheap.
7. Rerank by task match, path conventions, recency, and file type.
8. Cap by token budget.

Later only after benchmarking:

- local embeddings
- language-server-backed symbol graph
- background indexer daemon
- cross-repo cloud retrieval

Acceptance criteria:

- `working-set` returns a useful result in a small repo without reading every file.
- Output is deterministic enough to test.
- Output contains reasons, not just paths.
- Output fits a default token budget.
- MCP and CLI JSON schemas match.
- Tests cover content-only staleness, ignored files, noisy generated files, missing repo map, and changed-file relevance.

## Skills Plan

Current approach:

- Threadroot stores skills under `.threadroot/skills/`.
- It has seed skills for Threadroot usage, finding skills, creating skills, creating tools, and creating connections.
- It supports find/add/inspect/scan/trust/expose with provenance in `.threadroot/lock.json`.

Keep this approach, but change the product behavior:

- Skills are not the first-run story. They are the agent's lazy procedure layer.
- Skills should improve output only when the task calls for a repeatable workflow.
- Skills should not duplicate stable facts that belong in memory.
- Skills should not duplicate executable commands that belong in tools.
- External skills should be treated as supply-chain inputs, not trusted content.

Add routing:

```bash
threadroot skills match "prepare a release"
threadroot skills suggest
threadroot skills create <name>
```

MCP behavior:

- `working_set` returns `recommendedSkills` metadata only:
  - name
  - one-line reason
  - confidence
  - trigger terms
  - risk
  - whether full body should be loaded
- Agent calls `skills_get` only for high-confidence relevant skills.
- `skills_get` returns token estimate and supporting files list.

Skill schema additions:

- `when_to_use`
- `paths`
- `task_types`
- `inputs`
- `outputs`
- `risk`
- `manual_only`
- `creates_or_updates`
- `evals/triggers.json`

Skill creation:

- Add a safe "local skill first" path.
- Suggest a skill when the same checklist, command sequence, or correction appears repeatedly.
- Do not auto-create without user approval.
- Do not auto-install external skills.

External skill rules:

- Search only when no local skill fits or the user asks.
- Dry-run install first.
- Scan before use.
- Block or require review for scripts, provider permission fields, MCP config files, secrets, suspicious instructions, or non-installable layouts.
- Record provenance and trust state.

Acceptance criteria:

- `working_set` can recommend a skill without loading its full body.
- A skill body is loaded only when explicitly fetched or clearly relevant.
- External skill install failures are graceful and recorded as product issues.
- Provider-native skill exposure remains opt-in and never default.

## Existing Repo Import And Consolidation

Threadroot must work in repos that already have:

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/`
- `.agents/`
- `.codex/`
- `.cursor/`
- `.vscode/`
- `.github/copilot-instructions.md`
- `.cursorrules`
- `.windsurfrules`
- ad hoc docs and scripts

Default behavior:

```bash
threadroot init
```

Should detect existing agent/provider files and produce an import report under `.threadroot/imports/`, but must not overwrite or delete them.

Add explicit consolidation:

```bash
threadroot import
threadroot import --dry-run
threadroot import --consolidate
threadroot import --consolidate --move-provider-files
```

Classification:

- stable project facts -> `.threadroot/memory/project.md`
- stale warnings/past mistakes -> `.threadroot/memory/pitfalls.md`
- repeated procedures -> `.threadroot/skills/<name>/SKILL.md`
- executable workflows -> `.threadroot/tools/*.yaml`
- provider-specific preferences -> `.threadroot/providers/<agent>/`
- user-specific notes -> `.threadroot/local/`
- secrets or credentials -> never import; warn only

Rules:

- Never silently remove user provider files.
- Never duplicate large provider docs into always-on memory.
- Detect conflicting instructions.
- Show token-cost warnings for always-on files.
- Offer to move visible provider files under `.threadroot/imports/archive/` only with explicit `--move-provider-files`.

Acceptance criteria:

- Existing provider files are detected and classified.
- Init is non-destructive.
- Consolidation can create a project where the only visible Threadroot artifact is `.threadroot/`.
- The import report explains what changed, what was skipped, and why.

## Web Research Plan

Current state:

- Threadroot has local repo search/read/map.
- Threadroot does not currently provide general web search or public URL fetch.
- Agents may or may not have provider-native web access.

0.1.8 target:

```bash
threadroot web fetch <url>
threadroot web status
```

MCP:

```text
web_fetch(url, maxTokens?, extract?)
web_status()
```

Behavior:

- Fetch known public URLs.
- Extract readable text.
- Return title, URL, fetchedAt, content hash, excerpt, token estimate, and source metadata.
- Cache under `.threadroot/cache/web/`.
- Never commit cache.
- Respect allow/deny policy.
- Warn that fetched public pages are untrusted external content.

General web search:

- Add capability detection:
  - provider-native available
  - external MCP search available
  - unavailable
- Do not claim Threadroot-native search unless implemented.
- Later add `web_search(query)` through a configurable provider with citations and cost controls.

Acceptance criteria:

- A provider with no native browser/search can still open a public docs URL through Threadroot if network is available.
- Cached fetches include provenance and invalidation metadata.
- `working_set` can include fetched docs only when explicitly relevant.
- Web output is token-capped and citation-friendly.

## Storage Layout

Everything is under `.threadroot/`, but not everything has the same lifecycle.

Suggested local layout:

```text
.threadroot/
  harness.yaml
  memory/
  skills/
  tools/
  connections/
  providers/
  imports/
  cache/
  state/
  logs/
  tmp/
  lock.json
```

For `0.1.8`, the whole `.threadroot/` directory is local-only and should not be committed.

Future cloud-sync candidates:

- curated memory
- reviewed skills
- reviewed tools
- provider connection receipts without secrets
- import reports
- lock/provenance
- context snapshots
- release/eval telemetry

Always local-only:

- credentials
- tokens
- OAuth state
- local absolute paths
- personal preferences
- raw session logs unless explicitly exported
- web cache
- provider local config with machine paths
- connection manifests that reveal personal account details

Never store:

- API keys
- passwords
- private keys
- auth cookies
- production secrets
- destructive automation approvals from the cloud

## Doctor And Trust Model

Doctor should become a product-quality gate, not a bundle of old assumptions.

Change doctor findings:

- Remove or reverse `threadroot_whole_dir_ignored`.
- Add `threadroot_tracked_in_git` error if any `.threadroot/` file is tracked.
- Add `threadroot_not_ignored` warning if `.threadroot/` is not ignored/excluded.
- Add `visible_provider_file_detected` info/warning when provider files exist.
- Add `optional_connection_unhealthy` warning, not error, for local identity checks such as `gh auth status`.
- Keep high-risk tools/connections as errors when they can mutate external state without confirmation.
- Add `stale_product_docs` checks only if simple and deterministic.

Trust metadata for every context item:

- source type
- origin
- generatedAt
- lastVerified
- source path/URL
- freshness
- confidence
- permission required
- token estimate

Acceptance criteria:

- A fresh solo-dev init does not produce scary optional errors.
- Doctor tells the user exactly what to run to fix each issue.
- Doctor output is machine-readable enough for MCP/agents.

## Command Surface Changes

Preferred public path:

```bash
threadroot init
threadroot connect <agent>
threadroot start "<task>"
threadroot working-set "<task>"
threadroot doctor
```

Keep temporarily as legacy/compatibility:

- `threadroot bootstrap`
- `threadroot setup`
- `threadroot mcp setup`
- `threadroot expose`

But docs should stop leading with them.

Command design rules:

- One obvious front door.
- No "configure all providers" default.
- No project-visible provider files by default.
- No connections in first-run unless task-relevant.
- No external skill install in first-run.
- Every command that writes outside `.threadroot/` must say so before applying.
- Every command that writes provider config must support `--check` and `--undo` where possible.

## 7-Day Execution Plan

### Day 1: Product And Docs Contract

- Update README positioning:
  - "local context router for coding agents"
  - "Stop re-teaching every coding agent your repo"
  - remove "version-controlled harness state" from OSS CLI positioning
  - replace quick start with `init`, `connect`, `start`
- Update package description if needed.
- Update `INTEGRATION.md`, `SECURITY.md`, changelog draft, and any prompt text that still teaches the old bootstrap-first flow.
- Add a release checklist section requiring stale docs/code cleanup before `0.1.8`.

### Day 2: Local-Only Storage And Git Policy

- Change init/gitignore behavior:
  - prefer `.git/info/exclude` for `.threadroot/`
  - do not edit root `.gitignore` by default
  - offer explicit `--gitignore` if the user wants tracked ignore rules
- Change doctor:
  - ignored `.threadroot/` is healthy for now
  - tracked `.threadroot/` is an error
  - unignored `.threadroot/` is a warning
- Add tests for git policy.

### Day 3: Provider Connect

- Add or complete `threadroot connect <agent>`.
- Implement provider strategies for Codex, Claude, VS Code/Copilot, Cursor, Gemini, Windsurf, and OpenCode as far as docs/CLIs allow.
- Default to user/local config outside the project tree.
- Add `--project-files` for visible provider files.
- Add `--check`, `--undo`, and `--status`.
- Update MCP check beyond Codex where feasible.
- Add tests that default connect does not write visible provider folders/files.

### Day 4: Working Set

- Add CLI `threadroot working-set`.
- Add MCP `working_set`.
- Implement deterministic baseline retrieval with git/file/package overview plus `rg`.
- Add token budgets, reasons, freshness, trust, permissions, and next-read recommendations.
- Add tests for ranking, caps, and stale/ignored files.

### Day 5: Skills Routing And Import

- Add `skills match` or integrate skill matching into `working_set`.
- Add metadata-only skill recommendations.
- Add `skills suggest` or a minimal suggestion report.
- Add import report for existing provider files.
- Add non-destructive classification of `AGENTS.md`, `CLAUDE.md`, `.cursor`, `.claude`, `.codex`, `.github/copilot-instructions.md`, and related files.
- Keep consolidation/moving visible provider files explicit.

### Day 6: Web Fetch And Context Quality

- Add `threadroot web status`.
- Add `threadroot web fetch <url>` and MCP `web_fetch` if feasible within the release window.
- Cache under `.threadroot/cache/web/`.
- Return source metadata, fetchedAt, hash, token estimate, and warnings.
- Add provider/native search capability detection if feasible.
- If full web fetch is too large for `0.1.8`, ship honest `web_status` plus documented provider/delegated search, and leave `web_fetch` as the first post-release task.

### Day 7: Release Readiness And Cleanup

- Remove or deprecate stale docs, prompts, tests, and code paths that preserve the wrong default product stance.
- Search and resolve stale references:
  - `version-controlled harness`
  - `bootstrap --yes --mcp`
  - `mcp setup --write`
  - `threadroot expose` as first-run
  - `AGENTS.md` as default output
  - `CLAUDE.md` as default output
  - `.vscode/mcp.json` as default output
  - `.cursor/mcp.json` as default output
  - `.mcp.json` as default output
- Update `.threadroot/memory/project.md`, `.threadroot/memory/pitfalls.md`, `.threadroot/memory/handoff.md`, and repo map to reflect the current product state.
- Remove stale generated files/folders if they are no longer part of the product.
- Bump version in `package.json` and `src/core/version.ts`.
- Add changelog entry.
- Run:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm pack:check`
  - `pnpm package:smoke`
  - `pnpm release:check`
- Confirm npm package does not include `.threadroot/`, provider folders, temp state, cache, or old generated artifacts.

## Release Acceptance Criteria

The `0.1.8` release is not ready until all of these are true:

- A clean init creates only `.threadroot/` as a visible Threadroot artifact.
- `.threadroot/` is ignored/excluded from git by default.
- No `.threadroot/` file is tracked in release commits.
- Quick start uses `threadroot init`, `threadroot connect <agent>`, and `threadroot start`.
- Provider files are never written visibly by default.
- At least Codex, Claude, VS Code/Copilot, Cursor, Gemini, Windsurf, and OpenCode have documented connect behavior, even if some are "manual/unsupported without project files" pending verified provider support.
- `threadroot start` does not fail the user's confidence because an optional local connection is unavailable.
- `working_set` exists in CLI and MCP or, if cut for time, the release is not called foundation-complete.
- Skills are routed lazily by metadata before body load.
- Existing provider files are imported/classified non-destructively.
- Web capability status is honest; known URL fetch ships or is explicitly deferred with no misleading command/docs.
- README, integration docs, security docs, changelog, package metadata, CLI help, tests, and local Threadroot memory all describe the same product.
- Stale old code, docs, generated files, and folders are removed or marked legacy.
- Full release gate passes.

## What Not To Build Now

- Cloud sync/version control for `.threadroot/`.
- Marketplace.
- Native general web search without a provider/API story.
- Embedding index before measuring lexical/graph retrieval.
- Rust rewrite.
- Python rewrite.
- Local MCP daemon over HTTP.
- Top-level provider shims as default behavior.
- Auto-installing external skills.
- Auto-creating skills without user approval.
- Cloud-triggered local shell execution.
- Enterprise policy surface.

## Positioning

Landing-page headline:

> Stop re-teaching every coding agent your repo.

Subheadline:

> Threadroot gives Codex, Claude, Cursor, Copilot, Gemini, and other agents the right local context, skills, tools, and memory without dumping your whole project into the prompt or scattering provider files across your repo.

Short product language:

- Local context router for coding agents.
- One hidden repo harness, every agent connected.
- Smaller context. Better edits. Less repeated explaining.

Avoid:

- "Capability harness compiler"
- "Version-controlled harness state" for the OSS CLI
- "Universal agent setup" if it creates visible provider files
- "Native web search" unless actually implemented

## Sources

- MCP transports: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- MCP tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP resources: https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- Codex `AGENTS.md`: https://developers.openai.com/codex/guides/agents-md
- Codex MCP: https://developers.openai.com/codex/mcp
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- Claude Code skills: https://code.claude.com/docs/en/skills
- Claude Code memory: https://code.claude.com/docs/en/memory
- VS Code MCP servers: https://code.visualstudio.com/docs/agent-customization/mcp-servers
- VS Code context engineering: https://code.visualstudio.com/docs/agents/guides/context-engineering-guide
- VS Code usage optimization: https://code.visualstudio.com/docs/agents/guides/optimize-usage
- GitHub Copilot repository instructions: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions
- Gemini CLI MCP server docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
- OpenAI web search: https://developers.openai.com/api/docs/guides/tools-web-search
- Anthropic web search: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
