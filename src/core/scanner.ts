import type { ConfigSignal, ProjectCommand, ProfileId, RevampContext, SourceCandidate } from "../types.js";
import { classify } from "./scan/classify.js";
import { extractSources } from "./scan/extract.js";
import { configSignals, inferProfile, readJson, scriptsFromPackageJson } from "./scan/package.js";
import { walkRepo } from "./scan/walk.js";

export type ScanResult = {
  candidates: SourceCandidate[];
  detectedCommands: ProjectCommand[];
  configSignals: ConfigSignal[];
  existingAgentFiles: string[];
  likelyProfile: ProfileId | "unknown";
};

export async function scanRepository(repoRoot: string): Promise<ScanResult> {
  const files = await walkRepo(repoRoot);
  const packageJson = await readJson(repoRoot, "package.json");
  const candidates = files
    .map((file) => {
      const classification = classify(file);
      if (!classification) {
        return undefined;
      }

      return {
        path: file,
        kind: classification.kind,
        score: classification.score,
        selected: classification.score >= 75,
        reason: classification.reason,
      } satisfies SourceCandidate;
    })
    .filter((candidate): candidate is SourceCandidate => Boolean(candidate))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  return {
    candidates,
    detectedCommands: scriptsFromPackageJson(packageJson),
    configSignals: configSignals(files, packageJson),
    existingAgentFiles: candidates.filter((candidate) => candidate.kind === "agent").map((candidate) => candidate.path),
    likelyProfile: inferProfile(files, packageJson),
  };
}

export async function buildRevampContext(repoRoot: string, scan: ScanResult): Promise<RevampContext> {
  return {
    selectedSources: await extractSources(repoRoot, scan.candidates),
    detectedCommands: scan.detectedCommands,
    configSignals: scan.configSignals,
    existingAgentFiles: scan.existingAgentFiles,
  };
}
