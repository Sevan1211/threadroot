import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMemoryReport, memoryReportFiles } from "../src/core/memory.js";

async function tempRepo(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "threadroot-memory-"));
}

describe("memory refresh", () => {
  it("flags placeholder memory and writes linked review files", async () => {
    const repo = await tempRepo();
    await fs.mkdir(path.join(repo, "threadroot"), { recursive: true });
    await fs.writeFile(path.join(repo, "threadroot/current-focus.md"), "# Current Focus\n\n- Define the next concrete milestone.\n");
    await fs.writeFile(path.join(repo, "threadroot/handoff.md"), "# Handoff\n\n- Real handoff.\n");
    await fs.writeFile(path.join(repo, "threadroot/decisions.md"), "# Decisions\n\n- No decisions recorded yet.\n");
    await fs.writeFile(path.join(repo, "threadroot/pitfalls.md"), "# Pitfalls\n\n- Real pitfall.\n");
    await fs.writeFile(path.join(repo, "threadroot/sources.md"), "# Sources\n\n- Real source.\n");

    const report = await buildMemoryReport(repo);
    expect(report.findings.some((finding) => finding.level === "warning")).toBe(true);
    expect(report.archiveSuggestion).toMatch(/^threadroot\/archive\/memory-\d{4}-\d{2}-\d{2}\.md$/);

    const files = memoryReportFiles(report);
    expect(files.map((file) => file.path)).toEqual(["threadroot/memory-review.md", ".threadroot/memory-report.json"]);
    expect(files[0]?.content).toContain("[threadroot/current-focus.md]");
  });
});
