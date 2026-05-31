import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

const codeRoots = ["app", "components"];
const codeExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const excludedFiles = new Set(["app/globals.css"]);

function listCodeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return listCodeFiles(path);
    }

    if (!codeExtensions.has(extname(path)) || excludedFiles.has(path)) {
      return [];
    }

    return [path];
  });
}

function collectMatches(pattern: RegExp) {
  return codeRoots.flatMap((root) =>
    listCodeFiles(root).flatMap((file) => {
      const lines = readFileSync(file, "utf8").split("\n");

      return lines.flatMap((line, index) =>
        Array.from(line.matchAll(pattern)).map((match) => ({
          file,
          line: index + 1,
          match: match[0],
        })),
      );
    }),
  );
}

describe("theme token usage", () => {
  it("keeps app and component color usage behind global CSS tokens", () => {
    const directHex = collectMatches(/(?<!&)#[0-9A-Fa-f]{3,8}/g);
    const directRgb = collectMatches(/\brgba?\([^)]*\)/g);
    const directTailwindPalette = collectMatches(
      /(?<!-)\b(?:hover:|active:|focus:|disabled:|placeholder:)?(?:bg|text|border|ring|outline|divide|shadow|accent|caret|decoration|fill|stroke|from|to|via)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:[-/][A-Za-z0-9]+)?\b/g,
    );
    const directNamedColorAttrs = collectMatches(
      /\b(?:fill|stroke)=["'](?:white|black)["']|\b(?:color|background|backgroundColor|borderColor):\s*["'](?:white|black)["']/g,
    );
    const violations = [
      ...directHex,
      ...directRgb,
      ...directTailwindPalette,
      ...directNamedColorAttrs,
    ];

    expect(
      violations.map(({ file, line, match }) => `${file}:${line} ${match}`),
    ).toEqual([]);
  });
});
