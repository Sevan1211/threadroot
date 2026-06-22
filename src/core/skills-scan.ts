import { lstat, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { parseFrontmatter } from "./harness/frontmatter.js";
import { skillFrontmatterSchema } from "./harness/schema.js";

export type SkillRisk = "low" | "medium" | "high" | "blocked";

export type SkillScanFinding = {
  severity: "info" | "warning" | "error";
  risk: SkillRisk;
  code: string;
  message: string;
  path?: string;
};

export type SkillScanReport = {
  risk: SkillRisk;
  blocked: boolean;
  findings: SkillScanFinding[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
};

const LINK_RE = /\]\(([^)]+)\)/g;
const MAX_FILE_BYTES = 512 * 1024;
const EXECUTABLE_EXTENSIONS = new Set([".bash", ".cjs", ".js", ".mjs", ".ps1", ".py", ".rb", ".sh", ".ts"]);
const CONFIG_FILE_NAMES = new Set([
  ".mcp.json",
  "mcp.json",
  "opencode.json",
  "settings.json",
  "config.toml",
  "plugin.json",
]);
const CONFIG_DIR_NAMES = new Set([
  ".claude-plugin",
  ".codex-plugin",
  ".mcp",
  "agents",
  "hooks",
  "mcp",
  "plugins",
]);

const HIGH_PATTERNS: Array<[RegExp, string]> = [
  [/\bignore (all )?(previous|prior|above) instructions\b/i, "prompt_injection_language"],
  [/\bsystem prompt\b/i, "system_prompt_reference"],
  [/\b(exfiltrate|steal|leak)\b/i, "exfiltration_language"],
  [/\b(send|upload|post).{0,40}\b(secret|token|api key|credential)s?\b/i, "credential_exfiltration_language"],
  [/\brm\s+-rf\b/i, "destructive_shell_command"],
  [/\bsudo\b/i, "privileged_shell_command"],
];

