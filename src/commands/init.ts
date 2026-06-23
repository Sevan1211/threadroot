import { type AdapterId, adapterIdSchema } from "../core/harness/index.js";
import { InitError, type InitOptions, initHarness } from "../core/init/index.js";
import { profileIdSchema } from "../types.js";

export type InitCliOptions = {
  force?: boolean;
  yes?: boolean;
  import?: boolean;
  profile?: string;
  adapters?: string;
  expose?: string;
  gitignore?: boolean;
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
    expose: options.expose,
    gitignore: options.gitignore,
  };

  try {
    const report = await initHarness(repoRoot, initOptions);
    console.log(`Initialized harness \`${report.name}\` (profile: ${report.profile}).`);
    console.log(`adapters: ${report.adapters.length > 0 ? report.adapters.join(", ") : "none (local-only)"}`);
    console.log(`skills: ${report.skills.length}, tools: ${report.tools.length}, memory: ${report.memory.length}`);
    if (report.ignore.status === "skipped") {
      console.log("ignore: skipped (not a git repo); keep .threadroot/ out of commits if you add git later");
    } else {
      console.log(`ignore: ${report.ignore.path} (${report.ignore.status})`);
    }

    if (report.import?.canonicalSource) {
      console.log(`detected provider prose from ${report.import.canonicalSource}`);
      if (report.import.foldedFrom.length > 0) {
        console.log(`  found novel sections in: ${report.import.foldedFrom.join(", ")}`);
      }
      if (report.import.skippedDuplicates.length > 0) {
        console.log(`  skipped duplicates: ${report.import.skippedDuplicates.join(", ")}`);
      }
      if (report.importFiles.length > 0) {
        console.log(`  import report: ${report.importFiles.map((file) => file.replace(`${repoRoot}/`, "")).join(", ")}`);
      }
    }
    if (report.rules.length > 0) {
      console.log(`imported ${report.rules.length} cursor rule(s)`);
    }
    console.log(`compiled ${report.compiled.length} vendor file(s).`);
    if (report.exposed.length > 0) {
      console.log(`exposed ${report.exposed.length} provider skill shim(s).`);
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
