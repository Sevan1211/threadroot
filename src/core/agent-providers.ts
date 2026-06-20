import path from "node:path";

export const AGENT_PROVIDER_IDS = [
  "antigravity",
  "claude",
  "codex",
  "cursor",
  "gemini",
  "copilot",
  "opencode",
  "windsurf",
] as const;

export type AgentProviderId = (typeof AGENT_PROVIDER_IDS)[number];

export type AgentProvider = {
  id: AgentProviderId;
  label: string;
  projectSkillDir: string;
  globalSkillDir: string;
};

export const AGENT_PROVIDERS: Record<AgentProviderId, AgentProvider> = {
  antigravity: {
    id: "antigravity",
    label: "Antigravity",
    projectSkillDir: path.join(".agent", "skills"),
    globalSkillDir: path.join(".gemini", "antigravity", "skills"),
  },
  claude: {
    id: "claude",
    label: "Claude Code",
    projectSkillDir: path.join(".claude", "skills"),
    globalSkillDir: path.join(".claude", "skills"),
  },
  codex: {
    id: "codex",
    label: "Codex",
    projectSkillDir: path.join(".agents", "skills"),
    globalSkillDir: path.join(".agents", "skills"),
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    projectSkillDir: path.join(".cursor", "skills"),
    globalSkillDir: path.join(".cursor", "skills"),
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    projectSkillDir: path.join(".gemini", "skills"),
    globalSkillDir: path.join(".gemini", "skills"),
  },
  copilot: {
    id: "copilot",
    label: "GitHub Copilot",
    projectSkillDir: path.join(".github", "skills"),
    globalSkillDir: path.join(".copilot", "skills"),
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    projectSkillDir: path.join(".opencode", "skills"),
    globalSkillDir: path.join(".config", "opencode", "skills"),
  },
  windsurf: {
    id: "windsurf",
    label: "Windsurf",
    projectSkillDir: path.join(".windsurf", "skills"),
    globalSkillDir: path.join(".codeium", "windsurf", "skills"),
  },
};

const ALIASES: Record<string, AgentProviderId | "all"> = {
  all: "all",
  agent: "antigravity",
  antigravity: "antigravity",
  claude: "claude",
  "claude-code": "claude",
  codex: "codex",
  cursor: "cursor",
  gemini: "gemini",
  "gemini-cli": "gemini",
  copilot: "copilot",
  github: "copilot",
  "github-copilot": "copilot",
  opencode: "opencode",
  "open-code": "opencode",
  windsurf: "windsurf",
};

export function allAgentProviders(): AgentProvider[] {
  return AGENT_PROVIDER_IDS.map((id) => AGENT_PROVIDERS[id]);
}

export function parseAgentProviderList(value: string | undefined, fallback: "all" | AgentProviderId[] = "all"): AgentProviderId[] {
  const raw = value?.trim();
  if (!raw) {
    return fallback === "all" ? [...AGENT_PROVIDER_IDS] : fallback;
  }

  const ids = new Set<AgentProviderId>();
  for (const entry of raw.split(",")) {
    const key = entry.trim().toLowerCase();
    if (!key) {
      continue;
    }
    const resolved = ALIASES[key];
    if (!resolved) {
      throw new Error(`Unknown agent provider \`${entry}\`. Supported: ${AGENT_PROVIDER_IDS.join(", ")}, all.`);
    }
    if (resolved === "all") {
      for (const id of AGENT_PROVIDER_IDS) {
        ids.add(id);
      }
      continue;
    }
    ids.add(resolved);
  }
  return [...ids];
}

