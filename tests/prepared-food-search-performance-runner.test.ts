import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const fixturePath =
  "tests/fixtures/prepared-food-search-relevance-labels.json";
const runnerPath =
  "scripts/run-prepared-food-search-relevance-performance.mjs";

describe("prepared food search relevance performance gate", () => {
  it("ships a sanitized 50 to 100 query label fixture", () => {
    expect(existsSync(fixturePath)).toBe(true);
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      schema_version: string;
      cases: Array<{
        id: string;
        q: string;
        types: string[];
        source: string | null;
        expected_labels: string[];
        excluded_labels: string[];
      }>;
    };

    expect(fixture.schema_version).toBe(
      "prepared-food-search-relevance-labels-v1",
    );
    expect(fixture.cases.length).toBeGreaterThanOrEqual(50);
    expect(fixture.cases.length).toBeLessThanOrEqual(100);
    expect(new Set(fixture.cases.map((entry) => entry.id)).size).toBe(
      fixture.cases.length,
    );
    expect(fixture.cases.some((entry) => entry.q === "연세크림빵")).toBe(true);
    expect(fixture.cases.some((entry) => entry.q === "연세 크림빵")).toBe(true);
    expect(fixture.cases.some((entry) => [...entry.q].length <= 2)).toBe(true);
    expect(
      new Set(fixture.cases.map((entry) => entry.source)),
    ).toEqual(new Set([null, "public", "community", "mine"]));
    expect(
      fixture.cases.every((entry) =>
        entry.expected_labels.length > 0
        && entry.excluded_labels.length > 0
        && entry.types.every((type) =>
          ["ingredient", "food_product"].includes(type)
        )
      ),
    ).toBe(true);
    expect(JSON.stringify(fixture)).not.toMatch(
      /owner_user_id|authorization|bearer|api[_-]?key|cookie/i,
    );
  });

  it("runs only against a disposable isolated PostgreSQL denominator", () => {
    expect(existsSync(runnerPath)).toBe(true);
    const runner = readFileSync(runnerPath, "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["perf:prepared-food-search-relevance"]).toBe(
      "node scripts/run-prepared-food-search-relevance-performance.mjs",
    );
    expect(runner).toMatch(/287_041/);
    expect(runner).toMatch(/mkdtempSync/);
    expect(runner).toMatch(/port === 5432/);
    expect(runner).toMatch(/homecook-isolated-prepared-food-search-performance/);
    expect(runner).toMatch(/Recall@20/);
    expect(runner).toMatch(/Precision@20/);
    expect(runner).toMatch(/DB p95/);
    expect(runner).toMatch(/route p95/);
    expect(runner).toMatch(/cold_db_ms/);
    expect(runner).toMatch(/cold_route_ms/);
    expect(runner).toMatch(/hardware/);
    expect(runner).toMatch(/runtime/);
    expect(runner).toMatch(/source-public/);
    expect(runner).toMatch(/source-community/);
    expect(runner).toMatch(/source-mine-owner-private/);
    expect(runner).toMatch(/EXPLAIN \(ANALYZE/);
    expect(runner).not.toMatch(/production|staging/);
  });
});
