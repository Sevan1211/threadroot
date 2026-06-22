import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { stringify as stringifyYaml } from "yaml";

import { AGENT_PROVIDERS, type AgentProviderId, parseAgentProviderList } from "./agent-providers.js";
import { parseFrontmatter } from "./harness/frontmatter.js";
import {
  projectHarnessDir,
  projectLockPath,
  projectManifestPath,
  projectObjectDir,
  userLockPath,
  userObjectDir,
} from "./harness/paths.js";
import { harnessManifestSchema, skillFrontmatterSchema } from "./harness/schema.js";
import { hashContent } from "./hash.js";
import { readLockFile, upsertLockEntry, writeLockFile } from "./install/lock.js";
import { fetchGitSource, type FetchedSource } from "./install/fetch.js";
import { type ExternalScannerReport, type LockEntry, type ObjectSourceRef, parseSourceRef } from "./install/source.js";
import { scanSkillPath, type SkillScanReport } from "./skills-scan.js";
import { runSnykAgentScan } from "./snyk-agent-scan.js";

export type SkillAddScope = "project" | "user";
export type SkillExposeAgent = AgentProviderId | "all" | "universal";

export type SkillAddOptions = {
  scope?: SkillAddScope;
  objectPath?: string;
  skillName?: string;
  all?: boolean;
  dryRun?: boolean;
  force?: boolean;
  strict?: boolean;
  expose?: string;
  home?: string;
  snyk?: boolean;
  requireSnyk?: boolean;
  snykCommand?: string;
  snykEnv?: NodeJS.ProcessEnv;
};

export type SkillCandidate = {
  name: string;
  description: string;
  objectPath: string;
  sourcePath: string;
  skillFilePath: string;
  directory: boolean;
  scan: SkillScanReport;
  externalScan?: ExternalScannerReport;
};

export type AddedSkill = {
  name: string;
  path: string;
  entry: LockEntry;
  scan: SkillScanReport;
  externalScan?: ExternalScannerReport;
};

export type SkillShimEntry = {
  agent: SkillExposeAgent;
  label: string;
  skill: string;
  path: string;
  status: "create" | "update" | "unchanged" | "skipped" | "removed" | "missing";
  message?: string;
};

export type SkillExposeResult = {
  entries: SkillShimEntry[];
};

export type SkillAddResult = {
  source: string;
  scope: SkillAddScope;
  harnessCreated: boolean;
  candidates: SkillCandidate[];
  installed: AddedSkill[];
  needsSelection: boolean;
  selectionCommands: string[];
  exposure?: SkillExposeResult;
};

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const THREADROOT_SKILL_SHIM_MARKER = "<!-- threadroot:managed external-skill-shim -->";

type SkillSourceInfo = {
  ref: ObjectSourceRef;
  skillName?: string;
  registry?: string;
  registryId?: string;
  installUrl?: string;
  auditUrl?: string;
};

function splitRef(body: string): { body: string; ref?: string } {
  const at = body.lastIndexOf("@");
  if (at > 0) {
    return { body: body.slice(0, at), ref: body.slice(at + 1) || undefined };
  }
  return { body };
}

function isLocalish(value: string): boolean {
  return value === "." || value === ".." || value.startsWith("./") || value.startsWith("../") || value.startsWith("/");
}

function parseGithubUrl(value: string): ObjectSourceRef | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    return undefined;
  }
  const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  const [owner, repo, marker, ref, ...rest] = parts;
  if (!owner || !repo) {
    return undefined;
  }
  if (marker === "tree" && ref) {
    return {
      kind: "git",
      raw: value,
      provider: "github",
      owner,
      repo,
      ref,
      objectPath: rest.length > 0 ? rest.join("/") : undefined,
    };
  }
  return { kind: "git", raw: value, provider: "github", owner, repo };
}

