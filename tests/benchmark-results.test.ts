import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type BenchmarkResult = {
  contentSha256: string;
  fixtureCount: number;
  sponsorCallsMade: boolean;
  cases: Array<{
    fixturePath: string;
    fixtureSha256: string;
    verdict: "selected" | "abstained";
  }>;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("local benchmark evidence", () => {
  it("is internally hashed and references untampered fixtures", async () => {
    const path = resolve("docs/evaluations/local-contract-results.json");
    const results = JSON.parse(await readFile(path, "utf8")) as BenchmarkResult;
    const { contentSha256, ...core } = results;

    expect(results.fixtureCount).toBe(10);
    expect(results.cases).toHaveLength(10);
    expect(results.sponsorCallsMade).toBe(false);
    expect(sha256(JSON.stringify(core))).toBe(contentSha256);

    for (const fixture of results.cases) {
      const bytes = await readFile(resolve(fixture.fixturePath), "utf8");
      expect(sha256(bytes)).toBe(fixture.fixtureSha256);
    }
  });
});
