export function maintainPrompt(): string {
  return `You are maintaining this repository's Threadroot context after meaningful project work.

Goal:
Keep Threadroot useful without bloating context or overwriting user-owned files.

Run:
1. \`threadroot doctor\`
2. \`threadroot maintain\`
3. If a specific task is still active, run \`threadroot context suggest "<task>"\`

Review:
- [threadroot/memory-review.md](threadroot/memory-review.md)
- [threadroot/repo-map.md](threadroot/repo-map.md)
- [threadroot/handoff.md](threadroot/handoff.md)
- [threadroot/current-focus.md](threadroot/current-focus.md)
- [threadroot/decisions.md](threadroot/decisions.md)
- [threadroot/pitfalls.md](threadroot/pitfalls.md)

Rules:
- Do not delete memory silently.
- Move stale session detail into \`threadroot/archive/\` if needed.
- Keep top-level memory files short, current, and durable.
- Add project-specific skills only for repeated repo workflows.
- Preserve existing README and AGENTS files unless the user explicitly approves changes.
- If Threadroot reports manual edits, show the diff and ask before overwriting.

Finish by summarizing:
- files refreshed
- memory warnings
- suggested archive/offload action
- any project-specific skills worth creating`;
}
