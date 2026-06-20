import { runDoctor } from "../core/doctor.js";

export async function runDoctorCommand(repoRoot: string): Promise<void> {
  const result = await runDoctor(repoRoot);

  if (result.issues.length === 0) {
    console.log("Threadroot doctor: clean.");
    return;
  }

  for (const issue of result.issues) {
    console.log(`${issue.level === "error" ? "error" : "warning"}: ${issue.message}`);
  }

  if (result.actions.length > 0) {
    console.log("\nRecommended next commands:");
    for (const action of result.actions) {
      console.log(`- ${action.command} - ${action.reason}`);
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}