export function parseSkillsShSource(value: string): SkillSourceInfo | undefined {
  if (value.startsWith("skills:")) {
    const { body, ref } = splitRef(value.slice("skills:".length));
    const parts = body.split("/").filter(Boolean);
    const [owner, repo, skillName] = parts;
    if (!owner || !repo || !skillName || parts.length !== 3) {
      throw new Error("Invalid skills.sh source. Expected skills:owner/repo/skill.");
    }
    return {
      ref: { kind: "git", raw: value, provider: "github", owner, repo, ref },
      skillName,
      registry: "skills.sh",
      registryId: `${owner}/${repo}/${skillName}`,
      installUrl: `https://github.com/${owner}/${repo}`,
      auditUrl: `https://www.skills.sh/${owner}/${repo}/${skillName}`,
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.hostname !== "skills.sh" && url.hostname !== "www.skills.sh") {
    return undefined;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const [owner, repo, skillName] = parts;
  if (!owner || !repo || !skillName || parts.length !== 3) {
    return {
      ref: { kind: "registry", raw: value, name: parts.join("/") || value },
      registry: "skills.sh",
      registryId: parts.join("/") || undefined,
      auditUrl: value,
    };
  }
  return {
    ref: { kind: "git", raw: value, provider: "github", owner, repo },
    skillName,
    registry: "skills.sh",
    registryId: `${owner}/${repo}/${skillName}`,
    installUrl: `https://github.com/${owner}/${repo}`,
    auditUrl: value,
  };
}

function resolveSkillSource(rawSource: string, skillName?: string): SkillSourceInfo {
  const skillsSh = parseSkillsShSource(rawSource);
  if (skillsSh) {
    return { ...skillsSh, skillName: skillName ?? skillsSh.skillName };
  }
  return { ref: parseSkillAddSource(rawSource), skillName };
}

export function parseSkillAddSource(rawSource: string): ObjectSourceRef {
  const value = rawSource.trim();
  if (!value) {
    throw new Error("Empty skill source.");
  }
  if (value.startsWith("github:") || value.startsWith("git+") || value.startsWith("git@") || isLocalish(value)) {
    return parseSourceRef(value);
  }
  const githubUrl = parseGithubUrl(value);
  if (githubUrl) {
    return githubUrl;
  }

  const { body, ref } = splitRef(value);
  const parts = body.split("/").filter(Boolean);
  if (parts.length >= 2 && !value.includes(":")) {
    const [owner, repo, ...rest] = parts;
    return {
      kind: "git",
      raw: value,
      provider: "github",
      owner,
      repo,
      ref,
      objectPath: rest.length > 0 ? rest.join("/") : undefined,
    };
  }

  return parseSourceRef(value);
}

function safeRelativePath(objectPath: string): string {
  const normalized = path.normalize(objectPath);
  if (path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`Unsafe skill path: ${objectPath}`);
  }
  return normalized === "." ? "." : normalized.split(path.sep).join("/");
}

function resolveLocalSourceRoot(repoRoot: string, localPath: string): string {
  if (path.isAbsolute(localPath)) {
    throw new Error(`Refusing to install a skill from an absolute path: ${localPath}`);
  }
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, localPath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to install a skill from outside the repository: ${localPath}`);
  }
  return resolved;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readSkillCandidate(sourceRoot: string, objectPath: string): Promise<SkillCandidate | undefined> {
  const safePath = safeRelativePath(objectPath);
  const sourcePath = safePath === "." ? sourceRoot : path.join(sourceRoot, safePath);
  let info;
  try {
    info = await lstat(sourcePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  if (info.isSymbolicLink()) {
    throw new Error(`Refusing to inspect skill symlink: ${objectPath}`);
  }

  let skillFilePath: string;
  let scanTarget: string;
  let directory: boolean;
  if (info.isDirectory()) {
    skillFilePath = path.join(sourcePath, "SKILL.md");
    if (!(await exists(skillFilePath))) {
      return undefined;
    }
    scanTarget = sourcePath;
    directory = true;
  } else if (info.isFile() && path.basename(sourcePath) === "SKILL.md") {
    skillFilePath = sourcePath;
    scanTarget = path.dirname(sourcePath);
    directory = true;
  } else if (info.isFile() && path.extname(sourcePath).toLowerCase() === ".md") {
    skillFilePath = sourcePath;
    scanTarget = sourcePath;
    directory = false;
  } else {
    return undefined;
  }

  const raw = await readFile(skillFilePath, "utf8");
  const parsed = parseFrontmatter(raw);
  const frontmatter = skillFrontmatterSchema.parse(parsed.data);
  if (!NAME_RE.test(frontmatter.name)) {
    throw new Error(`Invalid skill name \`${frontmatter.name}\` (use lowercase letters, digits, and single hyphens).`);
  }
  if (directory && path.basename(path.dirname(skillFilePath)) !== frontmatter.name && safePath !== ".") {
    throw new Error(`Skill directory name must match SKILL.md name \`${frontmatter.name}\`: ${objectPath}`);
  }

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    objectPath: safePath,
    sourcePath,
    skillFilePath,
    directory,
    scan: await scanSkillPath(scanTarget),
  };
}

