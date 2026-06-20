/**
 * Managed-block helpers. Threadroot owns a delimited region inside otherwise
 * hand-authored files; the region is regenerated on every compile while the
 * surrounding prose is preserved (spec §6).
 */

export const MANAGED_BEGIN = "<!-- threadroot:begin (generated — edit sources in .threadroot/) -->";
export const MANAGED_END = "<!-- threadroot:end -->";

const BLOCK_RE = new RegExp(
  `\\n*${escapeRegExp(MANAGED_BEGIN)}[\\s\\S]*?${escapeRegExp(MANAGED_END)}\\n*`,
  "g",
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove the managed block, returning only hand-authored content. */
export function extractHandAuthored(content: string): string {
  return content.replace(BLOCK_RE, "\n").trim();
}

/** Return the managed block body (without markers), or undefined if absent. */
export function extractManaged(content: string): string | undefined {
  const re = new RegExp(`${escapeRegExp(MANAGED_BEGIN)}\\n?([\\s\\S]*?)\\n?${escapeRegExp(MANAGED_END)}`);
  const match = re.exec(content);
  return match ? (match[1] ?? "").trim() : undefined;
}

/** Compose hand-authored prose with a freshly generated managed block. */
export function composeWithManaged(handAuthored: string, managed: string): string {
  const head = handAuthored.trim();
  const block = `${MANAGED_BEGIN}\n${managed.trim()}\n${MANAGED_END}`;
  return head ? `${head}\n\n${block}\n` : `${block}\n`;
}
