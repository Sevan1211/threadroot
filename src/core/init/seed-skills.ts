export type SeedSkillDefinition = {
  name: string;
  source: string;
  files: Record<string, string>;
  upstreamSource?: string;
  registry?: string;
  registryId?: string;
  installUrl?: string;
  auditUrl?: string;
};

const threadrootSkill = `---
name: threadroot
description: Use when an agent needs to understand what Threadroot is, how to use the current .threadroot harness, which commands are available, or how to get task-specific context without flooding the chat.
license: MIT
compatibility: Threadroot CLI, MCP, and .threadroot-managed agent harnesses.
metadata:
  adaptedBy: threadroot
  routesThrough: .threadroot
tags:
  - threadroot
  - context
  - commands
  - harness
---

# Threadroot

Threadroot is the local context and capability router for this project. It keeps agent-facing skills, tools, connections, rules, memory, repo maps, provider receipts, imports, and provenance under \`.threadroot/\`.

Use Threadroot to get the right task-specific working set without loading the entire repository or every skill into the model. For this release, \`.threadroot/\` is local-only and should not be committed to git.

## Start Here

1. Run a focused session command:

\`\`\`bash
threadroot start "<task>"
\`\`\`

2. Read the doctor/status summary and any relevant skill paths.
3. If a codebase map is present, use it to choose files before broad reads.
4. Load full skill bodies only when a listed skill is relevant.
5. Prefer Threadroot tools and connections over ad hoc shell commands when they exist.

## Core Commands

\`\`\`bash
threadroot init
threadroot start "<task>"
threadroot working-set "<task>"
threadroot connect <agent>
threadroot context "<task>"
threadroot map --write
threadroot map --check
threadroot doctor
threadroot status
threadroot skills find "<query>"
threadroot skills add <source> --skill <name>
threadroot skills inspect .threadroot/skills/<name>
threadroot tools detect
threadroot tools create --from-command "<command>"
threadroot tools check
threadroot run <tool>
threadroot connections add <name> --provider <provider> --command <command>
threadroot connections check
threadroot automation status
threadroot automation approve
threadroot remember "<note>"
threadroot mcp check
threadroot web status
\`\`\`

## How Agents Should Use It

- Start with \`threadroot start "<task>"\` and \`threadroot working-set "<task>"\` before broad codebase exploration.
- Use \`threadroot map --write\` when the repo map is missing or stale.
- Use \`threadroot skills find "<query>"\` when installed skills do not fit the task.
- Use \`create-skill\` when no good external skill exists.
- Use \`create-tool\` for repeatable local commands.
- Use \`create-connection\` for local CLI accounts such as GitHub, AWS, Azure, GCP, Snowflake, Docker, Kubernetes, Vercel, or dbt.
- Use MCP tools when available; fall back to CLI commands when MCP is unavailable.

## Boundaries

- \`.threadroot/\` is local-only in this release. Do not commit it to git.
- Do not create provider-specific project files unless the user explicitly asks for project files.
- Do not store secrets in Threadroot.
- Do not execute high-risk tools, destructive cloud commands, or credential-related workflows without explicit user approval.
- Keep context compact. Load only the files, skills, and memory needed for the current task.
`;

const findSkillsSkill = `---
name: find-skills
description: Use when a task would benefit from a specialized Agent Skill that is not already installed, when the user asks for a capability, framework, domain, or workflow skill, or when current project skills do not strongly match the task.
license: MIT
compatibility: Threadroot-managed Agent Skills. Use through threadroot commands; do not install directly into provider skill folders.
metadata:
  upstream: https://www.skills.sh/vercel-labs/skills/find-skills
  adaptedBy: threadroot
  routesThrough: .threadroot
tags:
  - skills
  - discovery
  - routing
---

# Find Skills

Use this skill to discover a task-specific Agent Skill without flooding the model with unrelated instructions.

## Workflow

1. Run \`threadroot start "<task>"\` or \`threadroot context "<task>"\` and check whether an installed skill already matches.
2. If no installed skill fits, run \`threadroot skills find "<query>" --json\`.
3. Prefer skills that are GitHub-backed, reputable, audited, non-duplicate, and narrowly relevant.
4. Dry-run the best candidate before installing:

\`\`\`bash
threadroot skills add <source> --skill <name> --dry-run --json
\`\`\`

5. Install low-risk, good-fit skills through Threadroot only:

\`\`\`bash
threadroot skills add <source> --skill <name>
\`\`\`

6. Run \`threadroot doctor\` after install.
7. Load only the installed skill that matches the task. Do not load every skill.
8. If search fails, the result is not installable, the scan is blocked/high-risk, or a local workflow would be clearer, use the \`create-skill\` skill and create/adapt a project-specific skill under \`.threadroot/skills/\`.

## Safety

- Do not run \`npx skills add\` as the final install path. That can bypass Threadroot provenance, scanning, lockfile, and \`.threadroot\` routing.
- Do not create \`.agents/\`, \`.claude/\`, \`.cursor/\`, \`.github/\`, or other provider skill folders unless the user explicitly asks for native exposure.
- If Threadroot reports high risk, blocked scan, Snyk failure, scripts, provider permission fields, or suspicious instructions, do not trust or use that external skill automatically. Prefer creating a safer local skill with \`create-skill\`; ask the user only when installing or trusting the risky external skill is still the better path.
`;