async function detectSkillCandidates(sourceRoot: string, repoName: string, explicitPath?: string): Promise<SkillCandidate[]> {
  if (explicitPath) {
    const candidate = await readSkillCandidate(sourceRoot, explicitPath);
    return candidate ? [candidate] : [];
  }

  const candidates: SkillCandidate[] = [];
  const seen = new Set<string>();
  async function add(objectPath: string): Promise<void> {
    const safePath = safeRelativePath(objectPath);
    if (seen.has(safePath)) {
      return;
    }
    const candidate = await readSkillCandidate(sourceRoot, safePath);
    if (candidate) {
      seen.add(safePath);
      candidates.push(candidate);
    }
  }

  await add(".");
  await add(repoName);

  for (const base of [
    "skills",
    ".agents/skills",
    ".claude/skills",
    ".cursor/skills",
    ".github/skills",
    ".gemini/skills",
    ".windsurf/skills",
    ".opencode/skills",
    ".agent/skills",
  ]) {
    const full = path.join(sourceRoot, base);
    if (!(await exists(full))) {
      continue;
    }
    const entries = await readdir(full, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        await add(path.posix.join(base, entry.name));
      } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
        await add(path.posix.join(base, entry.name));
      }
    }
  }

  return candidates;
}

async function detectNamedSkillCandidates(sourceRoot: string, repoName: string, skillName: string): Promise<SkillCandidate[]> {
  const candidates: SkillCandidate[] = [];
  const seen = new Set<string>();
  for (const objectPath of likelySkillObjectPaths(skillName, repoName)) {
    const safePath = safeRelativePath(objectPath);
    if (seen.has(safePath)) {
      continue;
    }
    seen.add(safePath);
    const candidate = await readSkillCandidate(sourceRoot, safePath);
    if (candidate && filterSkillCandidates([candidate], skillName).length > 0) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

async function hashDirectory(root: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update("threadroot-skill-directory-v1\n");
  async function walk(dir: string): Promise<void> {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === ".git") {
        continue;
      }
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isSymbolicLink()) {
        throw new Error(`Refusing to install skill directory with symlink: ${rel}`);
      }
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        hash.update(`file:${rel}\n`);
        hash.update(await readFile(full));
        hash.update("\n");
      }
    }
  }
  await walk(root);
  return hash.digest("hex");
}

