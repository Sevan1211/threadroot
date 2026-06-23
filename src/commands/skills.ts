import { HarnessError, resolveHarness } from "../core/harness/index.js";
import { assembleContext } from "../core/harness/context.js";
import { toRepoPath } from "../core/paths.js";
import { findSkills } from "../core/skills-find.js";
import { addSkill, trustSkill, type SkillAddOptions } from "../core/skills-install.js";
import { scanSkillPath } from "../core/skills-scan.js";
import { inspectSkillPath, validateSkillPath, validateSkills } from "../core/skills.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type SkillsValidateOptions = JsonCliOptions & {
  path?: string;
};

export type SkillsListOptions = JsonCliOptions;
export type SkillsInspectOptions = JsonCliOptions;
export type SkillsScanOptions = JsonCliOptions;
export type SkillsFindOptions = JsonCliOptions;
export type SkillsMatchOptions = JsonCliOptions;
export type SkillsIngestOptions = JsonCliOptions & {
  user?: boolean;
  path?: string;
  skill?: string;
  all?: boolean;
  dryRun?: boolean;
  force?: boolean;
  strict?: boolean;
  snyk?: boolean;
  requireSnyk?: boolean;
};
export type SkillsTrustOptions = JsonCliOptions & {
  user?: boolean;
};

function printScan(report: Awaited<ReturnType<typeof scanSkillPath>>): void {
  console.log(`scan risk: ${report.risk}`);
  if (report.findings.length === 0) {
    console.log("scan findings: none");
    return;
  }
  for (const finding of report.findings) {
    const suffix = finding.path ? ` (${finding.path})` : "";
    console.log(`- ${finding.risk} ${finding.code}: ${finding.message}${suffix}`);
  }
}

function formatExternalScan(scan: { provider: string; status: string; reason?: string; summary?: string } | undefined): string {
  if (!scan) {
    return "not run";
  }
  const detail = scan.reason ?? scan.summary?.split("\n")[0];
  return detail ? `${scan.provider}: ${scan.status} - ${detail}` : `${scan.provider}: ${scan.status}`;
}

export async function runSkillsFind(_repoRoot: string, query: string, options: SkillsFindOptions = {}): Promise<void> {
  const report = await findSkills(query);
  if (options.json) {
    printJson(report);
    return;
  }

  console.log(`skills search: ${report.query}`);
  console.log(`status: ${report.status}`);
  console.log(`search: ${report.searchUrl}`);
  for (const message of report.messages) {
    console.log(`- ${message}`);
  }
  console.log("candidates:");
  for (const candidate of report.candidates) {
    console.log(`- ${candidate.name}`);
    if (candidate.summary) {
      console.log(`  ${candidate.summary}`);
    }
    console.log(`  install: ${candidate.installCommand}`);
  }
}

