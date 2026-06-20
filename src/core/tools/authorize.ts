import type { LoadedTool } from "../harness/index.js";
import type { RiskLevel } from "../harness/schema.js";

export type AuthorizeDecision =
  | { allowed: true }
  | { allowed: false; reason: "needs-confirmation" | "not-allowed"; message: string };

export type AuthorizeOptions = {
  /** `harness.yaml > tools.allow` — human-approved tool names. */
  allow: string[];
  /** Caller has already obtained explicit confirmation for this run. */
  confirmed?: boolean;
  /**
   * Whether the tool's source is trusted. Locally-authored project/user tools
   * are trusted (trust model = npm scripts). Installed/registry tools are
   * untrusted until allow-listed (provenance lands in milestone 6).
   */
  trusted?: boolean;
  /** Risk of the connection this tool uses, when any. */
  connectionRisk?: RiskLevel;
};

/**
 * Decide whether a tool may execute. Two orthogonal gates:
 *  1. Source trust — untrusted tools must be named in `tools.allow`.
 *  2. Confirmation — `confirm: true` tools require an explicit confirmation.
 */
export function authorizeTool(tool: LoadedTool, options: AuthorizeOptions): AuthorizeDecision {
  const trusted = options.trusted ?? true;
  const allowListed = options.allow.includes(tool.name);

  if (!trusted && !allowListed) {
    return {
      allowed: false,
      reason: "not-allowed",
      message: `\`${tool.name}\` is from an untrusted source. Add it to \`tools.allow\` in harness.yaml to permit it.`,
    };
  }

  if (tool.manifest.confirm && options.confirmed !== true) {
    return {
      allowed: false,
      reason: "needs-confirmation",
      message: `\`${tool.name}\` requires confirmation before running.`,
    };
  }

  if (tool.manifest.risk === "high" && options.confirmed !== true) {
    return {
      allowed: false,
      reason: "needs-confirmation",
      message: `\`${tool.name}\` is high risk and requires confirmation before running.`,
    };
  }

  if (options.connectionRisk === "high" && tool.manifest.risk !== "low" && options.confirmed !== true) {
    return {
      allowed: false,
      reason: "needs-confirmation",
      message: `\`${tool.name}\` uses a high-risk connection and requires confirmation before running.`,
    };
  }

  return { allowed: true };
}
