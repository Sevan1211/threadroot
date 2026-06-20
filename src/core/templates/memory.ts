import type { RevampContext, SourceExtract, ThreadrootConfig } from "../../types.js";

export function currentFocusContext(config: ThreadrootConfig): string {
  return `# Current Focus

## Now

- Define the next concrete milestone for ${config.projectName}.
- Keep this file short enough for every new agent session to read.

## Next Session

- Confirm the current milestone.
- Read \`threadroot/handoff.md\` before making changes.
- Update this file when the active project focus changes.
`;
}

export function handoffContext(): string {
  return `# Handoff

Use this file to preserve working memory between agent sessions, model switches, and IDE/tool changes.

## Latest Handoff

- No handoff recorded yet.

## Update Rules

- Record only durable context that helps the next session.
- Do not paste chat transcripts.
- Include changed files, validation status, blockers, and next recommended action.
`;
}

export function decisionsContext(): string {
  return `# Decisions

Record durable product or technical decisions here.

## Format

- Date:
- Decision:
- Reason:
- Consequences:

## Decisions

- No decisions recorded yet.
`;
}

export function pitfallsContext(): string {
  return `# Pitfalls

Record project-specific mistakes, sharp edges, and things agents should avoid repeating.

## Pitfalls

- No pitfalls recorded yet.
`;
}

function sourceSummary(source: SourceExtract): string {
  const headings = source.headings.slice(0, 8).map((heading) => `  - ${heading}`).join("\n");
  const snippets = source.snippets.slice(0, 3).map((snippet) => `  - ${snippet}`).join("\n");
  return `## ${source.path}

- Type: ${source.kind}

${headings ? `Headings:\n${headings}\n\n` : ""}${snippets ? `Extracts:\n${snippets}\n` : ""}`;
}

export function sourcesContext(context?: RevampContext): string {
  if (!context || context.selectedSources.length === 0) {
    return `# Sources

Threadroot has not imported existing project sources yet.

Use \`threadroot revamp\` to select old docs, agent files, and config files that should inform project memory.
`;
  }

  return `# Sources

Threadroot selected these existing files as project memory sources during revamp.

${context.selectedSources.map(sourceSummary).join("\n")}`;
}
