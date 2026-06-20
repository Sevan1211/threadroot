import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AUTOMATION_PATH } from "./paths.js";
import type { GeneratedFile } from "../types.js";

const automationTriggerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  when: z.string().min(1),
  command: z.string().min(1),
  writes: z.boolean(),
  readFirst: z.array(z.string()),
});

const automationConfigSchema = z.object({
  version: z.literal(1),
  mode: z.literal("agent-suggested"),
  enabled: z.boolean(),
  notes: z.array(z.string()),
  triggers: z.array(automationTriggerSchema),
});

export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;
export type AutomationConfig = z.infer<typeof automationConfigSchema>;

export function defaultAutomationConfig(): AutomationConfig {
  return {
    version: 1,
    mode: "agent-suggested",
    enabled: false,
    notes: [
      "Threadroot automation is guidance-first in V1. Agents should suggest or run these commands only when the moment matches.",
      "Prefer dry runs before writes when a command could touch generated files or memory.",
      "If a command reports manual edits, show the diff and ask before overwriting.",
    ],
    triggers: [
      {
        id: "session-start",
        name: "Session start",
        when: "At the beginning of a new coding-agent session.",
        command: "threadroot doctor",
        writes: false,
        readFirst: ["AGENTS.md", "threadroot/project.md", "threadroot/current-focus.md", "threadroot/handoff.md"],
      },
      {
        id: "task-routing",
        name: "Task routing",
        when: "Before coding once the task is known.",
        command: 'threadroot context suggest "<task>"',
        writes: false,
        readFirst: ["threadroot/repo-map.md", "threadroot/skills/index.md"],
      },
      {
        id: "structure-change",
        name: "Structure change",
        when: "After adding, removing, or moving important source/config directories.",
        command: "threadroot map refresh --dry-run",
        writes: false,
        readFirst: ["threadroot/repo-map.md", "threadroot/architecture.md"],
      },
      {
        id: "meaningful-work",
        name: "Meaningful work",
        when: "After a real implementation session, dependency change, or workflow change.",
        command: "threadroot maintain --dry-run",
        writes: false,
        readFirst: ["threadroot/current-focus.md", "threadroot/handoff.md", "threadroot/decisions.md"],
      },
      {
        id: "session-end",
        name: "Session end",
        when: "Before ending a substantial session or switching models/tools.",
        command: "threadroot refresh --memory",
        writes: true,
        readFirst: ["threadroot/handoff.md", "threadroot/current-focus.md", "threadroot/pitfalls.md"],
      },
    ],
  };
}

export function setAutomationEnabled(config: AutomationConfig, enabled: boolean): AutomationConfig {
  return {
    ...config,
    enabled,
  };
}

export function automationMarkdown(config: AutomationConfig = defaultAutomationConfig()): string {
  const notes = config.notes.map((note) => `- ${note}`).join("\n");
  const triggers = config.triggers
    .map(
      (trigger) => `## ${trigger.name}

- Trigger: ${trigger.when}
- Command: \`${trigger.command}\`
- Writes files: ${trigger.writes ? "yes" : "no"}
- Read first: ${trigger.readFirst.map((item) => `[${item}](${item})`).join(", ")}
`,
    )
    .join("\n");

  return `# Automation

Threadroot automation is currently agent-suggested, not background execution. Use this file to decide when Codex, Copilot Chat, Cursor, Claude Code, or another coding agent should refresh project context.

## Mode

- Enabled: ${config.enabled ? "yes" : "no"}
- Mode: ${config.mode}

## Rules

${notes}

${triggers}
## Safe Write Policy

For commands that can write files, prefer the dry-run form first when available. If Threadroot reports stale generated files or manual edits, inspect the diff and ask before overwriting.
`;
}

export function automationFiles(config: AutomationConfig = defaultAutomationConfig()): GeneratedFile[] {
  return [
    { path: "threadroot/automation.md", content: automationMarkdown(config), generated: false },
    { path: AUTOMATION_PATH, content: `${JSON.stringify(config, null, 2)}\n`, generated: false },
  ];
}

export async function readAutomationConfig(repoRoot: string): Promise<AutomationConfig> {
  try {
    const raw = await fs.readFile(path.join(repoRoot, AUTOMATION_PATH), "utf8");
    return automationConfigSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultAutomationConfig();
    }

    throw error;
  }
}

export function formatAutomationStatus(config: AutomationConfig): string {
  const status = config.enabled ? "enabled" : "suggested only";
  const triggers = config.triggers
    .map((trigger) => {
      const writeMode = trigger.writes ? "writes files" : "read-only";
      return `- ${trigger.name}: ${trigger.command} (${writeMode})\n  When: ${trigger.when}`;
    })
    .join("\n");

  return `Threadroot automation: ${status}
Mode: ${config.mode}

${config.notes.map((note) => `- ${note}`).join("\n")}

Recommended triggers:
${triggers}
`;
}
