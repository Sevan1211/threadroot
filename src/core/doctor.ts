import os from "node:os";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { compile, detectDrift } from "./compile/index.js";
import { HarnessError, resolveHarness } from "./harness/index.js";
import { projectHarnessDir, projectLockPath, userHarnessDir, userLockPath } from "./harness/paths.js";
import { externalSkillNames, externalToolNames, readLockFile } from "./install/lock.js";
import { validateResolvedSkillsDeep } from "./skills.js";
import { scanSkillPath } from "./skills-scan.js";
import { checkConnection } from "./connections/index.js";
import { checkToolHealth } from "./tools/index.js";
import { checkCodexMcp } from "./mcp-check.js";
import { repoMapStatus } from "./repo-map.js";
import { indexStatus } from "./repo-index.js";
import { threadrootIgnoredByGit, threadrootTrackedFiles } from "./gitignore.js";
import { walkRepo } from "./scan/walk.js";

export type DoctorSeverity = "error" | "warning" | "info";

export type DoctorFinding = {
  severity: DoctorSeverity;
  code: string;
  message: string;
  path?: string;
};

export type DoctorReport = {
  ok: boolean;
  findings: DoctorFinding[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
};

export type DoctorOptions = {
  home?: string;
};

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

function finding(
  severity: DoctorSeverity,
  code: string,
  message: string,
  pathValue?: string,
): DoctorFinding {
  return pathValue ? { severity, code, message, path: pathValue } : { severity, code, message };
}

async function mcpConfigHints(repoRoot: string, home?: string): Promise<DoctorFinding[]> {
  const codexMcp = await checkCodexMcp({ repoRoot, home, timeoutMs: 2500 });
  if (codexMcp.status === "ok") {
    return [];
  }
  if (codexMcp.status === "error") {
    return [
      finding(
        "warning",
        "codex_mcp_unhealthy",
        `Codex Threadroot MCP is configured but failed verification: ${codexMcp.messages.join(" ")}`,
        codexMcp.configPath,
      ),
    ];
  }

  const configs = [".vscode/mcp.json", ".cursor/mcp.json", ".mcp.json"];
  const present = await Promise.all(configs.map((config) => exists(path.join(repoRoot, config))));
  if (present.some(Boolean)) {
    return [];
  }
  return [
    finding(
      "info",
      "mcp_config_missing",
      "No project-local MCP config found. This is fine for local-only harnesses; run `threadroot connect <agent>` for user/local provider setup.",
    ),
  ];
}

async function repoMapHints(repoRoot: string): Promise<DoctorFinding[]> {
  const status = await repoMapStatus(repoRoot);
  if (status.status === "current") {
    return [];
  }
  return [
    finding(
      "warning",
      status.status === "missing" ? "repo_map_missing" : "repo_map_stale",
      `Repo map is ${status.status}. Run \`threadroot map --write\` so agents can navigate the codebase without loading everything.`,
      status.path,
    ),
  ];
}

async function indexHints(repoRoot: string): Promise<DoctorFinding[]> {
  const status = await indexStatus(repoRoot);
  if (status.status === "current") {
    return [];
  }
  if (status.status === "missing") {
    return [
      finding(
        "info",
        "repo_index_missing",
        "Repo intelligence index has not been built. Run `threadroot index` or `threadroot task \"<task>\"` for higher-precision context routing.",
        status.path,
      ),
    ];
  }
  return [
    finding(
      status.status === "degraded" ? "warning" : "warning",
      status.status === "degraded" ? "repo_index_degraded" : "repo_index_stale",
      status.status === "degraded"
        ? "Repo intelligence index is running in degraded fallback mode; context routing still works but may be less precise."
        : "Repo intelligence index is stale. Run `threadroot index` to refresh symbols, chunks, and graph edges.",
      status.path,
    ),
  ];
}

async function gitignoreHints(repoRoot: string): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  const tracked = await threadrootTrackedFiles(repoRoot);
  if (tracked.length > 0) {
    findings.push(
      finding(
        "error",
        "threadroot_tracked_in_git",
        `Do not commit .threadroot/ for this release. Untrack ${tracked.length} file(s) and keep the harness local-only.`,
        ".threadroot/",
      ),
    );
  }

  const ignored = await threadrootIgnoredByGit(repoRoot);
  if (ignored === false) {
    findings.push(
      finding(
        "warning",
        "threadroot_not_ignored",
        "`.threadroot/` is not ignored by git. For 0.1.9, keep the harness local-only with `.threadroot/` in `.git/info/exclude` or `.gitignore`.",
        ".threadroot/",
      ),
    );
  }

  return findings;
}

