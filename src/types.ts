import { z } from "zod";

export const profileIdSchema = z.enum([
  "nextjs",
  "vite-react",
  "fastapi",
  "python-cli",
  "dbt",
  "empty",
]);

export const targetSchema = z.enum(["codex", "copilot", "vscode"]);
export const strictnessSchema = z.enum(["light", "standard", "strict"]);
export const projectIntentSchema = z.enum([
  "portfolio",
  "startup-prototype",
  "saas-app",
  "cli-tool",
  "api-service",
  "data-project",
  "custom",
]);

export type ProfileId = z.infer<typeof profileIdSchema>;
export type Target = z.infer<typeof targetSchema>;
export type Strictness = z.infer<typeof strictnessSchema>;
export type ProjectIntent = z.infer<typeof projectIntentSchema>;

export type ProjectCommand = {
  name: string;
  command: string;
  purpose: string;
};

export type ProjectProfile = {
  id: ProfileId;
  name: string;
  description: string;
  language: string;
  framework: string;
  packageManager: string;
  commands: ProjectCommand[];
  vscodeExtensions: string[];
  vscodeSettings: Record<string, unknown>;
  gitignore: string[];
  notes: string[];
};

export const threadrootConfigSchema = z.object({
  version: z.literal(1),
  profile: profileIdSchema,
  intent: projectIntentSchema.default("custom"),
  projectName: z.string().min(1),
  targets: z.array(targetSchema).min(1),
  strictness: strictnessSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ThreadrootConfig = z.infer<typeof threadrootConfigSchema>;

export const manifestEntrySchema = z.object({
  path: z.string(),
  hash: z.string(),
  generated: z.boolean(),
  updatedAt: z.string(),
});

export const threadrootManifestSchema = z.object({
  version: z.literal(1),
  files: z.record(manifestEntrySchema),
});

export type ThreadrootManifest = z.infer<typeof threadrootManifestSchema>;

export type GeneratedFile = {
  path: string;
  content: string;
  generated: boolean;
};

export type SourceCandidateKind = "markdown" | "agent" | "config" | "workflow" | "directory";

export type SourceCandidate = {
  path: string;
  kind: SourceCandidateKind;
  score: number;
  selected: boolean;
  reason: string;
};

export type ConfigSignal = {
  path: string;
  label: string;
  value: string;
};

export type SourceExtract = {
  path: string;
  kind: SourceCandidateKind;
  headings: string[];
  snippets: string[];
};

export type RevampContext = {
  selectedSources: SourceExtract[];
  detectedCommands: ProjectCommand[];
  configSignals: ConfigSignal[];
  existingAgentFiles: string[];
};

export type RepoMapEntry = {
  path: string;
  kind: "directory" | "file";
  role: string;
  score: number;
};

export type RepoMap = {
  version: 1;
  generatedAt: string;
  root: string;
  likelyProfile: ProfileId | "unknown";
  entries: RepoMapEntry[];
  commands: ProjectCommand[];
};

export type SkillPackId =
  | "core-agentic"
  | "web-ui"
  | "api-service"
  | "cli-tool"
  | "data-dbt"
  | "mobile-app"
  | "testing-quality";

export type SkillPack = {
  id: SkillPackId;
  name: string;
  description: string;
  appliesTo: string[];
  skills: SkillDefinition[];
};

export type SkillDefinition = {
  id: string;
  slug: string;
  category: string;
  title: string;
  purpose: string;
  origin?: "curated" | "project" | "agent-generated";
  sourceFiles?: string[];
  reviewed?: boolean;
  triggers: string[];
  appliesTo: string[];
  readFirst: string[];
  steps: string[];
  validation: string[];
  commonMistakes: string[];
};

export type FutureAgentTarget =
  | "codex"
  | "github-copilot"
  | "claude-code"
  | "cursor"
  | "gemini-cli"
  | "vscode"
  | "custom";

export type PlannedWrite = GeneratedFile & {
  exists: boolean;
  currentHash?: string;
  previousHash?: string;
  desiredHash: string;
  status: "create" | "unchanged" | "stale" | "manual-edit";
};

export type WritePolicy = "overwrite" | "skip";
