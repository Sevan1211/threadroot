import { readConfig } from "./config.js";
import { getProfile } from "./profiles.js";
import { readProjectSkills } from "./project-skills.js";
import { buildRepoMap } from "./repo-map.js";
import { selectSkills, skillPath, skillPacks, suggestSkills } from "./skill-packs.js";
import type { RepoMapEntry, SkillDefinition } from "../types.js";

export type ContextSuggestion = {
  task: string;
  memoryFiles: string[];
  skills: SkillDefinition[];
  codeAreas: RepoMapEntry[];
  commands: Array<{ command: string; purpose: string }>;
};

function taskTerms(task: string): string[] {
  return task
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .filter((term) => term.length > 2);
}

function scoreEntry(entry: RepoMapEntry, terms: string[]): number {
  const haystack = `${entry.path} ${entry.role}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

async function skillsForRepo(repoRoot: string): Promise<SkillDefinition[]> {
  try {
    const config = await readConfig(repoRoot);
    const profile = getProfile(config.profile);
    return [
      ...selectSkills([config.profile, profile.framework, profile.language, config.intent]),
      ...(await readProjectSkills(repoRoot)),
    ];
  } catch {
    return skillPacks.flatMap((pack) => pack.skills);
  }
}

export async function suggestContext(repoRoot: string, task: string): Promise<ContextSuggestion> {
  const [map, skills] = await Promise.all([buildRepoMap(repoRoot), skillsForRepo(repoRoot)]);
  const terms = taskTerms(task);
  const codeAreas = map.entries
    .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.score - a.entry.score)
    .slice(0, 8)
    .map((item) => item.entry);

  return {
    task,
    memoryFiles: [
      "threadroot/project.md",
      "threadroot/current-focus.md",
      "threadroot/handoff.md",
      "threadroot/repo-map.md",
      "threadroot/pitfalls.md",
    ],
    skills: suggestSkills(task, skills),
    codeAreas,
    commands: map.commands.slice(0, 8).map((command) => ({ command: command.command, purpose: command.purpose })),
  };
}

export function formatContextSuggestion(suggestion: ContextSuggestion): string {
  const memory = suggestion.memoryFiles.map((file) => `- ${file}`).join("\n");
  const skills = suggestion.skills
    .map((skill) => `- ${skill.id}: ${skillPath(skill)} - ${skill.purpose}`)
    .join("\n");
  const areas = suggestion.codeAreas.map((entry) => `- ${entry.path} - ${entry.role}`).join("\n");
  const commands = suggestion.commands.map((command) => `- \`${command.command}\` - ${command.purpose}`).join("\n");

  return `Context suggestion for: ${suggestion.task}

Read first:
${memory}

Relevant skills:
${skills || "- No targeted skills matched. Start with core.start-session and core.plan-feature."}

Likely code areas:
${areas || "- No code areas matched yet. Use repo-map.md and targeted search."}

Useful commands:
${commands || "- No commands detected yet."}

Token discipline:
- Do not load all skills or the whole repo.
- Read the files above, then inspect only the likely code areas needed for this task.
`;
}