async function copyDirectorySafe(source: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git") {
      continue;
    }
    const from = path.join(source, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing to install skill symlink: ${path.relative(source, from)}`);
    }
    if (entry.isDirectory()) {
      await copyDirectorySafe(from, to);
    } else if (entry.isFile()) {
      await mkdir(path.dirname(to), { recursive: true });
      await writeFile(to, await readFile(from));
    }
  }
}

async function copyRootSkillPayload(source: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  await writeFile(path.join(dest, "SKILL.md"), await readFile(path.join(source, "SKILL.md")));
  for (const dirname of ["references", "scripts", "assets", "evals"]) {
    const from = path.join(source, dirname);
    if (await exists(from)) {
      await copyDirectorySafe(from, path.join(dest, dirname));
    }
  }
}

async function ensureMinimalHarness(repoRoot: string): Promise<boolean> {
  if (await exists(projectManifestPath(repoRoot))) {
    return false;
  }
  let name = path.basename(repoRoot);
  try {
    const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as { name?: unknown };
    if (typeof packageJson.name === "string" && packageJson.name.trim()) {
      name = packageJson.name.trim();
    }
  } catch {
    // package.json is optional.
  }
  const manifest = harnessManifestSchema.parse({
    name,
    version: 1,
    profile: "empty",
    adapters: [],
    automation: { mode: "ask" },
  });
  await mkdir(projectHarnessDir(repoRoot), { recursive: true });
  await writeFile(projectManifestPath(repoRoot), stringifyYaml(manifest), "utf8");
  return true;
}

function destinationDir(repoRoot: string, scope: SkillAddScope, name: string, home?: string): string {
  return scope === "user" ? path.join(userObjectDir("skills", home), name) : path.join(projectObjectDir(repoRoot, "skills"), name);
}

async function installCandidate(
  repoRoot: string,
  candidate: SkillCandidate,
  ref: ObjectSourceRef,
  options: {
    scope: SkillAddScope;
    sourceRaw: string;
    resolved?: string;
    refLabel?: string;
    registry?: string;
    registryId?: string;
    installUrl?: string;
    auditUrl?: string;
    force?: boolean;
    home?: string;
  },
): Promise<AddedSkill> {
  const dest = destinationDir(repoRoot, options.scope, candidate.name, options.home);
  if ((await exists(dest)) && !options.force) {
    throw new Error(`Skill \`${candidate.name}\` already exists at ${dest}. Re-run with --force to replace it.`);
  }
  if (candidate.scan.blocked) {
    throw new Error(`Skill \`${candidate.name}\` is blocked by scan findings and was not installed.`);
  }
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  if (candidate.directory) {
    const sourceDir = path.basename(candidate.skillFilePath) === "SKILL.md" ? path.dirname(candidate.skillFilePath) : candidate.sourcePath;
    if (candidate.objectPath === ".") {
      await copyRootSkillPayload(sourceDir, dest);
    } else {
      await copyDirectorySafe(sourceDir, dest);
    }
  } else {
    await cp(candidate.skillFilePath, path.join(dest, "SKILL.md"));
  }

  const integrity = `sha256:${candidate.directory ? await hashDirectory(dest) : hashContent(await readFile(path.join(dest, "SKILL.md"), "utf8"))}`;
  const entry: LockEntry = {
    name: candidate.name,
    kind: "skill",
    sourceKind: ref.kind,
    source: options.sourceRaw,
    objectPath: candidate.objectPath,
    ref: options.refLabel,
    resolved: options.resolved,
    integrity,
    risk: candidate.scan.risk,
    registry: options.registry,
    registryId: options.registryId,
    installUrl: options.installUrl,
    auditUrl: options.auditUrl,
    externalScan: candidate.externalScan,
    reviewed: false,
    installedAt: new Date().toISOString(),
  };
  const lockPath = options.scope === "user" ? userLockPath(options.home) : projectLockPath(repoRoot);
  const lock = await readLockFile(lockPath);
  await writeLockFile(lockPath, upsertLockEntry(lock, entry));
  return { name: candidate.name, path: dest, entry, scan: candidate.scan, externalScan: candidate.externalScan };
}

function sourceRepoName(ref: ObjectSourceRef, sourceRoot: string): string {
  if (ref.kind === "git" && ref.repo) {
    return ref.repo.replace(/\.git$/, "");
  }
  return path.basename(sourceRoot);
}

