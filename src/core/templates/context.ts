import type { ProjectProfile, RevampContext, ThreadrootConfig } from "../../types.js";
import { commandList, intentGuidance, notesList, strictnessGuidance } from "./shared.js";

export function projectContext(config: ThreadrootConfig, profile: ProjectProfile): string {
  return `# ${config.projectName}

## Purpose

Describe what this project does, who it serves, and what a successful first version should accomplish.

## Stack

- Profile: ${profile.name}
- Project intent: ${config.intent}
- Language: ${profile.language}
- Framework: ${profile.framework}
- Package/tool manager: ${profile.packageManager}
- AI targets: ${config.targets.join(", ")}
- Workflow strictness: ${config.strictness}

## Operating Principle

${strictnessGuidance(config.strictness)}

## Intent Guidance

${intentGuidance(config.intent)}
`;
}

export function commandsContext(profile: ProjectProfile, context?: RevampContext): string {
  const detected = context?.detectedCommands.length
    ? `\n## Detected Commands\n\n${context.detectedCommands
        .map((item) => `- \`${item.command}\` - ${item.purpose}`)
        .join("\n")}\n`
    : "";

  return `# Commands

These are the expected commands for this project profile. Replace placeholders once the real app/tooling exists.

${commandList(profile)}
${detected}
## Validation

Before claiming a change is complete, run the most relevant validation command above. If validation cannot be run, explain why and identify the risk.
`;
}

export function architectureContext(profile: ProjectProfile, context?: RevampContext): string {
  const signals = context?.configSignals.length
    ? `\n## Detected Project Signals\n\n${context.configSignals
        .map((signal) => `- ${signal.path}: ${signal.label} = ${signal.value}`)
        .join("\n")}\n`
    : "";

  return `# Architecture

## Profile Notes

${notesList(profile)}
${signals}
## Boundaries

- Keep generated files and durable Threadroot context separate.
- Update this file when major directories, ownership boundaries, or architectural decisions change.

## Decisions

Record durable decisions in \`threadroot/decisions.md\`.
`;
}
