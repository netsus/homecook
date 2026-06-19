import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sourceRoots = ["app", "components"] as const;
const sourceExtensions = new Set([".ts", ".tsx"]);

function collectSourceFiles(relativeRoot: string): string[] {
  const absoluteRoot = join(repoRoot, relativeRoot);
  const entries = readdirSync(absoluteRoot);
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = join(relativeRoot, entry);
    const absolutePath = join(repoRoot, relativePath);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(relativePath));
      continue;
    }

    const extension = relativePath.slice(relativePath.lastIndexOf("."));

    if (sourceExtensions.has(extension)) {
      files.push(relativePath);
    }
  }

  return files;
}

describe("mobile typography policy", () => {
  it("uses one Pretendard-first body font stack for app and web surfaces", () => {
    const globals = readFileSync(join(repoRoot, "app/globals.css"), "utf8");
    const bodyFontDeclaration = globals.match(/--font-body:\s*([\s\S]*?);/u)?.[0] ?? "";

    expect(bodyFontDeclaration).toContain('"Pretendard Variable"');
    expect(bodyFontDeclaration).toContain("Pretendard");
    expect(bodyFontDeclaration).not.toContain("Avenir Next");
    expect(globals).toMatch(/--web-font:\s*var\(--font-body\);/u);
  });

  it("keeps runtime product UI on the shared service font stack", () => {
    const bannedPattern =
      /fontFamily|\[font-family:|--font-jua|var\(--font-jua\)|next\/font\/google|\bJua\b/;
    const offenders = sourceRoots
      .flatMap((root) => collectSourceFiles(root))
      .flatMap((relativePath) => {
        const source = readFileSync(join(repoRoot, relativePath), "utf8");

        return source
          .split("\n")
          .map((line, index) => ({ line, lineNumber: index + 1 }))
          .filter(({ line }) => bannedPattern.test(line))
          .map(({ line, lineNumber }) => `${relativePath}:${lineNumber}: ${line.trim()}`);
      });

    expect(offenders).toEqual([]);
  });
});
