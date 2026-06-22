import type { AgentProvider } from "./agent-providers.js";

export const THREADROOT_SKILL_NAME = "threadroot";
export const THREADROOT_MANAGED_MARKER = "<!-- threadroot:managed skill -->";

export function threadrootSkillContent(provider: AgentProvider, scope: "project" | "global"): string {
  const scopeLine =
    scope === "global"
      ? "This is a global machine-level skill. Use it only when the current repository contains `.threadroot/` or the user asks for Threadroot."
      : "This is a project-level skill for the current repository.";

  return [
    "---",
    `name: ${THREADROOT_SKILL_NAME}`,
    "description: Use when a repository contains .threadroot/ or the user asks to initialize, inspect, repair, or use Threadroot harness context, skills, tools, memory, connections, or agent setup.",
    "---",
    "",
    THREADROOT_MANAGED_MARKER,
    "",
    "# Threadroot Harness",
    "",
    scopeLine,
    "",
    "Threadroot keeps agent-facing project context and capabilities in `.threadroot/` and exposes them through deterministic CLI/MCP commands. It is the portable source of truth for skills, tools, connections, memory, repo maps, rules, and provenance. Keep broad context out of the chat until it is task-relevant.",
    "",
    "## Workflow",
    "",
    "1. If `threadroot --version` works, use `threadroot`. Otherwise use `npx --yes threadroot@latest` for one-off commands.",
    "2. If `.threadroot/harness.yaml` is missing and the user wants setup, run `threadroot bootstrap --yes --mcp` or `npx --yes threadroot@latest bootstrap --yes --mcp`.",
    "3. At the start of a coding session, run `threadroot start \"<task>\"` to get doctor status, project state, repo-map status, relevant skills, tools, connections, memory, and the command map.",
    "4. If the repo map is missing or stale, run `threadroot map --write` so future turns can navigate the codebase without loading everything.",
    "5. If no installed skill fits the task, run `threadroot skills find \"<query>\"` and install only through `threadroot skills add <source> --skill <name>` so the skill is scanned, locked, and stored under `.threadroot/skills/`.",
    "6. If no good external skill exists, use the `create-skill` seed skill and create a project-specific skill under `.threadroot/skills/<name>/SKILL.md`.",
    "7. For repeatable commands, use `threadroot tools detect`, then create minimal tools with `threadroot tools create`. Use `threadroot connections add` for local CLI services; never store secrets.",
    "8. Use `threadroot automation status` before agent-created capabilities. If safe automation is wanted, ask the user to run `threadroot automation approve`; medium/high-risk work still requires explicit human review.",
    "9. Do not create provider-specific files unless the user asks. Use `threadroot expose <agent>` for the Threadroot bootstrap shim or `threadroot skills expose <name|all> --agent <agent>` for installed skill shims.",
    "",
    "## Useful Commands",
    "",
    "```bash",
    "threadroot bootstrap --yes --mcp",
    "threadroot start \"<task>\"",
    "threadroot doctor",
    "threadroot status",
    "threadroot context \"<task>\"",
    "threadroot map --write",
    "threadroot map --check",
    "threadroot skills find \"<query>\"",
    "threadroot skills add <source>",
    "threadroot skills add <source> --skill <name>",
    "threadroot skills list",
    "threadroot skills inspect <path>",
    "threadroot skills scan <path>",
    "threadroot tools detect",
    "threadroot tools create --from-command \"<command>\"",
    "threadroot tools list",
    "threadroot connections add <name> --provider <provider> --command <command>",
    "threadroot automation status",
    "```",
    "",
    "## Boundaries",
    "",
    "- `.threadroot/` is the source of truth.",
    "- Load full skill bodies only when the skill is task-relevant.",
    "- Keep generated or exposed provider files thin.",
    "- Never store secrets in Threadroot. Connections should wrap locally authenticated CLIs.",
    "- Inspect external skills, scripts, tools, and MCP servers before trusting them. Threadroot detects risk signals; it does not certify third-party skills as safe.",
    "",
    `Provider target: ${provider.label}.`,
    "",
  ].join("\n");
}
