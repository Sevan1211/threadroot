import { type AdapterId, adapterIdSchema } from "../core/harness/index.js";
import { InitError, type InitOptions, initHarness } from "../core/init/index.js";
import { profileIdSchema } from "../types.js";

export type InitCliOptions = {
  force?: boolean;
  import?: boolean;
  profile?: string;
  adapters?: string;
};

function parseAdapters(value: string | undefined): AdapterId[] | undefined {
  if (!value) {
    return undefined;
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => adapterIdSchema.parse(entry));
}

export async function runInit(repoRoot: string, options: InitCliOptions): Promise<void> {
  const initOptions: InitOptions = {
    force: options.force,
    import: options.import,
    profile: options.profile ? profileIdSchema.parse(options.profile) : undefined,
    adapters: parseAdapters(options.adapters),
  };

  try {
    const report = await initHarness(repoRoot, initOptions);
    console.log(`Initialized harness \`${report.name}\` (profile: ${report.profile}).`);
    console.log(`adapters: ${report.adapters.join(", ")}`);
    console.log(`skills: ${report.skills.length}, tools: ${report.tools.length}, memory: ${report.memory.length}`);

    if (report.import?.canonicalSource) {
      console.log(`imported canonical prose from ${report.import.canonicalSource}`);
      if (report.import.foldedFrom.length > 0) {
        console.log(`  folded novel sections from: ${report.import.foldedFrom.join(", ")}`);
      }
      if (report.import.skippedDuplicates.length > 0) {
        console.log(`  skipped duplicates: ${report.import.skippedDuplicates.join(", ")}`);
      }
    }
    if (report.rules.length > 0) {
      console.log(`imported ${report.rules.length} cursor rule(s)`);
    }
    console.log(`compiled ${report.compiled.length} vendor file(s).`);
  } catch (error) {
    if (error instanceof InitError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
