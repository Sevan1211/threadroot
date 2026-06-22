import { HarnessError, assembleContext } from "../core/harness/index.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type ContextCliOptions = JsonCliOptions;

export async function runContext(repoRoot: string, task: string, options: ContextCliOptions = {}): Promise<void> {
  let context;
  try {
    context = await assembleContext(repoRoot, task);
  } catch (error) {
    if (error instanceof HarnessError) {
      if (options.json) {
        printJson({ ok: false, error: "harness_missing", message: "No harness found. Run `tr init` first." });
      } else {
        console.log("No harness found. Run `tr init` first.");
      }
      return;
    }
    throw error;
  }

  if (options.json) {
    printJson(context);
    return;
  }

  console.log(`task: ${context.task}`);

  if (context.skills.length > 0) {
    console.log("\nskills:");
    for (const skill of context.skills) {
      const trust = skill.reviewed ? "reviewed" : "unreviewed";
      console.log(`- ${skill.name} (${skill.risk}, ${trust}) - ${skill.when} [${skill.sourcePath}]`);
    }
  }

  if (context.rules.length > 0) {
    console.log("\nrules:");
    for (const rule of context.rules) {
      console.log(`- ${rule.name}${rule.applyTo ? ` (${rule.applyTo})` : ""}`);
    }
  }

  if (context.tools.length > 0) {
    console.log("\ntools:");
    for (const tool of context.tools) {
      console.log(`- ${tool.name} - ${tool.description}`);
    }
  }

  if (context.connections.length > 0) {
    console.log("\nconnections:");
    for (const connection of context.connections) {
      console.log(`- ${connection.name} (${connection.provider}, ${connection.risk}) - ${connection.description}`);
    }
  }

  if (context.memory.length > 0) {
    console.log("\nmemory:");
    for (const entry of context.memory) {
      console.log(`- ${entry.type}`);
    }
  }

  if (
    context.skills.length === 0 &&
    context.rules.length === 0 &&
    context.tools.length === 0 &&
    context.connections.length === 0 &&
    context.memory.length === 0
  ) {
    console.log("\nNo matching harness context for this task yet.");
  }
}
