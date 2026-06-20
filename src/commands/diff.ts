import fs from "node:fs/promises";
import path from "node:path";
import { compile } from "../core/compile/index.js";
import { HarnessError, resolveHarness } from "../core/harness/index.js";

async function readIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/** Minimal line-level diff (longest-common-subsequence) for small text files. */
function lineDiff(before: string, after: string): string[] {
  const a = before.length === 0 ? [] : before.split("\n");
  const b = after.length === 0 ? [] : after.split("\n");
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push(`- ${a[i]}`);
      i += 1;
    } else {
      lines.push(`+ ${b[j]}`);
      j += 1;
    }
  }
  while (i < a.length) {
    lines.push(`- ${a[i]}`);
    i += 1;
  }
  while (j < b.length) {
    lines.push(`+ ${b[j]}`);
    j += 1;
  }
  return lines;
}

export async function runDiff(repoRoot: string): Promise<void> {
  let harness;
  try {
    harness = await resolveHarness(repoRoot);
  } catch (error) {
    if (error instanceof HarnessError) {
      console.log("No harness found. Run `tr init` first.");
      return;
    }
    throw error;
  }

  const files = await compile(repoRoot, harness);
  let changed = 0;

  for (const file of files) {
    const existing = await readIfExists(path.join(repoRoot, file.path));
    if (existing === undefined) {
      changed += 1;
      console.log(`+ ${file.path} (new)`);
      continue;
    }
    if (existing === file.content) {
      continue;
    }
    changed += 1;
    console.log(`~ ${file.path}`);
    for (const line of lineDiff(existing, file.content)) {
      console.log(`    ${line}`);
    }
  }

  if (changed === 0) {
    console.log("No drift: every vendor file matches the canonical harness.");
  }
}
