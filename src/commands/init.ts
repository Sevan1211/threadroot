import { InitError, type InitOptions, initHarness } from "../core/init/index.js";
import { profileIdSchema } from "../types.js";

export type InitCliOptions = {
  force?: boolean;
  yes?: boolean;
  import?: boolean;
  profile?: string;
  gitignore?: boolean;
};

export async function runInit(repoRoot: string, options: InitCliOptions): Promise<void> {
  const initOptions: InitOptions = {
    force: options.force,
    import: options.import,
    profile: options.profile ? profileIdSchema.parse(options.profile) : undefined,
    gitignore: options.gitignore,
  };

  try {
    const report = await initHarness(repoRoot, initOptions);
    console.log(`Initialized Codex optimizer \`${report.name}\` (profile: ${report.profile}).`);
    console.log(`state: ${report.stateDir.replace(`${repoRoot}/`, "")}`);
    console.log(`guidance: ${report.agentsPath.replace(`${repoRoot}/`, "")}`);
    console.log(`ignore: ${report.ignore.path} (${report.ignore.status})`);

    if (report.import?.canonicalSource) {
      console.log(`detected Codex prose from ${report.import.canonicalSource}`);
      if (report.import.foldedFrom.length > 0) {
        console.log(`  found novel sections in: ${report.import.foldedFrom.join(", ")}`);
      }
      if (report.import.skippedDuplicates.length > 0) {
        console.log(`  skipped duplicates: ${report.import.skippedDuplicates.join(", ")}`);
      }
    }
    if (report.rules.length > 0) {
      console.log(`imported ${report.rules.length} rule(s)`);
    }
    console.log("created Codex AGENTS.md guidance.");
    if (report.nextSteps.length > 0) {
      console.log("next:");
      for (const step of report.nextSteps) {
        console.log(`- ${step.command} (${step.reason})`);
      }
    }
  } catch (error) {
    if (error instanceof InitError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