export async function runSkillsMatch(repoRoot: string, task: string, options: SkillsMatchOptions = {}): Promise<void> {
  try {
    const context = await assembleContext(repoRoot, task, { limit: 8, fallbackSkills: false });
    const matches = context.skills.map((skill) => ({
      name: skill.name,
      score: skill.score,
      confidence: skill.score >= 3 ? "high" : skill.score >= 1 ? "medium" : "low",
      risk: skill.risk,
      reviewed: skill.reviewed,
      reason: skill.score > 0 ? "skill metadata matches task terms" : "fallback project skill",
      load: skill.score > 0 && skill.reviewed,
      when: skill.when,
      sourcePath: skill.sourcePath,
    }));
    if (options.json) {
      printJson({ task, matches });
      return;
    }
    console.log(`skill matches: ${task}`);
    if (matches.length === 0) {
      console.log("No local skill metadata matched. Use `threadroot skills find <query>` only if a reusable procedure is needed.");
      return;
    }
    for (const match of matches) {
      console.log(`- ${match.name} (${match.confidence}, ${match.risk}) - ${match.reason}`);
      console.log(`  load: ${match.load ? `threadroot skills inspect ${match.sourcePath}` : "not recommended yet"}`);
    }
  } catch (error) {
    if (error instanceof HarnessError) {
      if (options.json) {
        printJson({ task, matches: [], ok: false, error: "harness_missing", message: "No harness found. Run `threadroot init` first." });
      } else {
        console.log("No harness found. Run `threadroot init` first.");
      }
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

export async function runSkillsList(repoRoot: string, options: SkillsListOptions = {}): Promise<void> {
  try {
    const harness = await resolveHarness(repoRoot);
    const skills = harness.skills.map((skill) => ({
      name: skill.name,
      origin: skill.origin,
      description: skill.frontmatter.description,
      when: skill.frontmatter.when,
      tags: skill.frontmatter.tags,
      sourcePath: skill.sourcePath,
    }));
    if (options.json) {
      printJson({ skills });
      return;
    }

    if (harness.skills.length === 0) {
      console.log("No skills defined. Add folder skills under `.threadroot/skills/<name>/SKILL.md`.");
      return;
    }
    for (const skill of harness.skills) {
      console.log(`${skill.name}  [${skill.origin}]  - ${skill.frontmatter.description}`);
    }
  } catch (error) {
    if (error instanceof HarnessError) {
      if (options.json) {
        printJson({ skills: [], ok: false, error: "harness_missing", message: "No harness found. Run `threadroot init` first." });
      } else {
        console.log("No harness found. Run `threadroot init` first.");
      }
      return;
    }
    throw error;
  }
}

export async function runSkillsValidate(repoRoot: string, options: SkillsValidateOptions = {}): Promise<void> {
  const report = options.path ? await validateSkillPath(toRepoPath(repoRoot, options.path)) : await validateSkills(repoRoot);
  if (options.json) {
    printJson(report);
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (report.findings.length === 0) {
    console.log("Skills valid.");
    return;
  }

  const errors = report.findings.filter((entry) => entry.severity === "error").length;
  const warnings = report.findings.filter((entry) => entry.severity === "warning").length;
  console.log(`Skills validation: ${errors} error(s), ${warnings} warning(s)`);
  for (const finding of report.findings) {
    console.log(`- ${finding.severity} ${finding.skill}: ${finding.message} (${finding.path})`);
  }
  if (!report.ok) {
    process.exitCode = 1;
  }
}

export async function runSkillsInspect(
  repoRoot: string,
  targetPath: string,
  options: SkillsInspectOptions = {},
): Promise<void> {
  const inspection = await inspectSkillPath(toRepoPath(repoRoot, targetPath));
  const scan = await scanSkillPath(toRepoPath(repoRoot, targetPath));
  if (options.json) {
    printJson({ ...inspection, scan });
    return;
  }

  console.log(`${inspection.name}`);
  console.log(`description: ${inspection.description}`);
  console.log(`path: ${inspection.path}`);
  console.log(`references: ${inspection.references.length > 0 ? inspection.references.join(", ") : "none"}`);
  console.log(`scripts: ${inspection.scripts.length > 0 ? inspection.scripts.join(", ") : "none"}`);
  console.log(`assets: ${inspection.assets.length > 0 ? inspection.assets.join(", ") : "none"}`);
  console.log(`evals: ${inspection.evals.length > 0 ? inspection.evals.join(", ") : "none"}`);
  if (inspection.allowedTools) {
    const tools = Array.isArray(inspection.allowedTools) ? inspection.allowedTools.join(", ") : inspection.allowedTools;
    console.log(`allowed-tools: ${tools}`);
  }
  printScan(scan);
}

export async function runSkillsScan(
  repoRoot: string,
  targetPath: string,
  options: SkillsScanOptions = {},
): Promise<void> {
  const report = await scanSkillPath(toRepoPath(repoRoot, targetPath));
  if (options.json) {
    printJson(report);
    if (report.blocked) {
      process.exitCode = 1;
    }
    return;
  }
  printScan(report);
  if (report.blocked) {
    process.exitCode = 1;
  }
}

export async function runSkillsIngest(repoRoot: string, source: string, options: SkillsIngestOptions = {}): Promise<void> {
  try {
    const addOptions: SkillAddOptions = {
      scope: options.user ? "user" : "project",
      objectPath: options.path,
      skillName: options.skill,
      all: options.all,
      dryRun: options.dryRun,
      force: options.force,
      strict: options.strict,
      snyk: options.snyk,
      requireSnyk: options.requireSnyk,
    };
    const result = await addSkill(repoRoot, source, addOptions);
    if (options.json) {
      printJson(result);
      if (result.needsSelection) {
        process.exitCode = 1;
      }
      return;
    }

    if (result.needsSelection) {
      console.log(`Multiple skills found in ${source}. Choose one with --skill/--path, or re-run with --all:`);
      for (const candidate of result.candidates) {
        console.log(`- ${candidate.name} (${candidate.scan.risk}) at ${candidate.objectPath}`);
      }
      console.log("selection commands:");
      for (const command of result.selectionCommands) {
        console.log(`- ${command}`);
      }
      process.exitCode = 1;
      return;
    }

    if (options.dryRun) {
      console.log(`Threadroot skills ingest: dry run for ${source}`);
      for (const candidate of result.candidates) {
        console.log(`- would install ${candidate.name} (${candidate.scan.risk}) from ${candidate.objectPath}`);
        console.log(`  external scan: ${formatExternalScan(candidate.externalScan)}`);
      }
      console.log("Threadroot detects risk signals; it does not certify third-party skills as safe.");
      return;
    }

    if (result.harnessCreated) {
      console.log("created minimal local-only .threadroot/");
    }
    for (const installed of result.installed) {
      console.log(`installed skill \`${installed.name}\` (${result.scope})`);
      console.log(`  path: ${installed.path}`);
      console.log(`  risk: ${installed.scan.risk}`);
      if (installed.entry.resolved) {
        console.log(`  commit: ${installed.entry.resolved}`);
      }
      if (installed.entry.integrity) {
        console.log(`  integrity: ${installed.entry.integrity}`);
      }
      if (installed.entry.registryId) {
        console.log(`  registry: ${installed.entry.registryId}`);
      }
      if (installed.entry.auditUrl) {
        console.log(`  audits: ${installed.entry.auditUrl}`);
      }
      console.log(`  external scan: ${formatExternalScan(installed.externalScan)}`);
      for (const finding of installed.scan.findings.filter((finding) => finding.risk !== "low").slice(0, 8)) {
        console.log(`  warning: ${finding.code} - ${finding.message}`);
      }
      console.log(`  inspect: threadroot skills inspect .threadroot/skills/${installed.name}`);
    }
    console.log("Threadroot detects risk signals; it does not certify third-party skills as safe.");
  } catch (error) {
    if (options.json) {
      printJson({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } else {
      console.error(`Skill ingest failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exitCode = 1;
  }
}

export async function runSkillsTrust(repoRoot: string, name: string, options: SkillsTrustOptions = {}): Promise<void> {
  try {
    const entry = await trustSkill(repoRoot, name, { scope: options.user ? "user" : "project" });
    if (options.json) {
      printJson({ ok: true, entry });
      return;
    }
    console.log(`trusted skill \`${entry.name}\``);
  } catch (error) {
    if (options.json) {
      printJson({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } else {
      console.error(`Skill trust failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exitCode = 1;
  }
}