async function visibleProviderFileHints(repoRoot: string): Promise<DoctorFinding[]> {
  const visibleProviderPaths = [
    "AGENTS.md",
    "CLAUDE.md",
    ".codex",
    ".claude",
    ".agents",
    ".cursor",
    ".vscode",
    ".github/copilot-instructions.md",
    ".mcp.json",
  ];
  const findings: DoctorFinding[] = [];
  for (const relativePath of visibleProviderPaths) {
    if (await exists(path.join(repoRoot, relativePath))) {
      findings.push(
        finding(
          "info",
          "visible_provider_file_detected",
          `Visible provider file or folder detected. Threadroot will not modify it unless explicitly asked: ${relativePath}`,
          relativePath,
        ),
      );
    }
  }
  return findings;
}

const STALE_THREADROOT_REFERENCES = [
  { pattern: /\bthreadroot\s+bootstrap\b/u, label: "threadroot bootstrap", replacement: "threadroot init" },
  { pattern: /\bthreadroot\s+setup\b/u, label: "threadroot setup", replacement: "threadroot connect <agent>" },
  { pattern: /\bthreadroot\s+start\b/u, label: "threadroot start", replacement: "threadroot task \"<task>\"" },
  { pattern: /\bthreadroot\s+context\b/u, label: "threadroot context", replacement: "threadroot task \"<task>\"" },
  { pattern: /\bthreadroot\s+working-set\b/u, label: "threadroot working-set", replacement: "threadroot task \"<task>\"" },
  { pattern: /\bthreadroot\s+expose\b/u, label: "threadroot expose", replacement: "threadroot connect <agent>" },
  { pattern: /\bthreadroot\s+mcp\s+setup\b/u, label: "threadroot mcp setup", replacement: "threadroot connect <agent>" },
  { pattern: /\bthreadroot\s+skills\s+expose\b/u, label: "threadroot skills expose", replacement: "threadroot skills inspect" },
  { pattern: /\btest\/mcp-setup\.test\.ts\b/u, label: "test/mcp-setup.test.ts", replacement: "test/mcp-check.test.ts" },
];

function staleReferences(raw: string): Array<{ label: string; replacement: string }> {
  return STALE_THREADROOT_REFERENCES.filter((entry) => entry.pattern.test(raw)).map((entry) => ({
    label: entry.label,
    replacement: entry.replacement,
  }));
}

async function scanStaleReferencesUnder(
  root: string,
  code: string,
  messagePrefix: string,
): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  const files = await walkRepo(root).catch(() => []);
  for (const relativePath of files.filter((file) => /\.(md|json|ya?ml)$/iu.test(file))) {
    const absolute = path.join(root, relativePath);
    const raw = await readFile(absolute, "utf8").catch(() => "");
    const stale = staleReferences(raw);
    if (stale.length === 0) {
      continue;
    }
    const replacements = stale.map((entry) => `${entry.label} -> ${entry.replacement}`).join(", ");
    findings.push(
      finding(
        "warning",
        code,
        `${messagePrefix} contains stale Threadroot command references: ${replacements}.`,
        absolute,
      ),
    );
  }
  return findings;
}

async function staleInstructionHints(repoRoot: string, home?: string): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  findings.push(
    ...(await scanStaleReferencesUnder(
      path.join(projectHarnessDir(repoRoot), "skills"),
      "stale_skill_command_reference",
      "Project skill",
    )),
  );
  findings.push(
    ...(await scanStaleReferencesUnder(
      path.join(userHarnessDir(home), "skills"),
      "stale_user_skill_command_reference",
      "User skill",
    )),
  );

  const rootHome = home ?? os.homedir();
  for (const globalSkillPath of [
    path.join(rootHome, ".agents", "skills", "threadroot", "SKILL.md"),
    path.join(rootHome, ".codex", "skills", "threadroot", "SKILL.md"),
  ]) {
    const raw = await readFile(globalSkillPath, "utf8").catch(() => "");
    const stale = staleReferences(raw);
    if (stale.length === 0) {
      continue;
    }
    findings.push(
      finding(
        "warning",
        "stale_global_threadroot_skill",
        `Installed Threadroot agent skill contains stale command references: ${stale.map((entry) => entry.label).join(", ")}. Reinstall or refresh the skill before judging provider integration.`,
        globalSkillPath,
      ),
    );
  }
  return findings;
}

