import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { parseFrontmatter } from "./harness/frontmatter.js";
import {
  type EffectiveHarness,
  HarnessError,
  type LoadedSkill,
  skillFrontmatterSchema,
  resolveHarness,
} from "./harness/index.js";

export type SkillValidationFinding = {
  severity: "error" | "warning";
  skill: string;
  message: string;
  path: string;
};

export type SkillValidationReport = {
  ok: boolean;
  findings: SkillValidationFinding[];
};

export type SkillInspection = {
  name: string;
  description: string;
  path: string;
  references: string[];
  scripts: string[];
  assets: string[];
  evals: string[];
  allowedTools?: string | string[];
};

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;
const MIN_DESCRIPTION_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_BODY_LINES = 500;
const LINK_RE = /\]\(([^)]+)\)/g;

function finding(
  severity: "error" | "warning",
  skill: LoadedSkill,
  message: string,
): SkillValidationFinding {
  return { severity, skill: skill.name, message, path: skill.sourcePath };
}

export function validateResolvedSkills(harness: EffectiveHarness): SkillValidationReport {
  const findings: SkillValidationFinding[] = [];

  for (const skill of harness.skills) {
    if (!SKILL_NAME_RE.test(skill.name)) {
      findings.push(finding("error", skill, "Skill names must use lowercase letters, digits, and hyphens."));
    }

    if (path.basename(skill.sourcePath) === "SKILL.md") {
      const folderName = path.basename(path.dirname(skill.sourcePath));
      if (folderName !== skill.name) {
        findings.push(finding("error", skill, "Folder-based skill directory must match frontmatter `name`."));
      }
    }

    if (skill.frontmatter.description.length < MIN_DESCRIPTION_LENGTH) {
      findings.push(
        finding(
          "warning",
          skill,
          "Skill description is short; include what the skill does and concrete trigger contexts.",
        ),
      );
    }

    if (skill.frontmatter.description.length > MAX_DESCRIPTION_LENGTH) {
      findings.push(finding("error", skill, "Skill description must be 1024 characters or less."));
    }

    if (!/\b(use when|when|reviewing|writing|designing|debugging|creating)\b/i.test(skill.frontmatter.description)) {
      findings.push(
        finding(
          "warning",
          skill,
          "Skill description should include trigger language so agents know when to load it.",
        ),
      );
    }

    if (skill.body.trim().length === 0) {
      findings.push(finding("error", skill, "Skill body must not be empty."));
    }

    if (skill.body.split(/\r?\n/).length > MAX_BODY_LINES) {
      findings.push(
        finding(
          "warning",
          skill,
          "Skill body is long; move variant details into references for progressive disclosure.",
        ),
      );
    }

    if (skill.frontmatter.allowedTools) {
      findings.push(
        finding(
          "warning",
          skill,
          "Skill declares allowed tools; inspect tool permissions before trusting external installs.",
        ),
      );
    }
  }

  return { ok: findings.every((entry) => entry.severity !== "error"), findings };
}

