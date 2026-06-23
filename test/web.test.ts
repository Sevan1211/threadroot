import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { webFetch, webStatus } from "../src/core/web.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "tr-web-"));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(repo, { recursive: true, force: true });
});

describe("web", () => {
  it("reports fetch available and native search unavailable", () => {
    expect(webStatus()).toMatchObject({ fetchAvailable: true, searchAvailable: false });
  });

  it("fetches, extracts, and caches known public URLs", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        "<html><head><title>Docs</title></head><body><h1>Hello Threadroot</h1><script>bad()</script></body></html>",
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await webFetch(repo, "https://example.com/docs", { maxTokens: 20 });
    const second = await webFetch(repo, "https://example.com/docs", { maxTokens: 20 });

    expect(first.cached).toBe(false);
    expect(first.title).toBe("Docs");
    expect(first.content).toContain("Hello Threadroot");
    expect(first.content).not.toContain("bad()");
    expect(second.cached).toBe(true);
    expect(second.hash).toBe(first.hash);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
