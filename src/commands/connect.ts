import { connectProviders, type ConnectMode } from "../core/connect.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type ConnectCliOptions = JsonCliOptions & {
  all?: boolean;
  dryRun?: boolean;
  check?: boolean;
  undo?: boolean;
  status?: boolean;
  projectFiles?: boolean;
};

function modeFromOptions(options: ConnectCliOptions): ConnectMode {
  if (options.undo) return "undo";
  if (options.check) return "check";
  if (options.status) return "status";
  if (options.dryRun) return "plan";
  return "write";
}

export async function runConnect(
  repoRoot: string,
  agent: string | undefined,
  options: ConnectCliOptions = {},
): Promise<void> {
  const report = await connectProviders(repoRoot, {
    agents: options.all ? "all" : agent,
    mode: modeFromOptions(options),
    projectFiles: options.projectFiles,
  });

  if (options.json) {
    printJson(report);
    return;
  }

  console.log(`Threadroot connect: ${report.mode}${report.projectFiles ? " (project-files)" : ""}`);
  for (const result of report.agents) {
    console.log(`\n${result.agent}: ${result.status}`);
    console.log(`receipt: ${result.receiptPath}`);
    if (result.projectFiles.length > 0) {
      console.log("project files:");
      for (const file of result.projectFiles) {
        console.log(`- ${file}`);
      }
    }
    if (result.setupCommands.length > 0) {
      console.log("setup:");
      for (const command of result.setupCommands) {
        console.log(`- ${command}`);
      }
    }
    for (const note of result.notes) {
      console.log(`note: ${note}`);
    }
  }
}
