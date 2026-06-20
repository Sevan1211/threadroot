import { appendMemory, readMemory } from "../core/harness/index.js";

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

export type RememberOptions = {
  type?: string;
};

export async function runRemember(repoRoot: string, note: string, options: RememberOptions = {}): Promise<void> {
  await runMemoryAppend(repoRoot, options.type ?? "handoff", note);
}
