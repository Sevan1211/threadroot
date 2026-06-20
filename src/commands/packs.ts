import { inspectPack, installPack, listPacks, validatePack } from "../core/packs/index.js";

function printList(label: string, values: string[]): void {
  console.log(`${label}: ${values.length > 0 ? values.join(", ") : "none"}`);
}

export async function runPacksList(repoRoot: string): Promise<void> {
  const packs = await listPacks(repoRoot);
  if (packs.length === 0) {
    console.log("No packs found.");
    return;
  }
  for (const pack of packs) {
    console.log(`${pack.name} - ${pack.description}`);
  }
}

export async function runPacksInspect(repoRoot: string, nameOrPath: string): Promise<void> {
  const pack = await inspectPack(repoRoot, nameOrPath);
  console.log(pack.name);
  console.log(`description: ${pack.description}`);
  console.log(`path: ${pack.path}`);
  printList("skills", pack.skills);
  printList("tools", pack.tools);
  printList("rules", pack.rules);
  printList("connections", pack.connections);
}

export async function runPacksValidate(repoRoot: string, nameOrPath: string): Promise<void> {
  const report = await validatePack(repoRoot, nameOrPath);
  if (report.findings.length === 0) {
    console.log("Pack valid.");
    return;
  }
  for (const finding of report.findings) {
    console.log(`${finding.severity}: ${finding.message}`);
  }
  if (!report.ok) {
    process.exitCode = 1;
  }
}

export async function runPacksInstall(repoRoot: string, nameOrPath: string): Promise<void> {
  const pack = await installPack(repoRoot, nameOrPath);
  console.log(`Installed pack \`${pack.name}\`.`);
  printList("skills", pack.skills);
  printList("tools", pack.tools);
  printList("rules", pack.rules);
  printList("connections", pack.connections);
}
