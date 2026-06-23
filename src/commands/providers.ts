import { providerStatuses, type ProviderStatus } from "../core/provider-adapters.js";
import { printJson, type JsonCliOptions } from "./json.js";

export type ProvidersOptions = JsonCliOptions;

function formatProvider(status: ProviderStatus): string {
  const availability = status.defaultCli ? (status.available ? "available" : "missing") : "mcp";
  const runner =
    status.automation.status === "default-runner"
      ? `runner:${status.defaultPlan?.command ?? status.defaultCli ?? "unknown"}`
      : status.automation.status;
  return `${status.id}  [${availability}, ${runner}]  - ${status.automation.safety}`;
}

export async function runProvidersStatus(repoRoot: string, options: ProvidersOptions = {}): Promise<void> {
  const providers = await providerStatuses(repoRoot);
  if (options.json) {
    printJson({ providers });
    return;
  }

  console.log("Threadroot provider access:");
  for (const provider of providers) {
    console.log(formatProvider(provider));
    if (provider.mcp.setup.length > 0) {
      console.log(`  MCP: ${provider.mcp.setup[0]}`);
    }
    if (provider.mcp.access.checkCommand) {
      console.log(`  MCP check: ${provider.mcp.access.checkCommand}`);
    } else {
      console.log(`  MCP smoke tools: ${provider.mcp.access.smokeTools.join(", ")}`);
    }
  }
}
