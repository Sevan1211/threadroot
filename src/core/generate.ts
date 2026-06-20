import { getProfile } from "./profiles.js";
import { adapterFiles, canonicalFiles } from "./generation/builders.js";
import { MANIFEST_PATH } from "./paths.js";
import type { GeneratedFile, RevampContext, Target, ThreadrootConfig } from "../types.js";

type GenerateOptions = {
  targetFilter?: Target;
  includeCanonical?: boolean;
  includeReadme?: boolean;
  agentsPath?: string;
  automationEnabled?: boolean;
  revampContext?: RevampContext;
};

export function generateFiles(config: ThreadrootConfig, options: GenerateOptions = {}): GeneratedFile[] {
  const profile = getProfile(config.profile);
  const targets = options.targetFilter ? [options.targetFilter] : config.targets;
  const buildOptions = {
    includeReadme: options.includeReadme ?? true,
    agentsPath: options.agentsPath ?? "AGENTS.md",
    automationEnabled: options.automationEnabled,
    revampContext: options.revampContext,
  };

  const includeCanonical = options.includeCanonical ?? true;
  const files = [
    ...(includeCanonical ? canonicalFiles(config, profile, buildOptions) : []),
    ...adapterFiles(config, profile, targets, buildOptions),
  ];

  if (includeCanonical) {
    files.push({ path: MANIFEST_PATH, content: "", generated: false });
  }

  return files;
}
