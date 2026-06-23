import { access } from "node:fs/promises";
import path from "node:path";

import { assembleTaskPacket } from "./task-packet.js";

export type ContextEvalCase = {
  id: string;
  task: string;
  expectedFiles: string[];
  expectedTests?: string[];
  expectedCommands?: string[];
  expectedSkills?: string[];
  mustNotRank?: string[];
};

export type ContextEvalCaseResult = {
  id: string;
  task: string;
  topFiles: string[];
  recallAt5: number;
  precisionAt5: number;
  mrr: number;
  ndcgAt5: number;
  irrelevantTop5: number;
  commandHit: boolean;
  skillHit: boolean;
  tokenEstimate: number;
};

export type ContextEvalReport = {
  cases: ContextEvalCaseResult[];
  skippedCases: string[];
  summary: {
    cases: number;
    skipped: number;
    recallAt5: number;
    precisionAt5: number;
    mrr: number;
    ndcgAt5: number;
    irrelevantTop5: number;
    commandHitRate: number;
    skillHitRate: number;
    averageTokens: number;
  };
};

export const DEFAULT_CONTEXT_EVALS: ContextEvalCase[] = [
  { id: "task-command", task: "add the canonical task command", expectedFiles: ["src/cli.ts", "src/commands/task.ts", "src/core/task-packet.ts"], expectedTests: ["test/cli-smoke.test.ts"] },
  { id: "task-routing", task: "improve task packet file ranking", expectedFiles: ["src/core/task-packet.ts", "src/core/working-set.ts", "test/working-set.test.ts"], mustNotRank: [".gitignore"] },
  { id: "mcp-tools", task: "add a new MCP task_packet tool", expectedFiles: ["src/mcp/server.ts", "test/mcp-server.test.ts"] },
  { id: "repo-map", task: "refresh compact repo map generation", expectedFiles: ["src/core/repo-map.ts", "src/commands/map.ts", "test/repo-map.test.ts"] },
  { id: "doctor-index", task: "report index degraded mode in doctor", expectedFiles: ["src/core/doctor.ts", "src/commands/doctor.ts", "test/doctor.test.ts"] },
  { id: "tool-run-brief", task: "summarize failed tool runs", expectedFiles: ["src/commands/tools.ts", "src/core/tools/execute.ts", "src/core/run-brief.ts", "test/tools.test.ts"] },
  { id: "skills-routing", task: "improve skill trigger routing and trust", expectedFiles: ["src/core/harness/context.ts", "src/core/skills.ts", "test/skills.test.ts"] },
  { id: "skill-install-risk", task: "scan external skill install risks", expectedFiles: ["src/core/skills-install.ts", "src/core/skills-scan.ts", "test/skills-install.test.ts"] },
  { id: "web-fetch", task: "fetch known public URL with provenance", expectedFiles: ["src/core/web.ts", "src/commands/web.ts", "test/web.test.ts"] },
  { id: "connect-codex", task: "connect Codex without visible provider files", expectedFiles: ["src/core/connect.ts", "src/commands/connect.ts", "test/connect.test.ts"] },
  { id: "mcp-check", task: "verify MCP handshake", expectedFiles: ["src/core/mcp-check.ts", "test/mcp-check.test.ts"] },
  { id: "init-harness", task: "initialize local-only harness", expectedFiles: ["src/core/init/index.ts", "src/commands/init.ts", "test/init.test.ts"] },
  { id: "import-provider", task: "non destructive import provider files", expectedFiles: ["src/core/init/import.ts", "src/commands/import.ts", "test/init.test.ts"] },
  { id: "gitignore", task: "keep .threadroot ignored by git", expectedFiles: ["src/core/gitignore.ts", "test/doctor.test.ts"] },
  { id: "automation-policy", task: "approve safe automation", expectedFiles: ["src/core/automation.ts", "src/commands/automation.ts", "test/hardening.test.ts"] },
  { id: "connections", task: "add local github cli connection", expectedFiles: ["src/core/connections/index.ts", "src/commands/connections.ts", "test/connections.test.ts"] },
  { id: "tool-policy", task: "enforce connection allow deny policy", expectedFiles: ["src/core/tools/connection-policy.ts", "src/core/tools/authorize.ts", "test/tools.test.ts"] },
  { id: "tool-create", task: "create a safe wrapper tool", expectedFiles: ["src/core/tools/create.ts", "src/commands/tools.ts", "test/tools.test.ts"] },
  { id: "package-smoke", task: "verify package contents before npm publish", expectedFiles: ["scripts/package-smoke.mjs", "package.json", "test/cli-smoke.test.ts"] },
  { id: "release-docs", task: "update release documentation", expectedFiles: ["RELEASE.md", "CHANGELOG.md", "README.md"] },
  { id: "security-docs", task: "document security and trust boundaries", expectedFiles: ["SECURITY.md", "README.md"] },
  { id: "integration-docs", task: "explain MCP integration", expectedFiles: ["INTEGRATION.md", "README.md"] },
  { id: "compile-adapters", task: "compile provider adapters", expectedFiles: ["src/core/compile/index.ts", "src/core/compile/adapters/agents.ts", "test/compile.test.ts"] },
  { id: "claude-adapter", task: "fix Claude adapter output", expectedFiles: ["src/core/compile/adapters/claude.ts", "src/core/compile/adapters/shared.ts", "test/compile.test.ts"] },
  { id: "cursor-adapter", task: "fix Cursor adapter output", expectedFiles: ["src/core/compile/adapters/cursor.ts", "src/core/compile/adapters/shared.ts", "test/compile.test.ts"] },
  { id: "copilot-adapter", task: "fix Copilot instructions output", expectedFiles: ["src/core/compile/adapters/copilot.ts", "test/compile.test.ts"] },
  { id: "managed-block", task: "preserve managed blocks", expectedFiles: ["src/core/managed-block.ts", "src/core/compile/managed.ts", "test/hardening.test.ts"] },
  { id: "frontmatter", task: "parse skill frontmatter", expectedFiles: ["src/core/harness/frontmatter.ts", "src/core/harness/schema.ts", "test/harness-schema.test.ts"] },
  { id: "harness-load", task: "load effective harness objects", expectedFiles: ["src/core/harness/load.ts", "src/core/harness/index.ts", "test/harness-store.test.ts"] },
  { id: "memory", task: "append durable memory", expectedFiles: ["src/core/harness/memory.ts", "src/commands/memory.ts"] },
  { id: "status", task: "show harness status counts", expectedFiles: ["src/core/status.ts", "src/commands/status.ts", "test/harness-surface.test.ts"] },
  { id: "agent-providers", task: "add an agent provider", expectedFiles: ["src/core/agent-providers.ts", "src/core/connect.ts"] },
  { id: "seed-skills", task: "update built in seed skills", expectedFiles: ["src/core/init/seed-skills.ts", "test/skills.test.ts"] },
  { id: "skills-find", task: "find installable skills", expectedFiles: ["src/core/skills-find.ts", "src/commands/skills.ts", "test/skills-find.test.ts"] },
  { id: "snyk-scan", task: "integrate optional Snyk agent scan", expectedFiles: ["src/core/snyk-agent-scan.ts", "src/core/skills-install.ts", "test/skills-install.test.ts"] },
  { id: "install-source", task: "parse install source refs", expectedFiles: ["src/core/install/source.ts", "test/harness-schema.test.ts"] },
  { id: "install-fetch", task: "fetch GitHub skill sources", expectedFiles: ["src/core/install/fetch.ts", "src/core/skills-install.ts", "test/skills-install.test.ts"] },
  { id: "lockfile", task: "write lock file provenance", expectedFiles: ["src/core/install/lock.ts", ".threadroot/lock.json"] },
  { id: "json-output", task: "print JSON command output", expectedFiles: ["src/commands/json.ts", "test/cli-smoke.test.ts"] },
  { id: "version", task: "bump Threadroot version", expectedFiles: ["src/core/version.ts", "package.json"] },
  { id: "index", task: "build repo intelligence index", expectedFiles: ["src/core/repo-index.ts", "src/commands/indexer.ts"] },
  { id: "task-packet", task: "compile task packet with symbols and snippets", expectedFiles: ["src/core/task-packet.ts", "src/commands/task.ts"] },
  { id: "eval-context", task: "evaluate context retrieval quality", expectedFiles: ["src/core/context-evals.ts", "src/commands/eval.ts"] },
  { id: "embeddings", task: "configure optional embeddings", expectedFiles: ["src/core/embeddings.ts", "src/commands/embeddings.ts"] },
  { id: "mcp-resources", task: "expose MCP resources for latest task and index", expectedFiles: ["src/mcp/server.ts", "test/mcp-server.test.ts"] },
];

