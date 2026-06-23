import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { projectHarnessDir } from "../core/harness/paths.js";
import { importVendorFiles, type ImportReport } from "../core/init/import.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type ImportCliOptions = JsonCliOptions & {
  dryRun?: boolean;
  consolidate?: boolean;
  moveProviderFiles?: boolean;
};

async function writeReport(repoRoot: string, report: ImportReport): Promise<string[]> {
  const dir = path.join(projectHarnessDir(repoRoot), "imports");
  await mkdir(dir, { recursive: true });
  const reportPath = path.join(dir, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const written = [reportPath];
  if (report.canonicalBody.trim()) {
    const canonicalPath = path.join(dir, "canonical.md");
    await writeFile(canonicalPath, `${report.canonicalBody.trim()}\n`, "utf8");
    written.push(canonicalPath);
  }
  return written;
}

export async function runImport(repoRoot: string, options: ImportCliOptions = {}): Promise<void> {
  if (options.moveProviderFiles) {
    const message = "`--move-provider-files` is not implemented yet; Threadroot import is non-destructive in 0.1.8.";
    if (options.json) {
      printJson({ ok: false, error: "not_implemented", message });
    } else {
      console.error(message);
    }
    process.exitCode = 1;
    return;
  }

  const report = await importVendorFiles(repoRoot);
  const written = options.dryRun ? [] : await writeReport(repoRoot, report);
  const result = { ok: true, dryRun: Boolean(options.dryRun), consolidate: Boolean(options.consolidate), written, report };
  if (options.json) {
    printJson(result);
    return;
  }

  console.log(`Threadroot import: ${options.dryRun ? "dry-run" : "complete"}`);
  if (report.canonicalSource) {
    console.log(`canonical source: ${report.canonicalSource}`);
  } else {
    console.log("canonical source: none detected");
  }
  if (report.foldedFrom.length > 0) {
    console.log(`novel sections: ${report.foldedFrom.join(", ")}`);
  }
  if (report.skippedDuplicates.length > 0) {
    console.log(`duplicates skipped: ${report.skippedDuplicates.join(", ")}`);
  }
  if (report.importedRules.length > 0) {
    console.log(`cursor rules detected: ${report.importedRules.map((rule) => rule.name).join(", ")}`);
  }
  if (written.length > 0) {
    console.log("written:");
    for (const file of written) {
      console.log(`- ${path.relative(repoRoot, file)}`);
    }
  }
  if (options.consolidate) {
    console.log("note: consolidation is report-only in 0.1.8; visible provider files are never moved automatically.");
  }
}
