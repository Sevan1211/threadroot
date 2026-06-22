import { type EffectiveHarness, resolveHarness } from "./load.js";
import { projectLockPath, userLockPath } from "./paths.js";
import { readLockFile } from "../install/lock.js";
import type { LockEntry } from "../install/source.js";

export type ContextSkill = {
  name: string;
  when: string;
  tags: string[];
  scope: string;
  sourcePath: string;
  risk: string;
  reviewed: boolean;
  provenance?: string;
  registryId?: string;
  auditUrl?: string;
  externalScan?: {
    provider: string;
    status: string;
    reason?: string;
  };
  score: number;
};

export type ContextTool = {
  name: string;
  description: string;
  confirm: boolean;
  risk: string;
  connection?: string;
  healthcheck: boolean;
  kind: "shell" | "script";
};

export type ContextRule = {
  name: string;
  applyTo?: string;
};

export type ContextConnection = {
  name: string;
  provider: string;
  command: string;
  profile?: string;
  description: string;
  risk: string;
  confirm: boolean;
  healthcheck: boolean;
};

export type ContextMemory = {
  type: string;
  body: string;
};

export type HarnessContext = {
  task: string;
  skills: ContextSkill[];
  rules: ContextRule[];
  tools: ContextTool[];
  connections: ContextConnection[];
  memory: ContextMemory[];
};

export type AssembleContextOptions = {
  harness?: EffectiveHarness;
  home?: string;
  /** Max skills returned (after ranking). */
  limit?: number;
  /** Return baseline skills when no task-specific skill matches. */
  fallbackSkills?: boolean;
};

/** Deterministic task tokenizer (no LLM). */
function taskTerms(task: string): string[] {
  return [
    ...new Set(
      task
        .toLowerCase()
        .split(/[^a-z0-9+#.-]+/)
        .filter((term) => term.length > 2),
    ),
  ];
}

function scoreSkill(haystack: string, terms: string[]): number {
  const lower = haystack.toLowerCase();
  return terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

async function skillLockEntries(repoRoot: string, home?: string): Promise<Map<string, LockEntry>> {
  const [projectLock, userLock] = await Promise.all([
    readLockFile(projectLockPath(repoRoot)),
    readLockFile(userLockPath(home)),
  ]);
  const entries = new Map<string, LockEntry>();
  for (const entry of userLock.objects) {
    if (entry.kind === "skill") entries.set(entry.name, entry);
  }
  for (const entry of projectLock.objects) {
    if (entry.kind === "skill") entries.set(entry.name, entry);
  }
  return entries;
}

function contextSkill(
  skill: EffectiveHarness["skills"][number],
  score: number,
  lockEntries: Map<string, LockEntry>,
): ContextSkill {
  const entry = lockEntries.get(skill.name);
  return {
    name: skill.name,
    when: skill.frontmatter.when,
    tags: skill.frontmatter.tags,
    scope: skill.frontmatter.scope,
    sourcePath: skill.sourcePath,
    risk: entry?.risk ?? "low",
    reviewed: entry ? (entry.reviewed ?? entry.sourceKind === "local") : true,
    provenance: entry?.source,
    registryId: entry?.registryId,
    auditUrl: entry?.auditUrl,
    externalScan: entry?.externalScan
      ? {
          provider: entry.externalScan.provider,
          status: entry.externalScan.status,
          reason: entry.externalScan.reason,
        }
      : undefined,
    score,
  };
}

/**
 * Assemble the task-relevant harness slice: ranked skills (deterministic
 * keyword match on name/when/tags), all available tools and rules, and durable
 * memory. This powers MCP `context(task)` and `tr context`.
 */
export async function assembleContext(
  repoRoot: string,
  task: string,
  options: AssembleContextOptions = {},
): Promise<HarnessContext> {
  const harness = options.harness ?? (await resolveHarness(repoRoot, { home: options.home }));
  const terms = taskTerms(task);
  const lockEntries = await skillLockEntries(repoRoot, options.home);

  let ranked = harness.skills
    .map((skill) => ({
      skill,
      score: scoreSkill(`${skill.name} ${skill.frontmatter.when} ${skill.frontmatter.tags.join(" ")}`, terms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
    .slice(0, options.limit ?? 8)
    .map(({ skill, score }) => contextSkill(skill, score, lockEntries));

  if (ranked.length === 0 && options.fallbackSkills) {
    ranked = harness.skills.slice(0, options.limit ?? 8).map((skill) => contextSkill(skill, 0, lockEntries));
  }

  return {
    task,
    skills: ranked,
    rules: harness.rules.map((rule) => ({ name: rule.name, applyTo: rule.frontmatter.applyTo })),
    tools: harness.tools.map((tool) => ({
      name: tool.name,
      description: tool.manifest.description,
      confirm: tool.manifest.confirm,
      risk: tool.manifest.risk,
      connection: tool.manifest.connection,
      healthcheck: Boolean(tool.manifest.healthcheck),
      kind: tool.manifest.run ? "shell" : "script",
    })),
    connections: harness.connections.map((connection) => ({
      name: connection.name,
      provider: connection.manifest.provider,
      command: connection.manifest.command,
      profile: connection.manifest.profile,
      description: connection.manifest.description,
      risk: connection.manifest.risk,
      confirm: connection.manifest.confirm,
      healthcheck: Boolean(connection.manifest.healthcheck),
    })),
    memory: harness.memory.map((entry) => ({ type: entry.type, body: entry.body })),
  };
}
