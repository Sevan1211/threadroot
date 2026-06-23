import { appendMemory, compactMemory, readMemory } from "../core/harness/index.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type MemoryGcCliOptions = JsonCliOptions & {
  type?: string;
  maxEntries?: string;
  maxChars?: string;
  dryRun?: boolean;
};

export async function runMemoryRead(repoRoot: string, type: string): Promise<void> {
  const body = await readMemory(repoRoot, type);
  if (body === null) {
    console.log(`No ${type} memory yet.`);
    return;
  }
  console.log(body);
}

export async function runMemoryAppend(repoRoot: string, type: string, note: string): Promise<void> {
  const result = await appendMemory(repoRoot, type, note);
  console.log(`Appended to ${result.scope} ${result.type} memory (${result.path}).`);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got ${value}.`);
  }
  return parsed;
}

export async function runMemoryGc(repoRoot: string, options: MemoryGcCliOptions = {}): Promise<void> {
  const result = await compactMemory(repoRoot, {
    type: options.type,
    maxEntries: parsePositiveInteger(options.maxEntries, 40),
    maxChars: parsePositiveInteger(options.maxChars, 8000),
    dryRun: options.dryRun,
  });
  if (options.json) {
    printJson(result);
    return;
  }
  if (result.files.length === 0) {
    console.log("No compactable memory files found.");
    return;
  }
  for (const file of result.files) {
    const status = file.changed ? "compacted" : "unchanged";
    console.log(`${status} ${file.type}: ${file.entriesBefore} -> ${file.entriesAfter} entries, ${file.charsBefore} -> ${file.charsAfter} chars`);
    if (file.archivePath) {
      console.log(`  archive: ${file.archivePath}`);
    }
  }
}

export type RememberOptions = {
  type?: string;
};

export async function runRemember(repoRoot: string, note: string, options: RememberOptions = {}): Promise<void> {
  await runMemoryAppend(repoRoot, options.type ?? "handoff", note);
}
