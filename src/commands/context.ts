import { formatContextSuggestion, suggestContext } from "../core/context-suggest.js";

export async function runContextSuggest(repoRoot: string, task: string): Promise<void> {
  console.log(formatContextSuggestion(await suggestContext(repoRoot, task)));
}
