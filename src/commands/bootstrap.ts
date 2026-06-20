import { bootstrapProject } from "../core/bootstrap.js";
import { profileIdSchema } from "../types.js";
import { printBootstrapReport } from "./session-output.js";

export type BootstrapCliOptions = {
  yes?: boolean;
  dryRun?: boolean;
  agent?: string;
  task?: string;
  mcp?: boolean;
  expose?: string;
  global?: boolean;
  init?: boolean;
  import?: boolean;
  profile?: string;
};

export async function runBootstrap(repoRoot: string, options: BootstrapCliOptions): Promise<void> {
  const report = await bootstrapProject(repoRoot, {
    yes: options.yes,
    dryRun: options.dryRun,
    agents: options.agent,
    task: options.task,
    mcp: options.mcp,
    expose: options.expose,
    noGlobal: options.global === false,
    noInit: options.init === false,
    import: options.import,
    profile: options.profile ? profileIdSchema.parse(options.profile) : undefined,
  });
  printBootstrapReport(report);

  if (report.mode === "write" && report.doctor && !report.doctor.ok) {
    process.exitCode = 1;
  }
}

