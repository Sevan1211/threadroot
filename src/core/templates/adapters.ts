import type { ProjectProfile, ThreadrootConfig } from "../../types.js";
import { commandList, generatedMarker, strictnessGuidance } from "./shared.js";

export function agentsMd(config: ThreadrootConfig, profile: ProjectProfile): string {
  return `${generatedMarker}

# AGENTS.md

## Project

${config.projectName} uses the ${profile.name} profile for a ${config.intent} project.

## Required Context

Before making changes, read:

- \`threadroot/project.md\`
- \`threadroot/repo-map.md\`
- \`threadroot/current-focus.md\`
- \`threadroot/handoff.md\`
- \`threadroot/commands.md\`
- \`threadroot/architecture.md\`
- \`threadroot/pitfalls.md\`
- \`threadroot/automation.md\`

## Working Rules

- Keep edits focused on the requested task.
- Prefer repo-owned Threadroot memory over assumptions.
- Do not treat generated adapter files as the canonical source.
- Use \`threadroot/skills/start-session.md\` at the start of larger sessions.
- Use \`threadroot/skills/refresh-context.md\` when generated context appears stale.
- Use \`threadroot/skills/update-memory.md\` before ending meaningful work.
- Before coding, run \`threadroot context suggest "<task>"\` when available.
- Run \`threadroot automation status\` to decide which upkeep command matches the current moment.
- After meaningful sessions, run \`threadroot refresh --memory\` and update handoff/current-focus if needed.
- After source tree or config changes, run \`threadroot map refresh\`.
- When available, run \`threadroot maintain\` as the one-command upkeep path for map, memory review, and generated adapters.
- Do not read every skill file up front. Read \`threadroot/skills/index.md\` or run \`threadroot skills suggest "<task>"\`, then load only relevant skills.

## Commands

${commandList(profile)}

## Validation Standard

${strictnessGuidance(config.strictness)}
`;
}

export function copilotInstructions(config: ThreadrootConfig, profile: ProjectProfile): string {
  return `${generatedMarker}

# Copilot Instructions

This repository uses Threadroot for repo-owned AI development context.

## Project Shape

- Project: ${config.projectName}
- Intent: ${config.intent}
- Profile: ${profile.name}
- Framework: ${profile.framework}
- Language: ${profile.language}

## Guidance

- Read \`threadroot/project.md\`, \`threadroot/current-focus.md\`, and \`threadroot/handoff.md\` when continuing work.
- Use \`threadroot context suggest "<task>"\` before coding when available.
- Use \`threadroot automation status\` to choose safe upkeep commands without guessing.
- Run \`threadroot refresh --memory\` after meaningful work to keep repo memory concise.
- Run \`threadroot maintain\` when you want one upkeep command for map, memory review, and generated agent files.
- Read \`threadroot/commands.md\`, \`threadroot/architecture.md\`, and \`threadroot/pitfalls.md\` before larger changes.
- Use \`threadroot/skills/index.md\` or \`threadroot skills suggest "<task>"\` to choose targeted skills without flooding context.
- Follow the commands in \`threadroot/commands.md\` when suggesting validation steps.
- Avoid inventing framework setup that has not been added to the repo yet.
- Keep generated-file edits minimal; prefer updating canonical Threadroot context.

## Commands

${commandList(profile)}
`;
}

export function readme(config: ThreadrootConfig, profile: ProjectProfile): string {
  return `# ${config.projectName}

Generated with Threadroot using the ${profile.name} profile.

## AI Development Context

- Project context: \`threadroot/project.md\`
- Current focus: \`threadroot/current-focus.md\`
- Session handoff: \`threadroot/handoff.md\`
- Commands: \`threadroot/commands.md\`
- Architecture notes: \`threadroot/architecture.md\`
- Automation guidance: \`threadroot/automation.md\`
- Codex guidance: \`AGENTS.md\`
- Copilot guidance: \`.github/copilot-instructions.md\`

## Getting Started

Add the real application scaffold for ${profile.framework}, then update the Threadroot context files with project-specific details.
`;
}

export function vscodeSettings(profile: ProjectProfile): string {
  return `${JSON.stringify(profile.vscodeSettings, null, 2)}\n`;
}

export function vscodeExtensions(profile: ProjectProfile): string {
  return `${JSON.stringify({ recommendations: profile.vscodeExtensions }, null, 2)}\n`;
}

export function gitignore(profile: ProjectProfile): string {
  const base = ["node_modules/", "dist/", "coverage/", ".env", ".env.*"];
  return `${Array.from(new Set([...base, ...profile.gitignore])).join("\n")}\n`;
}
