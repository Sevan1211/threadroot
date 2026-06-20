import { stat } from "node:fs/promises";
import path from "node:path";

import { compile, detectDrift } from "./compile/index.js";
import { HarnessError, resolveHarness } from "./harness/index.js";
import { projectLockPath, userLockPath } from "./harness/paths.js";
import { externalToolNames, readLockFile } from "./install/lock.js";

export type DoctorSeverity = "error" | "warning";

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

async function mcpConfigWarnings(repoRoot: string): Promise<DoctorFinding[]> {
  const configs = [".vscode/mcp.json", ".cursor/mcp.json", ".mcp.json"];
  const present = await Promise.all(configs.map((config) => exists(path.join(repoRoot, config))));
  if (present.some(Boolean)) {
    return [];
  }
  return [
    finding(
      "warning",
      "mcp_config_missing",
      "No project-local MCP config found. Run `threadroot mcp setup --write` if this repo should expose Threadroot tools to local agents.",
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
  }

  const [projectLock, userLock] = await Promise.all([
    readLockFile(projectLockPath(repoRoot)),
    readLockFile(userLockPath(options.home)),
  ]);
  const externalTools = new Set([...externalToolNames(projectLock), ...externalToolNames(userLock)]);
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

  findings.push(...(await mcpConfigWarnings(repoRoot)));
  return summarize(findings);
}

function summarize(findings: DoctorFinding[]): DoctorReport {
  const errors = findings.filter((entry) => entry.severity === "error").length;
  const warnings = findings.filter((entry) => entry.severity === "warning").length;
  return { ok: errors === 0, findings, summary: { errors, warnings } };
}
