import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { runCompile } from "../compile/write.js";
import { serializeFrontmatter } from "../harness/frontmatter.js";
import {
  type AdapterId,
  type HarnessManifest,
  harnessManifestSchema,
  projectHarnessDir,
  projectManifestPath,
  projectObjectDir,
} from "../harness/index.js";
import { detectToolCandidates } from "../tools/catalog.js";
import { ToolCreateError, createTool } from "../tools/create.js";
import { inferProfile, readJson } from "../scan/package.js";
import { walkRepo } from "../scan/walk.js";
import { stringify as stringifyYaml } from "yaml";
import type { ProfileId } from "../../types.js";
import { exposeProject } from "../expose.js";
import { PROJECT_MEMORY_TEMPLATE, writeSeedSkills } from "./builtins.js";
import { type ImportReport, importVendorFiles } from "./import.js";

const DEFAULT_ADAPTERS: AdapterId[] = [];
const AGENTS_FILE = "AGENTS.md";

export class InitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitError";
  }
}

export type InitOptions = {
  /** Re-initialize over an existing harness. */
  force?: boolean;
  /** Skip importing existing vendor files (blank-slate init). */
  import?: boolean;
  /** Restrict the import to specific vendor files. */
  importFiles?: string[];
  /** Override the detected profile. */
  profile?: ProfileId;
  /** Enable legacy compiled adapter outputs. Defaults to local-only. */
  adapters?: AdapterId[];
  /** Write thin provider project skill shims after init. */
  expose?: string;
  home?: string;
};

export type InitReport = {
  name: string;
  profile: ProfileId;
  adapters: AdapterId[];
  skills: string[];
  tools: string[];
  memory: string[];
  rules: string[];
  import?: ImportReport;
  compiled: string[];
  exposed: string[];
};

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
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

async function writeManifest(repoRoot: string, manifest: HarnessManifest): Promise<void> {
  const body: Record<string, unknown> = {
    name: manifest.name,
    version: manifest.version,
    profile: manifest.profile,
    adapters: manifest.adapters,
    automation: manifest.automation,
  };
  if (manifest.tools.allow.length > 0) {
    body.tools = { allow: manifest.tools.allow };
  }
  await mkdir(projectHarnessDir(repoRoot), { recursive: true });
  await writeFile(projectManifestPath(repoRoot), stringifyYaml(body), "utf8");
}

async function writeProjectMemory(repoRoot: string): Promise<string[]> {
  const dir = projectObjectDir(repoRoot, "memory");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "project.md");
  try {
    await writeFile(filePath, `${PROJECT_MEMORY_TEMPLATE}\n`, { encoding: "utf8", flag: "wx" });
    return [filePath];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return [];
    }
    throw error;
  }
}

async function writeImportedRules(repoRoot: string, report: ImportReport): Promise<string[]> {
  if (report.importedRules.length === 0) {
    return [];
  }
  const dir = projectObjectDir(repoRoot, "rules");
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const rule of report.importedRules) {
    const filePath = path.join(dir, `${rule.name}.md`);
    const data: Record<string, unknown> = { name: rule.name, scope: "project" };
    if (rule.applyTo) {
      data.applyTo = rule.applyTo;
    }
    try {
      await writeFile(filePath, serializeFrontmatter(data, rule.body), { encoding: "utf8", flag: "wx" });
      written.push(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }
  return written;
}

async function writeStarterTools(repoRoot: string, profile: ProfileId, force: boolean): Promise<string[]> {
  const candidates = await detectToolCandidates(repoRoot, profile);
  const names: string[] = [];
  for (const candidate of candidates) {
    try {
      await createTool(
        repoRoot,
        {
          name: candidate.name,
          description: candidate.description,
          run: candidate.run,
          risk: candidate.risk,
          confirm: candidate.confirm,
        },
        { actor: "human", force },
      );
      names.push(candidate.name);
    } catch (error) {
      if (error instanceof ToolCreateError) {
        continue; // tool already exists; leave it untouched
      }
      throw error;
    }
  }
  return names;
}

/**
 * Scaffold a Threadroot harness for the repo (spec §6.1, §12): detect the
 * profile, seed built-in skills + starter tools + memory, import existing vendor
 * files once, then optionally compile canonical -> vendor outputs. Idempotent-friendly:
 * refuses to clobber an existing harness unless `force` is set.
 */
export async function initHarness(repoRoot: string, options: InitOptions = {}): Promise<InitReport> {
  if (!options.force && (await pathExists(projectManifestPath(repoRoot)))) {
    throw new InitError(
      `A harness already exists at ${path.join(".threadroot", "harness.yaml")}. Re-run with --force to overwrite.`,
    );
  }

  const profile = await detectProfile(repoRoot, options.profile);
  const name = await detectName(repoRoot);
  const adapters = options.adapters ?? DEFAULT_ADAPTERS;

  const tools = await writeStarterTools(repoRoot, profile, options.force ?? false);
  const skills = await writeSeedSkills(repoRoot);
  const memory = await writeProjectMemory(repoRoot);

  const manifest = harnessManifestSchema.parse({
    name,
    version: 1,
    profile,
    adapters,
    tools: { allow: tools },
    automation: { mode: "ask" },
  });
  await writeManifest(repoRoot, manifest);

  let report: ImportReport | undefined;
  let rules: string[] = [];
  if (options.import !== false) {
    report = await importVendorFiles(repoRoot, { include: options.importFiles });
    if (report.canonicalBody.trim()) {
      await writeFile(path.join(repoRoot, AGENTS_FILE), `${report.canonicalBody.trim()}\n`, "utf8");
    }
    rules = await writeImportedRules(repoRoot, report);
  }

  const { written } = await runCompile(repoRoot, { home: options.home });
  const exposed = options.expose
    ? (await exposeProject(repoRoot, { agents: options.expose })).entries
        .filter((entry) => entry.status !== "missing" && entry.status !== "skipped")
        .map((entry) => entry.path)
    : [];

  return { name, profile, adapters, skills, tools, memory, rules, import: report, compiled: written, exposed };
}