const createSkillSkill = `---
name: create-skill
description: Use when no high-quality existing skill fits the task, when the project has a repeatable workflow agents should remember, or when the user asks to create, improve, evaluate, or specialize an Agent Skill.
license: MIT
compatibility: Threadroot-managed Agent Skills. Create skills under .threadroot/skills with progressive disclosure.
metadata:
  upstream: https://www.skills.sh/anthropics/skills/skill-creator
  adaptedBy: threadroot
  routesThrough: .threadroot
tags:
  - skills
  - authoring
  - evals
---

# Create Skill

Use this skill to create a small, high-signal project skill under \`.threadroot/skills/<name>/SKILL.md\`. This is the default fallback when external skill discovery fails, a candidate is blocked/high-risk, or a local project workflow would be safer or better aligned.

## Workflow

1. Confirm the need is repeatable and not better handled by a one-off answer, a tool, or a connection. If this is fallback from a blocked or poor external skill, preserve the useful workflow idea without copying risky provider permissions.
2. Pick a narrow lowercase hyphenated name.
3. Write a \`SKILL.md\` with:
   - \`name\`
   - \`description\` that says what the skill does and when to use it
   - \`license\`
   - \`compatibility\`
   - focused procedural steps
4. Move long details into \`references/\` and link them from \`SKILL.md\`.
5. Add small eval trigger examples when useful.
6. Run:

\`\`\`bash
threadroot skills validate --path .threadroot/skills/<name>
threadroot doctor
\`\`\`

7. Use the new skill only when it is relevant to the current task.

## Quality Bar

- Keep the skill procedural, compact, and specific.
- Do not copy large docs into the main skill body.
- Do not store secrets or credentials.
- Do not declare provider permission fields such as \`allowed-tools\` in project skills unless the user has explicitly reviewed the risk.
- Prefer links and references so agents load details only when needed.
`;

const createToolSkill = `---
name: create-tool
description: Use when an agent needs a repeatable executable project capability, a safe wrapper around an existing command, a healthchecked local workflow, or a tool that can be called through Threadroot CLI or MCP.
license: MIT
compatibility: Threadroot tools under .threadroot/tools/*.yaml.
metadata:
  adaptedBy: threadroot
  routesThrough: .threadroot
tags:
  - tools
  - commands
  - automation
---

# Create Tool

Use this skill to create safe Threadroot tools for repeatable local commands.

## Workflow

1. Inspect existing command surfaces first:

\`\`\`bash
threadroot tools detect --json
threadroot tools list --json
\`\`\`

2. Prefer wrapping existing package scripts, Make targets, just recipes, or official CLIs.
3. Create the narrowest useful tool:

\`\`\`bash
threadroot tools create --from-command "<command>" --description "<purpose>" --risk <low|medium|high>
\`\`\`

4. Add a healthcheck when possible.
5. Use \`--connection <name>\` when the command depends on a local CLI account.
6. Run:

\`\`\`bash
threadroot tools check
threadroot doctor
\`\`\`

## Safety

- Agent-created tools should be narrow and inspectable.
- High-risk or destructive tools must require confirmation.
- Do not execute risky tools yourself. Ask the user to run \`threadroot run <tool> --yes\` after review.
- Do not embed secrets in tool commands.
- For cloud/account CLIs, create a connection and reference it from the tool.
`;

const createConnectionSkill = `---
name: create-connection
description: Use when an agent needs controlled access to a locally authenticated CLI such as GitHub, AWS, Azure, GCP, Snowflake, dbt, Docker, Kubernetes, Vercel, or another service.
license: MIT
compatibility: Threadroot connections under .threadroot/connections/*.yaml.
metadata:
  adaptedBy: threadroot
  routesThrough: .threadroot
tags:
  - connections
  - cli
  - cloud
  - mcp
---

# Create Connection

Use this skill to create a Threadroot connection for a local CLI. Connections describe access; they do not store secrets.

## Workflow

1. Confirm the user already authenticates through the official local CLI.
2. Identify the provider, command, profile/account label, risk, healthcheck, allow rules, and deny rules.
3. Create the connection:

\`\`\`bash
threadroot connections add <name> --provider <provider> --command <command> --risk <low|medium|high> --healthcheck "<safe check>"
\`\`\`

4. Add \`--allow\` and \`--deny\` fragments for connection-backed tools when practical.
5. Run:

\`\`\`bash
threadroot connections check
threadroot doctor
\`\`\`

6. Create tools that reference the connection instead of embedding broad cloud commands directly.

## Safety

- Never store API keys, passwords, tokens, private keys, or cloud credentials in \`.threadroot\`.
- High-risk cloud or production connections should require confirmation.
- Prefer read-only healthchecks such as identity/account/version commands.
- Destructive cloud mutations require explicit user approval even when project automation is enabled.
`;

export const SEED_SKILLS: readonly SeedSkillDefinition[] = [
  {
    name: "threadroot",
    source: "threadroot:seed/threadroot",
    files: { "SKILL.md": threadrootSkill },
  },
  {
    name: "create-connection",
    source: "threadroot:seed/create-connection",
    files: { "SKILL.md": createConnectionSkill },
  },
  {
    name: "create-skill",
    source: "threadroot:seed/create-skill",
    files: { "SKILL.md": createSkillSkill },
    upstreamSource: "https://www.skills.sh/anthropics/skills/skill-creator",
    registry: "skills.sh",
    registryId: "anthropics/skills/skill-creator",
    installUrl: "https://github.com/anthropics/skills",
    auditUrl: "https://www.skills.sh/anthropics/skills/skill-creator",
  },
  {
    name: "create-tool",
    source: "threadroot:seed/create-tool",
    files: { "SKILL.md": createToolSkill },
  },
  {
    name: "find-skills",
    source: "threadroot:seed/find-skills",
    files: { "SKILL.md": findSkillsSkill },
    upstreamSource: "https://www.skills.sh/vercel-labs/skills/find-skills",
    registry: "skills.sh",
    registryId: "vercel-labs/skills/find-skills",
    installUrl: "https://github.com/vercel-labs/skills",
    auditUrl: "https://www.skills.sh/vercel-labs/skills/find-skills",
  },
] as const;