const MEDIUM_PATTERNS: Array<[RegExp, string]> = [
  [/\b(curl|wget)\s+https?:\/\//i, "network_shell_command"],
  [/\beval\s*\(/i, "dynamic_code_execution"],
  [/\bchmod\s+\+x\b/i, "permission_change_command"],
];

function makeFinding(
  risk: SkillRisk,
  code: string,
  message: string,
  pathValue?: string,
): SkillScanFinding {
  const severity = risk === "blocked" ? "error" : risk === "low" ? "info" : "warning";
  return pathValue ? { severity, risk, code, message, path: pathValue } : { severity, risk, code, message };
}

function maxRisk(a: SkillRisk, b: SkillRisk): SkillRisk {
  const order: Record<SkillRisk, number> = { low: 0, medium: 1, high: 2, blocked: 3 };
  return order[a] >= order[b] ? a : b;
}

function isBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
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

function scanText(content: string, filePath: string, findings: SkillScanFinding[]): void {
  for (const [pattern, code] of HIGH_PATTERNS) {
    if (pattern.test(content)) {
      findings.push(makeFinding("high", code, `Suspicious instruction or command pattern detected: ${code}.`, filePath));
    }
  }
  for (const [pattern, code] of MEDIUM_PATTERNS) {
    if (pattern.test(content)) {
      findings.push(makeFinding("medium", code, `Potentially sensitive command pattern detected: ${code}.`, filePath));
    }
  }
}

async function scanSkillMarkdown(skillFile: string, skillDir: string, findings: SkillScanFinding[]): Promise<void> {
  let raw: string;
  try {
    const buffer = await readFile(skillFile);
    if (isBinary(buffer)) {
      findings.push(makeFinding("blocked", "binary_skill_file", "SKILL.md must be plain text.", skillFile));
      return;
    }
    raw = buffer.toString("utf8");
  } catch (error) {
    findings.push(
      makeFinding(
        "blocked",
        "unreadable_skill_file",
        `Cannot read SKILL.md: ${error instanceof Error ? error.message : String(error)}`,
        skillFile,
      ),
    );
    return;
  }

  const parsed = parseFrontmatter(raw);
  const result = skillFrontmatterSchema.safeParse(parsed.data);
  if (!result.success) {
    findings.push(
      makeFinding(
        "blocked",
        "invalid_skill_frontmatter",
        result.error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; "),
        skillFile,
      ),
    );
    return;
  }

  if (!result.data.license) {
    findings.push(makeFinding("medium", "missing_license", "Skill does not declare a license.", skillFile));
  }
  if (!result.data.compatibility) {
    findings.push(
      makeFinding("medium", "missing_compatibility", "Skill does not declare compatibility or environment notes.", skillFile),
    );
  }
  if (result.data.allowedTools) {
    findings.push(
      makeFinding(
        "high",
        "allowed_tools_declared",
        "Skill declares pre-approved tools; inspect permissions before trusting.",
        skillFile,
      ),
    );
  }

  const frontmatterText = raw.slice(0, Math.max(0, raw.indexOf("---", 3)));
  if (/^\s*(permissions?|hooks?|mcp|mcpServers|tools?)\s*:/im.test(frontmatterText)) {
    findings.push(
      makeFinding("high", "provider_permission_fields", "Skill frontmatter appears to include provider permissions.", skillFile),
    );
  }

  scanText(raw, skillFile, findings);

  for (const match of raw.matchAll(LINK_RE)) {
    const target = match[1] ?? "";
    if (/^[a-z]+:\/\//i.test(target)) {
      findings.push(makeFinding("low", "external_link", `Skill links to external URL: ${target}`, skillFile));
      continue;
    }
    if (target.startsWith("#")) {
      continue;
    }
    if (path.isAbsolute(target) || target.split(/[\\/]/).includes("..")) {
      findings.push(makeFinding("blocked", "unsafe_link", `Skill link must stay inside the skill directory: ${target}`, skillFile));
      continue;
    }
    if (!(await exists(path.join(skillDir, target)))) {
      findings.push(makeFinding("medium", "broken_link", `Skill links to missing file: ${target}`, skillFile));
    }
  }
}

async function scanFile(filePath: string, skillDir: string, findings: SkillScanFinding[]): Promise<void> {
  const relative = path.relative(skillDir, filePath).split(path.sep).join("/");
  const info = await lstat(filePath);
  if (info.isSymbolicLink()) {
    findings.push(makeFinding("blocked", "symlink", "Skill contains a symlink; symlinks are not installed.", filePath));
    return;
  }
  if (!info.isFile()) {
    return;
  }

  const base = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (base.startsWith(".") && base !== ".gitignore") {
    findings.push(makeFinding("medium", "hidden_file", `Hidden file included in skill: ${relative}`, filePath));
  }
  if (CONFIG_FILE_NAMES.has(base)) {
    findings.push(makeFinding("high", "provider_config_file", `Provider or MCP config file included: ${relative}`, filePath));
  }
  if ((info.mode & 0o111) !== 0 || EXECUTABLE_EXTENSIONS.has(ext)) {
    findings.push(makeFinding("medium", "executable_file", `Executable/script-like file included: ${relative}`, filePath));
  }
  if (info.size > MAX_FILE_BYTES) {
    findings.push(makeFinding("medium", "oversized_file", `Large file included in skill: ${relative}`, filePath));
  }

  const buffer = await readFile(filePath);
  if (isBinary(buffer)) {
    findings.push(makeFinding("high", "binary_file", `Binary file included in skill: ${relative}`, filePath));
    return;
  }
  scanText(buffer.toString("utf8"), filePath, findings);
}

async function walkSkillDir(dir: string, skillDir: string, findings: SkillScanFinding[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      findings.push(makeFinding("blocked", "symlink", "Skill contains a symlink; symlinks are not installed.", full));
      continue;
    }
    if (entry.isDirectory()) {
      if (CONFIG_DIR_NAMES.has(entry.name)) {
        findings.push(
          makeFinding("high", "provider_config_directory", `Provider/plugin directory included: ${entry.name}`, full),
        );
      }
      if (entry.name === "scripts") {
        findings.push(makeFinding("high", "scripts_directory", "Skill includes scripts; inspect before trusting.", full));
      }
      await walkSkillDir(full, skillDir, findings);
      continue;
    }
    await scanFile(full, skillDir, findings);
  }
}

function summarize(findings: SkillScanFinding[]): SkillScanReport {
  let risk: SkillRisk = "low";
  for (const finding of findings) {
    risk = maxRisk(risk, finding.risk);
  }
  return {
    risk,
    blocked: risk === "blocked",
    findings,
    summary: {
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
      info: findings.filter((finding) => finding.severity === "info").length,
    },
  };
}

export async function scanSkillPath(targetPath: string): Promise<SkillScanReport> {
  const findings: SkillScanFinding[] = [];
  let info;
  try {
    info = await lstat(targetPath);
  } catch (error) {
    findings.push(
      makeFinding(
        "blocked",
        "missing_skill",
        `Skill path is not readable: ${error instanceof Error ? error.message : String(error)}`,
        targetPath,
      ),
    );
    return summarize(findings);
  }

  if (info.isSymbolicLink()) {
    findings.push(makeFinding("blocked", "symlink", "Skill path is a symlink; symlinks are not installed.", targetPath));
    return summarize(findings);
  }

  const skillFile = info.isDirectory() ? path.join(targetPath, "SKILL.md") : targetPath;
  const skillDir = info.isDirectory() ? targetPath : path.dirname(targetPath);
  await scanSkillMarkdown(skillFile, skillDir, findings);
  if (info.isDirectory()) {
    await walkSkillDir(targetPath, skillDir, findings);
  } else {
    await scanFile(targetPath, skillDir, findings);
  }
  return summarize(findings);
}
