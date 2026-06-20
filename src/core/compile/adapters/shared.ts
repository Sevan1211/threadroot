import type { LoadedRule } from "../../harness/index.js";

/** Filesystem-safe slug for an object name used in generated filenames. */
export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "rule"
  );
}

/** A rule's body with a leading `# <name>` heading if it lacks one. */
export function ruleBody(rule: LoadedRule): string {
  const body = rule.body.trim();
  if (body.startsWith("#")) {
    return body;
  }
  return `# ${rule.name}\n\n${body}`;
}
