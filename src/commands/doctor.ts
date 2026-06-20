import { doctor } from "../core/doctor.js";

export async function runDoctor(repoRoot: string): Promise<void> {
  const report = await doctor(repoRoot);

  if (report.findings.length === 0) {
    console.log("Threadroot doctor: clean");
    return;
  }

  console.log(`Threadroot doctor: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`);
  for (const finding of report.findings) {
    const label = finding.severity === "error" ? "error" : "warning";
    const suffix = finding.path ? ` (${finding.path})` : "";
    console.log(`- ${label} ${finding.code}: ${finding.message}${suffix}`);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}
