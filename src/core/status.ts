import { compile, detectDrift, type DriftEntry } from "./compile/index.js";
import { HarnessError, resolveHarness } from "./harness/index.js";

export type HarnessStatus =
  | { exists: false }
  | {
      exists: true;
      manifest: {
        name: string;
        profile: string;
        adapters: string[];
        toolsAllow: string[];
      };
      counts: { skills: number; rules: number; tools: number; memory: number };
      drift: DriftEntry[];
    };

export type StatusOptions = {
  home?: string;
};

/**
 * Summarize harness state: manifest, object counts, and per-file drift between
 * canonical sources and compiled vendor outputs. Powers MCP `status` and
 * `tr status`.
 */
export async function harnessStatus(repoRoot: string, options: StatusOptions = {}): Promise<HarnessStatus> {
  let harness;
  try {
    harness = await resolveHarness(repoRoot, { home: options.home });
  } catch (error) {
    if (error instanceof HarnessError) {
      return { exists: false };
    }
    throw error;
  }

  const files = await compile(repoRoot, harness);
  const drift = await detectDrift(repoRoot, files);

  return {
    exists: true,
    manifest: {
      name: harness.manifest.name,
      profile: harness.manifest.profile,
      adapters: harness.manifest.adapters,
      toolsAllow: harness.manifest.tools.allow,
    },
    counts: {
      skills: harness.skills.length,
      rules: harness.rules.length,
      tools: harness.tools.length,
      memory: harness.memory.length,
    },
    drift,
  };
}
