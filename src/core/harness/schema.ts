import { z } from "zod";

import { profileIdSchema } from "../../types.js";

/**
 * Canonical harness schemas (Threadroot v1, spec §5).
 *
 * These validate the *parsed* object (plain JS), independent of the on-disk
 * encoding. YAML / frontmatter parsing is layered on top in the harness loader.
 */

/** Object scope. Path-level targeting is expressed on rules via `applyTo`. */
export const objectScopeSchema = z.enum(["user", "project"]);
export type ObjectScope = z.infer<typeof objectScopeSchema>;

/** Risk classification shared by executable capabilities. */
export const riskLevelSchema = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

/** Compile targets enabled for a repo (spec §6). */
export const adapterIdSchema = z.enum(["agents", "claude", "copilot", "cursor"]);
export type AdapterId = z.infer<typeof adapterIdSchema>;

/** Structured memory types (spec §10). */
export const memoryTypeSchema = z.enum(["project", "repo-map", "current-focus", "handoff", "pitfalls"]);
export type MemoryType = z.infer<typeof memoryTypeSchema>;

/**
 * A reference to existing repo context (docs/, ADRs, ARCHITECTURE.md, …).
 * References are *linked, not copied* — the source of truth stays in place.
 * `load: link` surfaces a pointer (load-on-demand, anti context-rot);
 * `load: eager` inlines/imports small critical files into always-on context.
 */
export const referenceSchema = z.object({
  path: z.string().min(1),
  description: z.string().optional(),
  load: z.enum(["link", "eager"]).default("link"),
});
export type Reference = z.infer<typeof referenceSchema>;

/** harness.yaml manifest (spec §5.1). */
export const harnessManifestSchema = z.object({
  name: z.string().min(1),
  version: z.literal(1),
  profile: profileIdSchema,
  adapters: z.array(adapterIdSchema).min(1),
  references: z.array(referenceSchema).default([]),
  memory: z
    .object({
      budget: z.record(memoryTypeSchema, z.number().int().positive()).default({}),
    })
    .default({ budget: {} }),
  tools: z
    .object({
      allow: z.array(z.string()).default([]),
    })
    .default({ allow: [] }),
});
export type HarnessManifest = z.infer<typeof harnessManifestSchema>;

/** Skill frontmatter (spec §5.2). Markdown body is stored separately. */
export const skillFrontmatterSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1).optional(),
    when: z.string().min(1).optional(),
    license: z.string().min(1).optional(),
    compatibility: z.string().max(500).optional(),
    metadata: z.record(z.unknown()).optional(),
    allowedTools: z.union([z.string(), z.array(z.string())]).optional(),
    "allowed-tools": z.union([z.string(), z.array(z.string())]).optional(),
    scope: objectScopeSchema.default("project"),
    tags: z.array(z.string()).default([]),
  })
  .refine((skill) => Boolean(skill.description ?? skill.when), {
    message: "A skill must define `description` or legacy `when`.",
    path: ["description"],
  })
  .transform((skill) => {
    const trigger = skill.description ?? skill.when!;
    const allowedTools = skill.allowedTools ?? skill["allowed-tools"];
    return {
      ...skill,
      description: skill.description ?? trigger,
      when: skill.when ?? trigger,
      allowedTools,
      "allowed-tools": undefined,
    };
  });
export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

/** Rule frontmatter (spec §5.3). `applyTo` is a glob for path-scoped output. */
export const ruleFrontmatterSchema = z.object({
  name: z.string().min(1),
  applyTo: z.string().min(1).optional(),
  scope: objectScopeSchema.default("project"),
});
export type RuleFrontmatter = z.infer<typeof ruleFrontmatterSchema>;

/** Tool input parameter (spec §5.4). */
export const toolInputParamSchema = z.object({
  type: z.enum(["string", "number", "boolean"]).default("string"),
  description: z.string().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
export type ToolInputParam = z.infer<typeof toolInputParamSchema>;

/** Optional healthcheck for tools and connections. */
export const healthcheckSchema = z.object({
  run: z.string().min(1),
  expectExitCode: z.number().int().default(0),
});
export type Healthcheck = z.infer<typeof healthcheckSchema>;

/** Tool manifest (spec §5.4). Exactly one of `run` | `script` is required. */
export const toolManifestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    scope: objectScopeSchema.default("project"),
    risk: riskLevelSchema.default("low"),
    confirm: z.boolean().default(false),
    connection: z.string().min(1).optional(),
    healthcheck: healthcheckSchema.optional(),
    input: z.record(z.string(), toolInputParamSchema).default({}),
    run: z.string().min(1).optional(),
    script: z.string().min(1).optional(),
  })
  .refine((tool) => Boolean(tool.run) !== Boolean(tool.script), {
    message: "A tool must define exactly one of `run` or `script`.",
    path: ["run"],
  });
export type ToolManifest = z.infer<typeof toolManifestSchema>;

/** Connection manifest. Connections wrap locally-authenticated CLIs only. */
export const connectionManifestSchema = z.object({
  name: z.string().min(1),
  provider: z.string().min(1),
  kind: z.literal("cli").default("cli"),
  command: z.string().min(1),
  profile: z.string().min(1).optional(),
  description: z.string().min(1),
  scope: objectScopeSchema.default("project"),
  risk: riskLevelSchema.default("medium"),
  confirm: z.boolean().default(false),
  healthcheck: healthcheckSchema.optional(),
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
});
export type ConnectionManifest = z.infer<typeof connectionManifestSchema>;

/** A parsed prose object (skill or rule): frontmatter + markdown body. */
export type SkillDocument = {
  frontmatter: SkillFrontmatter;
  body: string;
};

export type RuleDocument = {
  frontmatter: RuleFrontmatter;
  body: string;
};