function atK(actual: string[], expected: string[], k: number): number {
  if (expected.length === 0) {
    return 1;
  }
  const top = new Set(actual.slice(0, k));
  return expected.filter((file) => top.has(file)).length / expected.length;
}

function precisionAtK(actual: string[], expected: string[], k: number): number {
  const top = actual.slice(0, k);
  if (top.length === 0) {
    return 0;
  }
  const expectedSet = new Set(expected);
  return top.filter((file) => expectedSet.has(file)).length / top.length;
}

function reciprocalRank(actual: string[], expected: string[]): number {
  const expectedSet = new Set(expected);
  const index = actual.findIndex((file) => expectedSet.has(file));
  return index === -1 ? 0 : 1 / (index + 1);
}

function ndcgAtK(actual: string[], expected: string[], k: number): number {
  const expectedSet = new Set(expected);
  const dcg = actual.slice(0, k).reduce((score, file, index) => score + (expectedSet.has(file) ? 1 / Math.log2(index + 2) : 0), 0);
  const ideal = expected.slice(0, k).reduce((score, _file, index) => score + 1 / Math.log2(index + 2), 0);
  return ideal === 0 ? 1 : dcg / ideal;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function fileExists(repoRoot: string, repoPath: string): Promise<boolean> {
  try {
    await access(path.join(repoRoot, repoPath));
    return true;
  } catch {
    return false;
  }
}

async function isApplicableCase(repoRoot: string, entry: ContextEvalCase): Promise<boolean> {
  const expected = [...entry.expectedFiles, ...(entry.expectedTests ?? [])];
  for (const repoPath of expected) {
    if (!(await fileExists(repoRoot, repoPath))) {
      return false;
    }
  }
  return true;
}

export async function runContextEvals(repoRoot: string, cases = DEFAULT_CONTEXT_EVALS): Promise<ContextEvalReport> {
  const results: ContextEvalCaseResult[] = [];
  const skippedCases: string[] = [];
  for (const entry of cases) {
    if (!(await isApplicableCase(repoRoot, entry))) {
      skippedCases.push(entry.id);
      continue;
    }
    const packet = await assembleTaskPacket(repoRoot, entry.task, { maxFiles: 12 });
    const topFiles = [...packet.files.map((file) => file.path), ...packet.tests.map((file) => file.path)];
    const expected = [...entry.expectedFiles, ...(entry.expectedTests ?? [])];
    const commands = packet.commands.map((command) => command.name);
    const skills = packet.recommendedSkills.map((skill) => skill.name);
    const mustNot = new Set(entry.mustNotRank ?? []);
    results.push({
      id: entry.id,
      task: entry.task,
      topFiles: topFiles.slice(0, 10),
      recallAt5: atK(topFiles, expected, 5),
      precisionAt5: precisionAtK(topFiles, expected, 5),
      mrr: reciprocalRank(topFiles, expected),
      ndcgAt5: ndcgAtK(topFiles, expected, 5),
      irrelevantTop5: topFiles.slice(0, 5).filter((file) => mustNot.has(file)).length,
      commandHit: (entry.expectedCommands ?? []).length === 0 || (entry.expectedCommands ?? []).some((command) => commands.includes(command)),
      skillHit: (entry.expectedSkills ?? []).length === 0 || (entry.expectedSkills ?? []).some((skill) => skills.includes(skill)),
      tokenEstimate: packet.tokenEstimate,
    });
  }
  return {
    cases: results,
    skippedCases,
    summary: {
      cases: results.length,
      skipped: skippedCases.length,
      recallAt5: average(results.map((entry) => entry.recallAt5)),
      precisionAt5: average(results.map((entry) => entry.precisionAt5)),
      mrr: average(results.map((entry) => entry.mrr)),
      ndcgAt5: average(results.map((entry) => entry.ndcgAt5)),
      irrelevantTop5: results.reduce((sum, entry) => sum + entry.irrelevantTop5, 0),
      commandHitRate: average(results.map((entry) => (entry.commandHit ? 1 : 0))),
      skillHitRate: average(results.map((entry) => (entry.skillHit ? 1 : 0))),
      averageTokens: average(results.map((entry) => entry.tokenEstimate)),
    },
  };
}
