import { HarnessError, resolveHarness } from "../core/harness/index.js";
import { toRepoPath } from "../core/paths.js";
import { inspectSkillPath, validateSkillPath, validateSkills } from "../core/skills.js";

export type SkillsValidateOptions = {
  path?: string;
};

export async function runSkillsList(repoRoot: string): Promise<void> {
  try {
    const harness = await resolveHarness(repoRoot);
    if (harness.skills.length === 0) {
      console.log("No skills defined. Add folder skills under `.threadroot/skills/<name>/SKILL.md`.");
      return;
    }
    for (const skill of harness.skills) {
      console.log(`${skill.name}  [${skill.origin}]  - ${skill.frontmatter.description}`);
    }
  } catch (error) {
    if (error instanceof HarnessError) {
      console.log("No harness found. Run `tr init` first.");
      return;
    }
    throw error;
  }
}

export async function runSkillsValidate(repoRoot: string, options: SkillsValidateOptions = {}): Promise<void> {
  const report = options.path ? await validateSkillPath(toRepoPath(repoRoot, options.path)) : await validateSkills(repoRoot);
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

export async function runSkillsInspect(repoRoot: string, targetPath: string): Promise<void> {
  const inspection = await inspectSkillPath(toRepoPath(repoRoot, targetPath));
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
}
