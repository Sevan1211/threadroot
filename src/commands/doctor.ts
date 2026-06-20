import { doctor } from "../core/doctor.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type DoctorCliOptions = JsonCliOptions;

export async function runDoctor(repoRoot: string, options: DoctorCliOptions = {}): Promise<void> {
  const report = await doctor(repoRoot);
  if (options.json) {
    printJson(report);
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  const actionable = report.findings.filter((finding) => finding.severity !== "info");
  const hints = report.findings.filter((finding) => finding.severity === "info");

  if (actionable.length === 0) {
    console.log("Threadroot doctor: clean");
    for (const finding of hints) {
      const suffix = finding.path ? ` (${finding.path})` : "";
      console.log(`- hint ${finding.code}: ${finding.message}${suffix}`);
    }
    return;
  }

  console.log(
    `Threadroot doctor: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`,
  );
  for (const finding of report.findings) {
    const label = finding.severity === "error" ? "error" : finding.severity === "warning" ? "warning" : "hint";
    const suffix = finding.path ? ` (${finding.path})` : "";
    console.log(`- ${label} ${finding.code}: ${finding.message}${suffix}`);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}
