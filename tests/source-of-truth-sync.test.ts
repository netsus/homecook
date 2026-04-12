import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  readCurrentSourceOfTruth,
  validateSourceOfTruthSync,
} from "../scripts/lib/validate-source-of-truth-sync.mjs";

function writeFixtureFile(rootDir: string, relativePath: string, contents: string) {
  const filePath = join(rootDir, relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, contents);
}

function createFixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "source-of-truth-sync-"));

  writeFixtureFile(
    rootDir,
    "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
    [
      "# Current Source of Truth",
      "",
      "## Official Files",
      "- `docs/요구사항기준선-v1.6.3.md`",
      "- `docs/화면정의서-v1.2.3.md`",
      "- `docs/유저flow맵-v1.2.3.md`",
      "- `docs/db설계-v1.3.1.md`",
      "- `docs/api문서-v1.2.2.md`",
      "",
    ].join("\n"),
  );

  return rootDir;
}

describe("source of truth sync validator", () => {
  it("reads the current official file versions from CURRENT_SOURCE_OF_TRUTH", () => {
    const rootDir = createFixtureRoot();

    const result = readCurrentSourceOfTruth({ rootDir });

    expect(result.errors).toEqual([]);
    expect(result.officialFiles).toMatchObject({
      requirements: { basename: "요구사항기준선-v1.6.3.md" },
      screens: { basename: "화면정의서-v1.2.3.md" },
      flow: { basename: "유저flow맵-v1.2.3.md" },
      db: { basename: "db설계-v1.3.1.md" },
      api: { basename: "api문서-v1.2.2.md" },
    });
  });

  it("fails when governing files reference stale official doc versions", () => {
    const rootDir = createFixtureRoot();

    writeFixtureFile(
      rootDir,
      "docs/engineering/slice-workflow.md",
      [
        "## Read Order",
        "- `docs/요구사항기준선-v1.6.md`",
        "- `docs/화면정의서-v1.2.md`",
        "- `docs/api문서-v1.2.1.md`",
        "- `docs/db설계-v1.3.md`",
      ].join("\n"),
    );

    writeFixtureFile(
      rootDir,
      "docs/workpacks/01-example/README.md",
      "- `docs/요구사항기준선-v1.6.md`",
    );

    const [result] = validateSourceOfTruthSync({ rootDir });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "docs/engineering/slice-workflow.md:2",
          message: expect.stringContaining("요구사항기준선-v1.6.md"),
        }),
        expect.objectContaining({
          path: "docs/engineering/slice-workflow.md:3",
          message: expect.stringContaining("화면정의서-v1.2.md"),
        }),
        expect.objectContaining({
          path: "docs/engineering/slice-workflow.md:4",
          message: expect.stringContaining("api문서-v1.2.1.md"),
        }),
        expect.objectContaining({
          path: "docs/engineering/slice-workflow.md:5",
          message: expect.stringContaining("db설계-v1.3.md"),
        }),
      ]),
    );
    expect(result.errors.some((error) => error.path.includes("docs/workpacks/01-example/README.md"))).toBe(false);
  });

  it("passes when governing files use the current official doc versions", () => {
    const rootDir = createFixtureRoot();

    writeFixtureFile(
      rootDir,
      ".claude/agents/product-design-authority.md",
      [
        "- `docs/요구사항기준선-v1.6.3.md`",
        "- `docs/화면정의서-v1.2.3.md`",
        "- `docs/유저flow맵-v1.2.3.md`",
      ].join("\n"),
    );

    writeFixtureFile(
      rootDir,
      "scripts/example.mjs",
      [
        'const files = ["docs/api문서-v1.2.2.md", "docs/db설계-v1.3.1.md"];',
      ].join("\n"),
    );

    const [result] = validateSourceOfTruthSync({ rootDir });

    expect(result.errors).toEqual([]);
  });
});
