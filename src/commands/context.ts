import { HarnessError, assembleContext } from "../core/harness/index.js";

export async function runContext(repoRoot: string, task: string): Promise<void> {
  let context;
  try {
    context = await assembleContext(repoRoot, task);
  } catch (error) {
    if (error instanceof HarnessError) {
      console.log("No harness found. Run `tr init` first.");
      return;
    }
    throw error;
  }

  console.log(`task: ${context.task}`);

  if (context.skills.length > 0) {
    console.log("\nskills:");
    for (const skill of context.skills) {
      console.log(`- ${skill.name} - ${skill.when}`);
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
    context.memory.length === 0
  ) {
    console.log("\nNo matching harness context for this task yet.");
  }
}