function selectionCommand(source: string, candidate: SkillCandidate): string {
  return `threadroot skills add ${source} --skill ${candidate.name}`;
}

function exactPathSelectionCommand(source: string, candidate: SkillCandidate): string {
  return `threadroot skills add ${source} --path ${candidate.objectPath}`;
}

function likelySkillObjectPaths(skillName: string, repoName: string): string[] {
  return [
    skillName,
    path.posix.join(repoName, skillName),
    path.posix.join("skills", skillName),
    path.posix.join(".agents/skills", skillName),
    path.posix.join(".claude/skills", skillName),
    path.posix.join(".cursor/skills", skillName),
    path.posix.join(".github/skills", skillName),
    path.posix.join(".gemini/skills", skillName),
    path.posix.join(".windsurf/skills", skillName),
    path.posix.join(".opencode/skills", skillName),
    path.posix.join(".agent/skills", skillName),
  ];
}

function filterSkillCandidates(candidates: SkillCandidate[], skillName: string): SkillCandidate[] {
  const wanted = skillName.toLowerCase();
  return candidates.filter((candidate) => {
    const leaf = candidate.objectPath.split("/").filter(Boolean).at(-1)?.toLowerCase();
    return candidate.name.toLowerCase() === wanted || leaf === wanted;
  });
}

function snykTarget(candidate: SkillCandidate): string {
  if (candidate.directory && candidate.objectPath !== ".") {
    return candidate.sourcePath;
  }
  return candidate.skillFilePath;
}

async function attachExternalScans(
  candidates: SkillCandidate[],
  options: SkillAddOptions,
): Promise<SkillCandidate[]> {
  if (options.snyk === false) {
    return candidates.map((candidate) => ({
      ...candidate,
      externalScan: {
        provider: "snyk-agent-scan",
        status: "skipped",
        reason: "Snyk Agent Scan disabled for this command.",
        scannedAt: new Date().toISOString(),
      },
    }));
  }

  const scanned: SkillCandidate[] = [];
  for (const candidate of candidates) {
    scanned.push({
      ...candidate,
      externalScan: await runSnykAgentScan(snykTarget(candidate), {
        required: options.requireSnyk,
        command: options.snykCommand,
        env: options.snykEnv,
      }),
    });
  }
  return scanned;
}