function pushPathFinding(
  findings: SkillValidationFinding[],
  severity: "error" | "warning",
  skill: LoadedSkill,
  message: string,
  pathValue = skill.sourcePath,
): void {
  findings.push({ severity, skill: skill.name, message, path: pathValue });
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

async function validateSkillDirectory(skill: LoadedSkill): Promise<SkillValidationFinding[]> {
  if (path.basename(skill.sourcePath) !== "SKILL.md") {
    return [];
  }

  const findings: SkillValidationFinding[] = [];
  const skillDir = path.dirname(skill.sourcePath);
  const referencesDir = path.join(skillDir, "references");
  const scriptsDir = path.join(skillDir, "scripts");
  const evalsDir = path.join(skillDir, "evals");

  if (await exists(scriptsDir)) {
    pushPathFinding(
      findings,
      "warning",
      skill,
      "Skill includes scripts; inspect scripts before trusting external installs.",
      scriptsDir,
    );
  }

  for (const match of skill.body.matchAll(LINK_RE)) {
    const target = match[1] ?? "";
    if (/^[a-z]+:\/\//i.test(target) || target.startsWith("#")) {
      continue;
    }
    if (path.isAbsolute(target) || target.split(/[\\/]/).includes("..")) {
      pushPathFinding(findings, "error", skill, `Skill link must stay inside the skill directory: ${target}`);
      continue;
    }
    const resolved = path.join(skillDir, target);
    if (!(await exists(resolved))) {
      pushPathFinding(findings, "error", skill, `Skill links to missing file: ${target}`);
    }
    const segments = target.split(/[\\/]/).filter(Boolean);
    if (segments[0] === "references" && segments.length > 2) {
      pushPathFinding(findings, "warning", skill, `Reference links should stay one level deep: ${target}`);
    }
  }

  if (await exists(referencesDir)) {
    const references = await readdir(referencesDir, { withFileTypes: true });
    for (const entry of references) {
      if (!entry.isFile()) {
        continue;
      }
      const filePath = path.join(referencesDir, entry.name);
      const body = await readFile(filePath, "utf8");
      if (!body.trim()) {
        pushPathFinding(findings, "error", skill, "Reference file must not be empty.", filePath);
      }
    }
  }

  if (await exists(evalsDir)) {
    const triggersPath = path.join(evalsDir, "triggers.json");
    if (!(await exists(triggersPath))) {
      pushPathFinding(findings, "warning", skill, "Skill evals directory should include triggers.json.", evalsDir);
    } else {
      const parsed = JSON.parse(await readFile(triggersPath, "utf8")) as unknown;
      const value = parsed as { shouldTrigger?: unknown[]; shouldNotTrigger?: unknown[] };
      if (!Array.isArray(value.shouldTrigger) || value.shouldTrigger.length === 0) {
        pushPathFinding(findings, "error", skill, "evals/triggers.json must include non-empty shouldTrigger.");
      }
      if (!Array.isArray(value.shouldNotTrigger) || value.shouldNotTrigger.length === 0) {
        pushPathFinding(findings, "error", skill, "evals/triggers.json must include non-empty shouldNotTrigger.");
      }
    }
  }

  return findings;
}

export async function validateResolvedSkillsDeep(harness: EffectiveHarness): Promise<SkillValidationReport> {
  const shallow = validateResolvedSkills(harness);
  const findings = [...shallow.findings];
  for (const skill of harness.skills) {
    findings.push(...(await validateSkillDirectory(skill)));
  }
  return { ok: findings.every((entry) => entry.severity !== "error"), findings };
}

async function loadSkillFile(filePath: string, origin: "project" | "user" = "project"): Promise<LoadedSkill> {
  const raw = await readFile(filePath, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const result = skillFrontmatterSchema.safeParse(data);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
    throw new HarnessError(`Invalid skill ${filePath}: ${detail}`);
  }
  return {
    name: result.data.name,
    origin,
    sourcePath: filePath,
    frontmatter: result.data,
    body,
  };
}

async function loadSkillsAtPath(targetPath: string): Promise<LoadedSkill[]> {
  const info = await stat(targetPath);
  if (info.isFile()) {
    return [await loadSkillFile(targetPath)];
  }

  const directSkill = path.join(targetPath, "SKILL.md");
  try {
    return [await loadSkillFile(directSkill)];
  } catch (error) {
    if (!(error instanceof HarnessError) && (error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    if (error instanceof HarnessError) {
      throw error;
    }
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  const skills: LoadedSkill[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(targetPath, entry.name);
    if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
      skills.push(await loadSkillFile(full));
    }
    if (entry.isDirectory()) {
      const skillPath = path.join(full, "SKILL.md");
      try {
        skills.push(await loadSkillFile(skillPath));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  }
  return skills;
}

async function listFilesIfDir(dir: string): Promise<string[]> {
  if (!(await exists(dir))) {
    return [];
  }
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

export async function inspectSkillPath(targetPath: string): Promise<SkillInspection> {
  const skills = await loadSkillsAtPath(targetPath);
  if (skills.length !== 1) {
    throw new HarnessError(`Expected exactly one skill at ${targetPath}; found ${skills.length}.`);
  }
  const skill = skills[0]!;
  const skillDir = path.dirname(skill.sourcePath);
  return {
    name: skill.name,
    description: skill.frontmatter.description,
    path: skill.sourcePath,
    references: await listFilesIfDir(path.join(skillDir, "references")),
    scripts: await listFilesIfDir(path.join(skillDir, "scripts")),
    assets: await listFilesIfDir(path.join(skillDir, "assets")),
    evals: await listFilesIfDir(path.join(skillDir, "evals")),
    allowedTools: skill.frontmatter.allowedTools,
  };
}

export async function validateSkillPath(targetPath: string): Promise<SkillValidationReport> {
  try {
    const harness: EffectiveHarness = {
      manifest: {
        name: "skill-path",
        version: 1,
        profile: "empty",
        adapters: ["agents"],
        references: [],
        memory: { budget: {} },
        tools: { allow: [] },
      },
      skills: await loadSkillsAtPath(targetPath),
      rules: [],
      tools: [],
      connections: [],
      memory: [],
    };
    return await validateResolvedSkillsDeep(harness);
  } catch (error) {
    if (error instanceof HarnessError || error instanceof Error) {
      return {
        ok: false,
        findings: [
          {
            severity: "error",
            skill: "<path>",
            path: targetPath,
            message: error.message,
          },
        ],
      };
    }
    throw error;
  }
}

export async function validateSkills(repoRoot: string, options: { home?: string } = {}): Promise<SkillValidationReport> {
  try {
    return await validateResolvedSkillsDeep(await resolveHarness(repoRoot, { home: options.home }));
  } catch (error) {
    if (error instanceof HarnessError) {
      return {
        ok: false,
        findings: [
          {
            severity: "error",
            skill: "<harness>",
            path: repoRoot,
            message: error.message,
          },
        ],
      };
    }
    throw error;
  }
}
