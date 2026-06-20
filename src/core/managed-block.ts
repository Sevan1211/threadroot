export function hasManagedBlock(content: string, begin: string, end: string): boolean {
  return content.includes(begin) && content.includes(end);
}

export function upsertManagedBlock(content: string, block: string, begin: string, end: string): string {
  const start = content.indexOf(begin);
  const finish = content.indexOf(end);
  const normalizedBlock = block.endsWith("\n") ? block : `${block}\n`;

  if (start !== -1 && finish !== -1 && finish > start) {
    const afterEnd = finish + end.length;
    return `${content.slice(0, start)}${normalizedBlock}${content.slice(afterEnd).replace(/^\n+/, "")}`;
  }

  const prefix = content.trim().length > 0 ? `${content.trimEnd()}\n\n` : "";
  return `${prefix}${normalizedBlock}`;
}

export function removeManagedBlock(content: string, begin: string, end: string): string {
  const start = content.indexOf(begin);
  const finish = content.indexOf(end);
  if (start === -1 || finish === -1 || finish < start) {
    return content;
  }

  const afterEnd = finish + end.length;
  return `${content.slice(0, start).trimEnd()}${content.slice(afterEnd).replace(/^\n+/, "\n")}`.trimStart();
}