export async function addSkill(repoRoot: string, rawSource: string, options: SkillAddOptions = {}): Promise<SkillAddResult> {
  if (options.objectPath && options.skillName) {
    throw new Error("Use either --path or --skill, not both.");
  }
  if (options.all && options.skillName) {
    throw new Error("Use either --all or --skill, not both.");
  }

  const source = resolveSkillSource(rawSource, options.skillName);
  const ref = source.ref;
  if (ref.kind === "registry") {
    throw new Error(
      source.registry === "skills.sh"
        ? `This skills.sh source is not GitHub-backed or cannot be resolved locally yet: ${rawSource}`
        : `Registry skill sources are not available yet: ${rawSource}`,
    );
  }

  const scope = options.scope ?? "project";
  let fetched: FetchedSource | undefined;
  let sourceRoot: string;
  let refLabel: string | undefined;
  let resolved: string | undefined;
  const explicitPath = options.objectPath ?? (ref.kind === "git" ? ref.objectPath : undefined);

  if (ref.kind === "git") {
    fetched = await fetchGitSource(ref);
    sourceRoot = fetched.dir;
    refLabel = ref.ref;
    resolved = fetched.sha;
  } else {
    sourceRoot = resolveLocalSourceRoot(repoRoot, ref.path);
  }

  try {
    const repoName = sourceRepoName(ref, sourceRoot);
    const exactCandidates =
      source.skillName && !explicitPath
        ? await detectNamedSkillCandidates(sourceRoot, repoName, source.skillName)
        : [];
    const detectedCandidates =
      exactCandidates.length > 0 ? exactCandidates : await detectSkillCandidates(sourceRoot, repoName, explicitPath);
    const candidates = source.skillName ? filterSkillCandidates(detectedCandidates, source.skillName) : detectedCandidates;
    const selectionCommands = detectedCandidates.map((candidate) => {
      const duplicates = detectedCandidates.filter((entry) => entry.name === candidate.name).length > 1;
      return duplicates ? exactPathSelectionCommand(rawSource, candidate) : selectionCommand(rawSource, candidate);
    });
    if (candidates.length === 0) {
      if (source.skillName && detectedCandidates.length > 0) {
        throw new Error(
          `No Agent Skill named \`${source.skillName}\` found. Detected: ${detectedCandidates.map((candidate) => candidate.name).join(", ")}.`,
        );
      }
      throw new Error("No Agent Skill found. Expected a SKILL.md file or a skills/<name>/SKILL.md directory.");
    }
    if (candidates.length > 1 && !options.all) {
      return {
        source: rawSource,
        scope,
        harnessCreated: false,
        candidates,
        installed: [],
        needsSelection: true,
        selectionCommands,
      };
    }

    const selectedCandidates = await attachExternalScans(candidates, options);

    if (options.requireSnyk) {
      const missingSnyk = selectedCandidates.find(
        (candidate) => candidate.externalScan?.status !== "passed",
      );
      if (missingSnyk) {
        throw new Error(
          `Required Snyk Agent Scan did not pass for \`${missingSnyk.name}\`: ${missingSnyk.externalScan?.reason ?? missingSnyk.externalScan?.status ?? "unknown"}.`,
        );
      }
    }

    if (options.strict) {
      const risky = selectedCandidates.find((candidate) => candidate.scan.risk !== "low");
      if (risky) {
        throw new Error(`Strict mode blocked skill \`${risky.name}\` with scan risk \`${risky.scan.risk}\`.`);
      }
    }

    if (options.dryRun) {
      return {
        source: rawSource,
        scope,
        harnessCreated: false,
        candidates: selectedCandidates,
        installed: [],
        needsSelection: false,
        selectionCommands,
      };
    }

    const harnessCreated = await ensureMinimalHarness(repoRoot);
    const installed: AddedSkill[] = [];
    for (const candidate of selectedCandidates) {
      installed.push(
        await installCandidate(repoRoot, candidate, ref, {
          scope,
          sourceRaw: rawSource,
          resolved,
          refLabel,
          force: options.force,
          home: options.home,
          registry: source.registry,
          registryId: source.registryId,
          installUrl: source.installUrl,
          auditUrl: source.auditUrl,
        }),
      );
    }

    const exposure = options.expose
      ? await exposeSkills(repoRoot, {
          skill: installed.map((skill) => skill.name).join(","),
          agents: options.expose,
          force: options.force,
        })
      : undefined;

    return {
      source: rawSource,
      scope,
      harnessCreated,
      candidates: selectedCandidates,
      installed,
      needsSelection: false,
      selectionCommands,
      exposure,
    };
  } finally {
    await fetched?.cleanup();
  }
}

function providerTargets(agents: string | undefined): Array<{ id: SkillExposeAgent; label: string; dir: string }> {
  const raw = agents?.trim() || "universal";
  if (raw === "universal") {
    return [{ id: "universal", label: "Universal Agent Skills", dir: path.join(".agents", "skills") }];
  }
  return parseAgentProviderList(raw, ["codex"]).map((id) => ({
    id,
    label: AGENT_PROVIDERS[id].label,
    dir: AGENT_PROVIDERS[id].projectSkillDir,
  }));
}

