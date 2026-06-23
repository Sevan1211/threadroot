import { stat } from "node:fs/promises";
import path from "node:path";

import type { ProfileId } from "../types.js";
import { doctor, type DoctorReport } from "./doctor.js";
import { exposeProject, type ExposeResult } from "./expose.js";
import { assembleContext, type HarnessContext } from "./harness/index.js";
import { initHarness, type InitReport } from "./init/index.js";
import { type McpServerEntry } from "./mcp-config.js";
import { checkCodexMcp, type McpCheckReport } from "./mcp-check.js";
import { setupGlobal, type GlobalSetupResult, type SetupMode } from "./setup.js";
import { harnessStatus, type HarnessStatus } from "./status.js";

export type BootstrapOptions = {
  yes?: boolean;
  dryRun?: boolean;
  agents?: string;
  task?: string;
  mcp?: boolean;
  expose?: string;
  noGlobal?: boolean;
  noInit?: boolean;
  import?: boolean;
  profile?: ProfileId;
  home?: string;
  mcpEntry?: McpServerEntry;
};

export type BootstrapReport = {
  mode: "plan" | "write";
  task: string;
  harnessExisted: boolean;
  setup?: GlobalSetupResult;
  init?: InitReport;
  expose?: ExposeResult;
  status?: HarnessStatus;
  doctor?: DoctorReport;
  context?: HarnessContext;
  mcpCheck?: McpCheckReport;
  notes: string[];
};

export type StartOptions = {
  task?: string;
  home?: string;
};

export type StartReport = {
  task: string;
  status: HarnessStatus;
  doctor?: DoctorReport;
  context?: HarnessContext;
  notes: string[];
};

const DEFAULT_TASK = "start this project";

async function harnessExists(repoRoot: string): Promise<boolean> {
  return pathExists(path.join(repoRoot, ".threadroot", "harness.yaml"));
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function modeFor(options: BootstrapOptions): SetupMode {
  return options.yes && !options.dryRun ? "write" : "dry-run";
}

export async function bootstrapProject(repoRoot: string, options: BootstrapOptions = {}): Promise<BootstrapReport> {
  const task = options.task?.trim() || DEFAULT_TASK;
  const mode = modeFor(options);
  const write = mode === "write";
  const notes: string[] = [];
  const existed = await harnessExists(repoRoot);
  let setup: GlobalSetupResult | undefined;
  let init: InitReport | undefined;
  let exposed: ExposeResult | undefined;

  if (!options.noGlobal) {
    setup = await setupGlobal({
      agents: options.agents ?? "all",
      mode,
      home: options.home,
      mcp: options.mcp,
      mcpEntry: options.mcpEntry,
    });
  } else {
    notes.push("Skipped global setup because --no-global was set.");
  }

  if (!existed && !options.noInit) {
    if (write) {
      init = await initHarness(repoRoot, {
        import: options.import,
        profile: options.profile,
        home: options.home,
      });
    } else {
      notes.push(`Would initialize local-only harness at ${path.join(".threadroot", "harness.yaml")}.`);
    }
  } else if (existed) {
    notes.push("Existing harness detected; bootstrap will not reinitialize it.");
  } else {
    notes.push("Skipped project initialization because --no-init was set.");
  }

  const hasHarnessAfterInit = existed || Boolean(init) || (await pathExists(path.join(repoRoot, ".threadroot", "harness.yaml")));

  if (options.expose) {
    exposed = await exposeProject(repoRoot, {
      agents: options.expose,
      mode,
    });
  }

  let status: HarnessStatus | undefined;
  let doctorReport: DoctorReport | undefined;
  let context: HarnessContext | undefined;
  let mcpCheck: McpCheckReport | undefined;
  if (options.mcp && write) {
    mcpCheck = await checkCodexMcp({ repoRoot, home: options.home });
  }
  if (hasHarnessAfterInit) {
    status = await harnessStatus(repoRoot, { home: options.home });
    doctorReport = await doctor(repoRoot, { home: options.home });
    if (status.exists) {
      context = await assembleContext(repoRoot, task, { home: options.home, fallbackSkills: true });
    }
  } else {
    notes.push("Skipped doctor/status/context because no harness exists yet.");
  }

  if (!write) {
    notes.push("Run `threadroot bootstrap --yes` to apply this plan.");
  }

  return {
    mode: write ? "write" : "plan",
    task,
    harnessExisted: existed,
    setup,
    init,
    expose: exposed,
    status,
    doctor: doctorReport,
    context,
    mcpCheck,
    notes,
  };
}

export async function startSession(repoRoot: string, options: StartOptions = {}): Promise<StartReport> {
  const task = options.task?.trim() || DEFAULT_TASK;
  const status = await harnessStatus(repoRoot, { home: options.home });
  const notes: string[] = [];

  if (!status.exists) {
    return {
      task,
      status,
      notes: ["No harness found. Run `threadroot init` first."],
    };
  }

  const doctorReport = await doctor(repoRoot, { home: options.home });
  const context = await assembleContext(repoRoot, task, { home: options.home, fallbackSkills: true });
  return { task, status, doctor: doctorReport, context, notes };
}
