export type AgentPromptTarget = "codex" | "copilot";

function targetInstructions(target: AgentPromptTarget): string {
  if (target === "codex") {
    return `You are operating in Codex. Prefer terminal commands for deterministic Threadroot operations, inspect diffs before writes, and use repo files as the source of truth.`;
  }

  return `You are operating in VS Code Copilot Chat. Use @workspace context when helpful, but prefer Threadroot's generated repo memory, skills, and context router over broad workspace reads.`;
}

export function agentBootstrapPrompt(target: AgentPromptTarget): string {
  return `${targetInstructions(target)}

Goal:
Set up or use Threadroot as this repository's agentic project memory, skill router, and context router.

Core rule:
Do not flood context. Load the smallest useful set of memory, skills, and code files for the task.

If Threadroot is not installed or this repo is not initialized:
1. Check whether the repo already has meaningful files.
2. If the repo is mostly empty, run \`threadroot start\`.
3. If the repo has existing README/docs/config/agent files, run \`threadroot revamp\`.
4. Ask before writing files.
5. Preserve existing \`README.md\` and \`AGENTS.md\`; if \`AGENTS.md\` exists, prefer \`AGENTS.threadroot.md\` as a merge candidate.

After Threadroot is initialized:
1. Run \`threadroot map refresh\` to build [threadroot/repo-map.md](threadroot/repo-map.md).
2. For any coding task, run \`threadroot context suggest "<task>"\`.
3. Read only the suggested memory files, skill files, and code areas.
4. Implement the task using existing project patterns.
5. Run validation commands from [threadroot/commands.md](threadroot/commands.md).
6. If durable project knowledge changed, update [threadroot/handoff.md](threadroot/handoff.md), [threadroot/decisions.md](threadroot/decisions.md), or [threadroot/pitfalls.md](threadroot/pitfalls.md).
7. Run \`threadroot refresh --memory\` after meaningful sessions and use the report to keep memory concise.
8. Run \`threadroot maintain\` when map, memory review, and generated agent files should all be refreshed together.

Skill workflow:
- Use [threadroot/skills/index.md](threadroot/skills/index.md) as the compact skill router.
- Run \`threadroot skills suggest "<task>"\` before loading detailed skills.
- Do not read every skill file up front.
- If the repo has repeated workflows not covered by curated skills, propose 1-3 project-specific skills under \`threadroot/skills/project/\`.

Useful commands:
- \`threadroot start\`
- \`threadroot revamp\`
- \`threadroot map refresh\`
- \`threadroot context suggest "<task>"\`
- \`threadroot skills suggest "<task>"\`
- \`threadroot prompt skills\`
- \`threadroot refresh --memory\`
- \`threadroot maintain\`
- \`threadroot doctor\`
- \`threadroot refresh\`

Begin by identifying whether this is a new or existing project, then explain the Threadroot action you recommend before running it.`;
}
