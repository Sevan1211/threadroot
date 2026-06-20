import { startSession } from "../core/bootstrap.js";
import { printStartReport } from "./session-output.js";

export type StartCliOptions = {
  task?: string;
};

export async function runStart(repoRoot: string, task: string | undefined, options: StartCliOptions): Promise<void> {
  const report = await startSession(repoRoot, { task: task ?? options.task });
  printStartReport(report);

  if (!report.status.exists || (report.doctor && !report.doctor.ok)) {
    process.exitCode = 1;
  }
}

