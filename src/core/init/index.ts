import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ProfileId } from "../../types.js";
import { codexThreadrootPath, codexThreadrootRelativePath } from "../codex-state.js";
import { ensureCodexThreadrootGitignore, type GitignorePolicyResult } from "../gitignore.js";
import { readJson, inferProfile } from "../scan/package.js";
import { walkRepo } from "../scan/walk.js";
import { importVendorFiles, type ImportReport } from "./import.js";

const AGENTS_FILE = "AGENTS.md";
const MANAGED_BEGIN = "<!-- threadroot:begin codex-context-optimizer -->";
const MANAGED_END = "<!-- threadroot:end codex-context-optimizer -->";

export class InitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitError";
  }
}

export type InitOptions = {
  /** Refresh the Threadroot managed AGENTS.md block even when it already exists. */
  force?: boolean;
  /** Skip reading existing AGENTS.md prose for the init receipt. */
  import?: boolean;
  /** Compatibility option retained for older callers; ignored by the Codex-native initializer. */
  importFiles?: string[];
  /** Override the detected profile. */
  profile?: ProfileId;
  /** Compatibility option retained for older callers; Codex-native init does not compile adapters. */
  adapters?: unknown[];
  /** Compatibility option retained for older callers; .codex/threadroot is always added to root .gitignore. */
  gitignore?: boolean;
  home?: string;
};

export type InitReport = {
  name: string;
  profile: ProfileId;
  adapters: [];
  skills: [];
  tools: [];
  memory: [];
  rules: [];
  import?: ImportReport;
  importFiles: [];
  ignore: GitignorePolicyResult;
  compiled: string[];
  agentsPath: string;
  stateDir: string;
  receiptPath: string;
  nextSteps: Array<{ command: string; reason: string }>;
};

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function detectProfile(repoRoot: string, override?: ProfileId): Promise<ProfileId> {
  if (override) {
    return override;
  }
  const files = await walkRepo(repoRoot);
  const packageJson = await readJson(repoRoot, "package.json");
  const inferred = inferProfile(files, packageJson);
  return inferred === "unknown" ? "empty" : inferred;
}

async function detectName(repoRoot: string): Promise<string> {
  const packageJson = (await readJson(repoRoot, "package.json")) as { name?: unknown } | undefined;
  if (packageJson && typeof packageJson.name === "string" && packageJson.name.trim()) {
    return packageJson.name.trim();
  }
  return path.basename(repoRoot);
}

async function detectedCommands(repoRoot: string): Promise<Array<{ name: string; command: string }>> {
  const packageJson = await readJson(repoRoot, "package.json");
  const scripts =
    packageJson && typeof packageJson === "object" && typeof (packageJson as { scripts?: unknown }).scripts === "object"
      ? ((packageJson as { scripts: Record<string, unknown> }).scripts)
      : {};
  const packageManager =
    packageJson && typeof packageJson === "object" && typeof (packageJson as { packageManager?: unknown }).packageManager === "string"
      ? (packageJson as { packageManager: string }).packageManager
      : undefined;
  const runner = packageRunner(packageManager);
  const preferred = ["test", "typecheck", "lint", "build", "check"];
  return preferred
    .filter((name) => typeof scripts[name] === "string")
    .map((name) => ({ name, command: runner === "npm run" ? `npm run ${name}` : `${runner} ${name}` }));
}

function packageRunner(packageManager: string | undefined): string {
  if (packageManager?.startsWith("pnpm@")) return "pnpm";
  if (packageManager?.startsWith("yarn@")) return "yarn";
  if (packageManager?.startsWith("bun@")) return "bun";
  return "npm run";
}

function managedAgentsBlock(commands: Array<{ name: string; command: string }>): string {
  const verification =
    commands.length > 0
      ? commands.map((command) => `- ${command.name}: \`${command.command}\``)
      : ["- Use the narrowest existing test or check that proves the change."];

  return [
    MANAGED_BEGIN,
    "## Threadroot",
    "",
    "Use Threadroot as the Codex context optimizer for this repo.",
    "",
    "- Before broad exploration, run `threadroot prep \"<task>\" --memory tiny --json` or use MCP `context_budget`.",
    "- Read the returned `firstReads` before opening unrelated files.",
    "- Keep prompts small; prefer targeted files, compact failure summaries, and diff-focused follow-ups.",
    "- Store local optimizer evidence only under `.codex/threadroot/`; do not create or rely on `.threadroot/`.",
    "- After Codex changes code, run the narrowest relevant verification and inspect `threadroot score latest` when a run was recorded.",
    "",
    "Verification commands:",
    ...verification,
    MANAGED_END,
  ].join("\n");
}

