import type { BootstrapReport, StartReport } from "../core/bootstrap.js";
import type { DoctorReport } from "../core/doctor.js";
import type { HarnessContext } from "../core/harness/index.js";
import type { HarnessStatus } from "../core/status.js";

function printDoctor(report: DoctorReport | undefined): void {
  if (!report) {
    return;
  }
  const actionable = report.findings.filter((finding) => finding.severity !== "info");
  console.log(actionable.length === 0 ? "doctor: clean" : `doctor: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`);
  for (const finding of report.findings.slice(0, 8)) {
    const label = finding.severity === "info" ? "hint" : finding.severity;
    const suffix = finding.path ? ` (${finding.path})` : "";
    console.log(`- ${label} ${finding.code}: ${finding.message}${suffix}`);
  }
  if (report.findings.length > 8) {
    console.log(`- ... ${report.findings.length - 8} more finding(s)`);
  }
}

function printStatus(status: HarnessStatus | undefined): void {
  if (!status) {
    return;
  }
  if (!status.exists) {
    console.log("harness: missing");
    return;
  }
  console.log(`harness: ${status.manifest.name} (${status.manifest.profile})`);
  console.log(`adapters: ${status.manifest.adapters.length > 0 ? status.manifest.adapters.join(", ") : "none (local-only)"}`);
  console.log(
    `objects: ${status.counts.skills} skills, ${status.counts.rules} rules, ${status.counts.tools} tools, ${status.counts.memory} memory`,
  );
}

function printContext(context: HarnessContext | undefined): void {
  if (!context) {
    return;
  }

  console.log(`task: ${context.task}`);
  if (context.skills.length > 0) {
    const skillLabel = context.skills.some((skill) => skill.score > 0) ? "relevant skills:" : "starter skills:";
    console.log(skillLabel);
    for (const skill of context.skills.slice(0, 8)) {
      console.log(`- ${skill.name} - ${skill.when}`);
    }
  } else {
    console.log("relevant skills: none matched; run `threadroot skills list` to inspect all skills.");
  }

  if (context.tools.length > 0) {
    console.log("available tools:");
    for (const tool of context.tools.slice(0, 8)) {
      console.log(`- ${tool.name} (${tool.risk}) - ${tool.description}`);
    }
  }

  if (context.memory.length > 0) {
    console.log(`memory: ${context.memory.map((entry) => entry.type).join(", ")}`);
  }
}

function printCommandMap(): void {
  console.log("agent command map:");
  console.log('- `threadroot start "<task>"` - begin a focused agent session');
  console.log('- `threadroot context "<task>"` - get relevant skills, tools, rules, and memory');
  console.log("- `threadroot doctor` - check harness health and trust issues");
  console.log("- `threadroot skills list|inspect|validate` - inspect skill capabilities");
  console.log("- `threadroot tools list|check` and `threadroot run <tool>` - use explicit local tools");
  console.log("- `threadroot remember \"<note>\"` - save durable handoff/project memory");
}

function printMcpCheck(report: BootstrapReport["mcpCheck"]): void {
  if (!report) {
    return;
  }
  console.log(`mcp check: ${report.status}`);
  if (report.entry) {
    console.log(`mcp server: ${report.entry.command} ${report.entry.args.join(" ")}`.trim());
  }
  for (const message of report.messages) {
    console.log(`- ${message}`);
  }
}

export function printBootstrapReport(report: BootstrapReport): void {
  console.log(`Threadroot bootstrap: ${report.mode === "write" ? "complete" : "plan"}`);

  if (report.setup) {
    console.log("global setup:");
    for (const entry of report.setup.entries) {
      const suffix = entry.message ? ` - ${entry.message}` : "";
      console.log(`- ${entry.label}: ${entry.status} ${entry.path}${suffix}`);
    }
  }

  if (report.init) {
    console.log("project init: created local-only .threadroot/");
  } else if (report.harnessExisted) {
    console.log("project init: existing harness preserved");
  }

  if (report.expose) {
    console.log("project exposure:");
    for (const entry of report.expose.entries) {
      const suffix = entry.message ? ` - ${entry.message}` : "";
      console.log(`- ${entry.label}: ${entry.status} ${entry.path}${suffix}`);
    }
  }

  if (report.packs && report.packs.length > 0) {
    console.log(`packs: ${report.packs.map((pack) => pack.name).join(", ")}`);
  }

  printStatus(report.status);
  printMcpCheck(report.mcpCheck);
  printDoctor(report.doctor);
  printContext(report.context);
  printCommandMap();

  for (const note of report.notes) {
    console.log(`note: ${note}`);
  }
  if (report.mode === "write") {
    console.log('Success: Threadroot is ready. Run `threadroot start "<task>"` for future sessions.');
  }
}

export function printStartReport(report: StartReport): void {
  console.log("Threadroot start:");
  printStatus(report.status);
  printDoctor(report.doctor);
  printContext(report.context);
  printCommandMap();
  for (const note of report.notes) {
    console.log(`note: ${note}`);
  }
}
