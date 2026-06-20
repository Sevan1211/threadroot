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
    "Threadroot keeps agent-facing project context in `.threadroot/` and exposes it through deterministic CLI commands. Keep broad context out of the chat until it is task-relevant.",
    "",
    "## Workflow",
    "",
    "1. If `threadroot --version` works, use `threadroot`. Otherwise use `npx --yes threadroot@latest` for one-off commands.",
    "2. If `.threadroot/harness.yaml` is missing and the user wants setup, run `threadroot init` or `npx --yes threadroot@latest init`.",
    "3. Before coding in a Threadroot repo, run `threadroot doctor` and resolve errors. Treat warnings as review items, not automatic blockers.",
    "4. For the current task, run `threadroot context \"<task>\"` and use the returned skills, rules, tools, memory, and references before doing broad file reads.",
    "5. Use `threadroot status` to inspect harness state and `threadroot diff` only when compiled adapter outputs are enabled.",
    "6. Use `threadroot tools list`, `threadroot tools check`, and `threadroot run <tool>` for explicit local capabilities. Confirm risky tools when required.",
    "7. Do not create provider-specific files unless the user asks. Use `threadroot expose <agent>` when native project skill shims are desired.",
    "",
    "## Useful Commands",
    "",
    "```bash",
    "threadroot doctor",
    "threadroot status",
    "threadroot context \"<task>\"",
    "threadroot skills list",
    "threadroot tools list",
    "threadroot packs list",
    "```",
    "",
    "## Boundaries",
    "",
    "- `.threadroot/` is the source of truth.",
    "- Keep generated or exposed provider files thin.",
    "- Never store secrets in Threadroot. Connections should wrap locally authenticated CLIs.",
    "- Inspect external skills, scripts, tools, and MCP servers before trusting them.",
    "",
    `Provider target: ${provider.label}.`,
    "",
  ].join("\n");
}

