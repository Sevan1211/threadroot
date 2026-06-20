import { automationFiles } from "../automation.js";
import { CONFIG_PATH, REPO_MAP_PATH, SKILLS_INDEX_PATH } from "../paths.js";
import { selectSkillPacks, skillPath } from "../skill-packs.js";
import {
  agentsMd,
  architectureContext,
  commandsContext,
  copilotInstructions,
  currentFocusContext,
  decisionsContext,
  gitignore,
  handoffContext,
  pitfallsContext,
  planFeatureSkill,
  projectContext,
  readme,
  refreshContextSkill,
  repoMapPlaceholder,
  revampContextSkill,
  skillFile,
  skillCatalogContext,
  skillsIndex,
  skillsIndexJson,
  sourcesContext,
  startSessionSkill,
  updateMemorySkill,
  validateChangeSkill,
  vscodeExtensions,
  vscodeSettings,
} from "../templates.js";
import type { GeneratedFile, ProjectProfile, RevampContext, Target, ThreadrootConfig } from "../../types.js";

export type BuildFileOptions = {
  includeReadme: boolean;
  agentsPath: string;
  revampContext?: RevampContext;
};

export function canonicalFiles(
  config: ThreadrootConfig,
  profile: ProjectProfile,
  options: BuildFileOptions,
): GeneratedFile[] {
  const selectedPacks = selectSkillPacks([config.profile, profile.framework, profile.language, config.intent]);
  const files: GeneratedFile[] = [
    { path: CONFIG_PATH, content: `${JSON.stringify(config, null, 2)}\n`, generated: false },
    { path: "threadroot/project.md", content: projectContext(config, profile), generated: false },
    { path: "threadroot/repo-map.md", content: repoMapPlaceholder(), generated: false },
    {
      path: REPO_MAP_PATH,
      content: `${JSON.stringify({ version: 1, generatedAt: null, root: config.projectName, likelyProfile: config.profile, entries: [], commands: [] }, null, 2)}\n`,
      generated: false,
    },
    { path: "threadroot/commands.md", content: commandsContext(profile, options.revampContext), generated: false },
    { path: "threadroot/architecture.md", content: architectureContext(profile, options.revampContext), generated: false },
    { path: "threadroot/current-focus.md", content: currentFocusContext(config), generated: false },
    { path: "threadroot/handoff.md", content: handoffContext(), generated: false },
    { path: "threadroot/decisions.md", content: decisionsContext(), generated: false },
    { path: "threadroot/pitfalls.md", content: pitfallsContext(), generated: false },
    { path: "threadroot/sources.md", content: sourcesContext(options.revampContext), generated: false },
    ...automationFiles(),
    { path: "threadroot/skills/catalog.md", content: skillCatalogContext(selectedPacks), generated: false },
    { path: "threadroot/skills/index.md", content: skillsIndex(selectedPacks), generated: false },
    { path: SKILLS_INDEX_PATH, content: skillsIndexJson(selectedPacks), generated: false },
    { path: "threadroot/skills/start-session.md", content: startSessionSkill(), generated: false },
    { path: "threadroot/skills/refresh-context.md", content: refreshContextSkill(), generated: false },
    { path: "threadroot/skills/plan-feature.md", content: planFeatureSkill(), generated: false },
    { path: "threadroot/skills/validate-change.md", content: validateChangeSkill(), generated: false },
    { path: "threadroot/skills/update-memory.md", content: updateMemorySkill(), generated: false },
    { path: "threadroot/skills/revamp-context.md", content: revampContextSkill(), generated: false },
  ];

  for (const selectedSkill of selectedPacks.flatMap((pack) => pack.skills)) {
    files.push({ path: skillPath(selectedSkill), content: skillFile(selectedSkill), generated: false });
  }

  if (options.includeReadme) {
    files.push({ path: "README.md", content: readme(config, profile), generated: false });
  }

  files.push({ path: ".gitignore", content: gitignore(profile), generated: false });
  return files;
}

export function adapterFiles(
  config: ThreadrootConfig,
  profile: ProjectProfile,
  targets: Target[],
  options: BuildFileOptions,
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  if (targets.includes("codex")) {
    files.push({ path: options.agentsPath, content: agentsMd(config, profile), generated: true });
  }
  if (targets.includes("copilot")) {
    files.push({
      path: ".github/copilot-instructions.md",
      content: copilotInstructions(config, profile),
      generated: true,
    });
  }
  if (targets.includes("vscode")) {
    files.push(
      { path: ".vscode/settings.json", content: vscodeSettings(profile), generated: true },
      { path: ".vscode/extensions.json", content: vscodeExtensions(profile), generated: true },
    );
  }

  return files;
}
