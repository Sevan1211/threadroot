import { stat } from "node:fs/promises";
import path from "node:path";

import { compile, detectDrift } from "./compile/index.js";
import { HarnessError, resolveHarness } from "./harness/index.js";
import { projectLockPath, userLockPath } from "./harness/paths.js";
import { externalSkillNames, externalToolNames, readLockFile } from "./install/lock.js";
import { validateResolvedSkillsDeep } from "./skills.js";
import { checkConnection } from "./connections/index.js";
import { hasGlobalThreadrootSkill } from "./setup.js";
import { checkToolHealth } from "./tools/index.js";
import { checkCodexMcp } from "./mcp-check.js";

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
      "No project-local MCP config found. This is fine for local-only harnesses; run `threadroot mcp setup --write` only when this repo should expose MCP tools to local agents.",
    ),
  ];
}

async function globalSetupHints(home?: string): Promise<DoctorFinding[]> {
  if (await hasGlobalThreadrootSkill(home, "codex")) {
    return [];
  }
  return [
    finding(
      "info",
      "global_setup_missing",
      "Codex global Threadroot setup was not detected. Run `threadroot bootstrap --yes --agent codex` for one-time machine setup.",
    ),
  ];
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
      findings.push(
        finding(
          "error",
          "connection_check_failed",
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
  }

  findings.push(...(await globalSetupHints(options.home)));
  findings.push(...(await mcpConfigHints(repoRoot, options.home)));
  return summarize(findings);
}

function summarize(findings: DoctorFinding[]): DoctorReport {
  const errors = findings.filter((entry) => entry.severity === "error").length;
  const warnings = findings.filter((entry) => entry.severity === "warning").length;
  const info = findings.filter((entry) => entry.severity === "info").length;
  return { ok: errors === 0, findings, summary: { errors, warnings, info } };
}