function upsertManagedBlock(existing: string | undefined, block: string): string {
  if (!existing || !existing.trim()) {
    return `# AGENTS.md\n\n${block}\n`;
  }

  if (existing.includes(MANAGED_BEGIN) && existing.includes(MANAGED_END)) {
    const pattern = new RegExp(`${escapeRegExp(MANAGED_BEGIN)}[\\s\\S]*?${escapeRegExp(MANAGED_END)}`);
    return ensureTrailingNewline(existing.replace(pattern, block));
  }

  return ensureTrailingNewline(`${existing.trimEnd()}\n\n${block}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

async function ensureAgentsMd(repoRoot: string, commands: Array<{ name: string; command: string }>): Promise<string> {
  const filePath = path.join(repoRoot, AGENTS_FILE);
  const existing = await readTextIfExists(filePath);
  const desired = upsertManagedBlock(existing, managedAgentsBlock(commands));
  if (existing !== desired) {
    await writeFile(filePath, desired, "utf8");
  }
  return filePath;
}

async function ensureCodexStateDirs(repoRoot: string): Promise<void> {
  await Promise.all(
    ["briefs", "index", "runs", "scores", "tuning"].map((dir) => mkdir(codexThreadrootPath(repoRoot, dir), { recursive: true })),
  );
  const probe = codexThreadrootPath(repoRoot, ".init-write-check");
  try {
    await writeFile(probe, "ok\n", "utf8");
    await rm(probe, { force: true });
  } catch (error) {
    await rm(probe, { force: true }).catch(() => {});
    const code = (error as NodeJS.ErrnoException).code;
    throw new InitError(
      `Cannot write .codex/threadroot/ (${code ?? "unknown error"}). Fix directory permissions or remove the locked directory, then rerun threadroot init.`,
    );
  }
}

/**
 * Initialize Threadroot as a Codex-native context optimizer.
 *
 * This intentionally does not create `.threadroot/`, harness manifests, seed
 * tools, repo memory, or project skills. Persistent Codex guidance lives in
 * `AGENTS.md`; local optimizer evidence lives under `.codex/threadroot/`.
 */
export async function initHarness(repoRoot: string, options: InitOptions = {}): Promise<InitReport> {
  const legacyDir = path.join(repoRoot, ".threadroot");
  if ((await pathExists(legacyDir)) && !options.force) {
    throw new InitError("Legacy `.threadroot/` exists. Remove it or rerun `threadroot init --force` to migrate to `.codex/threadroot/`.");
  }
  if (options.force) {
    await rm(legacyDir, { recursive: true, force: true });
  }

  const profile = await detectProfile(repoRoot, options.profile);
  const name = await detectName(repoRoot);
  const commands = await detectedCommands(repoRoot);

  await ensureCodexStateDirs(repoRoot);
  const agentsPath = await ensureAgentsMd(repoRoot, commands);
  const ignore = await ensureCodexThreadrootGitignore(repoRoot);

  const report = options.import !== false ? await importVendorFiles(repoRoot, { include: options.importFiles }) : undefined;
  const receipt = {
    schemaVersion: 1,
    name,
    profile,
    initializedAt: new Date().toISOString(),
    agentsPath: AGENTS_FILE,
    stateDir: codexThreadrootRelativePath(),
    verificationCommands: commands,
    importedAgents: report?.canonicalSource,
    docs: [
      "https://developers.openai.com/codex/guides/agents-md",
      "https://developers.openai.com/codex/mcp",
      "https://developers.openai.com/codex/noninteractive",
    ],
  };
  const receiptPath = codexThreadrootPath(repoRoot, "init.json");
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  return {
    name,
    profile,
    adapters: [],
    skills: [],
    tools: [],
    memory: [],
    rules: [],
    import: report,
    importFiles: [],
    ignore,
    compiled: [agentsPath],
    agentsPath,
    stateDir: codexThreadrootPath(repoRoot),
    receiptPath,
    nextSteps: [
      {
        command: "threadroot codex install --refresh-skill",
        reason: "Refresh the global Codex skill and print the MCP setup command.",
      },
      {
        command: "threadroot prep \"<task>\" --memory tiny --json",
        reason: "Generate a small Codex-ready brief before broad repository exploration.",
      },
      {
        command: "threadroot codex doctor --json",
        reason: "Verify Codex CLI and Threadroot MCP setup.",
      },
    ],
  };
}