/**
 * Inspect harness health for humans, CI, and MCP clients. Errors mean the
 * harness is missing, invalid, unsafe, or cannot reproduce required outputs.
 * Warnings flag drift and optional setup gaps without failing the report.
 */
export async function doctor(repoRoot: string, options: DoctorOptions = {}): Promise<DoctorReport> {
  const findings: DoctorFinding[] = [];
  let harness;

  try {
    harness = await resolveHarness(repoRoot, { home: options.home });
  } catch (error) {
    if (error instanceof HarnessError) {
      findings.push(finding("error", "harness_invalid", error.message));
      return summarize(findings);
    }
    throw error;
  }

  try {
    const files = await compile(repoRoot, harness);
    const drift = await detectDrift(repoRoot, files);
    for (const entry of drift) {
      if (entry.status === "create") {
        findings.push(finding("error", "compiled_output_missing", `Missing compiled output: ${entry.path}`, entry.path));
      } else if (entry.status === "drift") {
        findings.push(
          finding(
            "warning",
            "compiled_output_drift",
            `Compiled output differs from the canonical harness: ${entry.path}`,
            entry.path,
          ),
        );
      }
    }
  } catch (error) {
    findings.push(
      finding(
        "error",
        "compile_failed",
        `Cannot compile harness: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  for (const tool of harness.tools) {
    if (tool.manifest.confirm) {
      findings.push(
        finding(
          "warning",
          "tool_requires_confirmation",
          `Tool \`${tool.name}\` requires explicit confirmation before running.`,
          tool.sourcePath,
        ),
      );
    }
    if (tool.manifest.risk === "high" && !tool.manifest.confirm) {
      findings.push(
        finding(
          "warning",
          "high_risk_tool_without_confirm",
          `High-risk tool \`${tool.name}\` does not set confirm:true. Runtime execution will still require confirmation.`,
          tool.sourcePath,
        ),
      );
    }
    if (tool.manifest.connection && !harness.connections.some((connection) => connection.name === tool.manifest.connection)) {
      findings.push(
        finding(
          "error",
          "unknown_tool_connection",
          `Tool \`${tool.name}\` references unknown connection \`${tool.manifest.connection}\`.`,
          tool.sourcePath,
        ),
      );
    }
    const toolHealth = await checkToolHealth(repoRoot, tool);
    if (toolHealth.status === "error") {
      findings.push(
        finding("error", "tool_healthcheck_failed", `Tool \`${tool.name}\`: ${toolHealth.message}`, tool.sourcePath),
      );
    }
  }

  for (const connection of harness.connections) {
    if (connection.manifest.risk === "high" && !connection.manifest.confirm) {
      findings.push(
        finding(
          "warning",
          "high_risk_connection_without_confirm",
          `High-risk connection \`${connection.name}\` should set confirm:true.`,
          connection.sourcePath,
        ),
      );
    }
    const check = await checkConnection(repoRoot, connection);
    if (check.status === "error") {
      const severity = connection.manifest.risk === "high" ? "error" : "warning";
      findings.push(
        finding(
          severity,
          severity === "error" ? "connection_check_failed" : "optional_connection_unhealthy",
          `Connection \`${connection.name}\`: ${check.message}`,
          connection.sourcePath,
        ),
      );
    } else if (check.status === "warning") {
      findings.push(
        finding(
          "warning",
          "connection_check_warning",
          `Connection \`${connection.name}\`: ${check.message}`,
          connection.sourcePath,
        ),
      );
    }
  }

  const skillReport = await validateResolvedSkillsDeep(harness);
  for (const skillFinding of skillReport.findings) {
    findings.push(
      finding(
        skillFinding.severity,
        `skill_${skillFinding.severity}`,
        `Skill \`${skillFinding.skill}\`: ${skillFinding.message}`,
        skillFinding.path,
      ),
    );
  }

  const [projectLock, userLock] = await Promise.all([
    readLockFile(projectLockPath(repoRoot)),
    readLockFile(userLockPath(options.home)),
  ]);
  const externalTools = new Set([...externalToolNames(projectLock), ...externalToolNames(userLock)]);
  const externalSkills = new Set([...externalSkillNames(projectLock), ...externalSkillNames(userLock)]);
  const externalSkillEntries = new Map(
    [...userLock.objects, ...projectLock.objects]
      .filter((entry) => entry.kind === "skill" && entry.sourceKind !== "local")
      .map((entry) => [entry.name, entry]),
  );
  for (const name of externalTools) {
    if (!harness.manifest.tools.allow.includes(name)) {
      findings.push(
        finding(
          "error",
          "external_tool_not_allowed",
          `External installed tool \`${name}\` is not listed in tools.allow.`,
        ),
      );
    }
  }

  for (const skill of harness.skills) {
    if (!externalSkills.has(skill.name)) {
      continue;
    }
    const entry = externalSkillEntries.get(skill.name);
    if (!entry?.reviewed) {
      findings.push(
        finding(
          "warning",
          "external_skill_unreviewed",
          `External installed skill \`${skill.name}\` has not been marked reviewed. Run \`threadroot skills inspect .threadroot/skills/${skill.name}\`, then \`threadroot skills trust ${skill.name}\` if acceptable.`,
          skill.sourcePath,
        ),
      );
    }
    if (entry?.risk && entry.risk !== "low") {
      findings.push(
        finding(
          "warning",
          "external_skill_risk",
          `External installed skill \`${skill.name}\` was scanned as ${entry.risk} risk at install time.`,
          skill.sourcePath,
        ),
      );
    }
    if (entry?.externalScan?.status === "warn" || entry?.externalScan?.status === "failed") {
      findings.push(
        finding(
          entry.externalScan.status === "failed" ? "error" : "warning",
          "external_skill_snyk_scan",
          `External installed skill \`${skill.name}\` has ${entry.externalScan.provider} status ${entry.externalScan.status}: ${entry.externalScan.reason ?? "review scan summary"}.`,
          skill.sourcePath,
        ),
      );
    }
    if (skill.frontmatter.allowedTools) {
      findings.push(
        finding(
          "warning",
          "external_skill_allowed_tools",
          `External installed skill \`${skill.name}\` declares allowed tools; inspect it before trusting.`,
          skill.sourcePath,
        ),
      );
    }
    const scriptsDir = path.join(path.dirname(skill.sourcePath), "scripts");
    if (await exists(scriptsDir)) {
      findings.push(
        finding(
          "warning",
          "external_skill_scripts",
          `External installed skill \`${skill.name}\` includes scripts; inspect them before trusting.`,
          scriptsDir,
        ),
      );
    }
    const scanPath = path.basename(skill.sourcePath) === "SKILL.md" ? path.dirname(skill.sourcePath) : skill.sourcePath;
    const scan = await scanSkillPath(scanPath);
    for (const scanFinding of scan.findings.filter((entry) => entry.risk !== "low").slice(0, 8)) {
      findings.push(
        finding(
          "warning",
          "external_skill_scan",
          `External installed skill \`${skill.name}\`: ${scanFinding.code} - ${scanFinding.message}`,
          scanFinding.path,
        ),
      );
    }
  }

  findings.push(...(await repoMapHints(repoRoot)));
  findings.push(...(await indexHints(repoRoot)));
  findings.push(...(await staleInstructionHints(repoRoot, options.home)));
  findings.push(...(await gitignoreHints(repoRoot)));
  findings.push(...(await visibleProviderFileHints(repoRoot)));
  findings.push(...(await mcpConfigHints(repoRoot, options.home)));
  return summarize(findings);
}

function summarize(findings: DoctorFinding[]): DoctorReport {
  const errors = findings.filter((entry) => entry.severity === "error").length;
  const warnings = findings.filter((entry) => entry.severity === "warning").length;
  const info = findings.filter((entry) => entry.severity === "info").length;
  return { ok: errors === 0, findings, summary: { errors, warnings, info } };
}