function skillShimContent(name: string, description: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    THREADROOT_SKILL_SHIM_MARKER,
    "",
    `# ${name}`,
    "",
    "This provider-native skill is a thin Threadroot shim.",
    "",
    `Canonical skill: \`.threadroot/skills/${name}/SKILL.md\``,
    "",
    "Before using this skill, read the canonical Threadroot skill file and follow its instructions.",
    "Do not treat this shim as the source of truth.",
    "",
  ].join("\n");
}

export async function exposeSkills(
  repoRoot: string,
  options: { skill: string; agents?: string; force?: boolean; dryRun?: boolean; undo?: boolean },
): Promise<SkillExposeResult> {
  const { resolveHarness } = await import("./harness/load.js");
  const harness = await resolveHarness(repoRoot);
  const names = options.skill === "all" ? harness.skills.map((skill) => skill.name) : options.skill.split(",").map((name) => name.trim());
  const entries: SkillShimEntry[] = [];

  for (const skillName of names.filter(Boolean)) {
    const skill = harness.skills.find((entry) => entry.name === skillName);
    if (!skill) {
      entries.push({
        agent: "universal",
        label: "Universal Agent Skills",
        skill: skillName,
        path: "",
        status: "missing",
        message: `Unknown skill: ${skillName}`,
      });
      continue;
    }
    for (const target of providerTargets(options.agents)) {
      const relativePath = path.join(target.dir, skill.name, "SKILL.md");
      const absolutePath = path.join(repoRoot, relativePath);
      if (options.undo) {
        const existing = await exists(absolutePath) ? await readFile(absolutePath, "utf8") : undefined;
        if (!existing) {
          entries.push({ agent: target.id, label: target.label, skill: skill.name, path: relativePath, status: "missing" });
        } else if (!existing.includes(THREADROOT_SKILL_SHIM_MARKER)) {
          entries.push({
            agent: target.id,
            label: target.label,
            skill: skill.name,
            path: relativePath,
            status: "skipped",
            message: "Existing provider skill is not Threadroot-managed.",
          });
        } else if (options.dryRun) {
          entries.push({ agent: target.id, label: target.label, skill: skill.name, path: relativePath, status: "removed" });
        } else {
          await rm(path.dirname(absolutePath), { recursive: true, force: true });
          entries.push({ agent: target.id, label: target.label, skill: skill.name, path: relativePath, status: "removed" });
        }
        continue;
      }

      const desired = skillShimContent(skill.name, skill.frontmatter.description);
      const existing = await exists(absolutePath) ? await readFile(absolutePath, "utf8") : undefined;
      if (existing === desired) {
        entries.push({ agent: target.id, label: target.label, skill: skill.name, path: relativePath, status: "unchanged" });
      } else if (existing && !existing.includes(THREADROOT_SKILL_SHIM_MARKER) && !options.force) {
        entries.push({
          agent: target.id,
          label: target.label,
          skill: skill.name,
          path: relativePath,
          status: "skipped",
          message: "Existing provider skill is not Threadroot-managed. Re-run with --force to replace it.",
        });
      } else {
        const statusValue = existing ? "update" : "create";
        if (!options.dryRun) {
          await mkdir(path.dirname(absolutePath), { recursive: true });
          await writeFile(absolutePath, desired, "utf8");
        }
        entries.push({ agent: target.id, label: target.label, skill: skill.name, path: relativePath, status: statusValue });
      }
    }
  }

  return { entries };
}

export async function trustSkill(
  repoRoot: string,
  name: string,
  options: { scope?: SkillAddScope; home?: string } = {},
): Promise<LockEntry> {
  const lockPath = options.scope === "user" ? userLockPath(options.home) : projectLockPath(repoRoot);
  const lock = await readLockFile(lockPath);
  const entry = lock.objects.find((item) => item.kind === "skill" && item.name === name);
  if (!entry) {
    throw new Error(`No installed skill named \`${name}\` found in ${options.scope ?? "project"} lockfile.`);
  }
  const updated = { ...entry, reviewed: true };
  await writeLockFile(lockPath, upsertLockEntry(lock, updated));
  return updated;
}
