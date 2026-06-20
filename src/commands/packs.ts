import { inspectPack, installPack, listPacks, validatePack } from "../core/packs/index.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type PacksCliOptions = JsonCliOptions;

function printList(label: string, values: string[]): void {
  console.log(`${label}: ${values.length > 0 ? values.join(", ") : "none"}`);
}

export async function runPacksList(repoRoot: string, options: PacksCliOptions = {}): Promise<void> {
  const packs = await listPacks(repoRoot);
  if (options.json) {
    printJson({ packs });
    return;
  }

  if (packs.length === 0) {
    console.log("No packs found.");
    return;
  }
  for (const pack of packs) {
    console.log(`${pack.name} - ${pack.description}`);
  }
}

export async function runPacksInspect(repoRoot: string, nameOrPath: string, options: PacksCliOptions = {}): Promise<void> {
  const pack = await inspectPack(repoRoot, nameOrPath);
  if (options.json) {
    printJson(pack);
    return;
  }

  console.log(pack.name);
  console.log(`description: ${pack.description}`);
  console.log(`path: ${pack.path}`);
  printList("skills", pack.skills);
  printList("tools", pack.tools);
  printList("rules", pack.rules);
  printList("connections", pack.connections);
}

export async function runPacksValidate(repoRoot: string, nameOrPath: string, options: PacksCliOptions = {}): Promise<void> {
  const report = await validatePack(repoRoot, nameOrPath);
  if (options.json) {
    printJson(report);
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

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

export async function runPacksInstall(repoRoot: string, nameOrPath: string, options: PacksCliOptions = {}): Promise<void> {
  const pack = await installPack(repoRoot, nameOrPath);
  if (options.json) {
    printJson(pack);
    return;
  }

  console.log(`Installed pack \`${pack.name}\`.`);
  printList("skills", pack.skills);
  printList("tools", pack.tools);
  printList("rules", pack.rules);
  printList("connections", pack.connections);
}
