export function simpleDiff(before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const max = Math.max(beforeLines.length, afterLines.length);
  const output: string[] = [];

  for (let index = 0; index < max; index += 1) {
    const left = beforeLines[index];
    const right = afterLines[index];

    if (left === right) {
      if (left !== undefined && output.length < 80) {
        output.push(`  ${left}`);
      }
      continue;
    }

    if (left !== undefined) {
      output.push(`- ${left}`);
    }

    if (right !== undefined) {
      output.push(`+ ${right}`);
    }

    if (output.length >= 120) {
      output.push("... diff truncated ...");
      break;
    }
  }

  return output.join("\n");
}

