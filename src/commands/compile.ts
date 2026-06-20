import { runCompile } from "../core/compile/write.js";
import { type AdapterId, adapterIdSchema } from "../core/harness/index.js";
import { HarnessError } from "../core/harness/index.js";

export type CompileCliOptions = {
  adapter?: string;
};

export async function runCompileCommand(repoRoot: string, options: CompileCliOptions): Promise<void> {
  const adapter: AdapterId | undefined = options.adapter ? adapterIdSchema.parse(options.adapter) : undefined;
  try {
    const { written, drift } = await runCompile(repoRoot, { adapter });
    const changed = drift.filter((entry) => entry.status !== "unchanged").length;
    console.log(`Compiled ${written.length} vendor file(s)${changed > 0 ? ` (${changed} changed)` : ""}.`);
    for (const file of written) {
      console.log(`  ${file}`);
    }
  } catch (error) {
    if (error instanceof HarnessError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
