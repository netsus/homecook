import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function collectTsxFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("web primary navigation source", () => {
  it("does not allow local WEB_NAV_ITEMS copies in product screens", () => {
    const files = [
      ...collectTsxFiles(join(process.cwd(), "app")),
      ...collectTsxFiles(join(process.cwd(), "components")),
    ];
    const offenders = files
      .filter((path) => readFileSync(path, "utf8").includes("const WEB_NAV_ITEMS"))
      .map((path) => path.replace(`${process.cwd()}/`, ""));

    expect(offenders).toEqual([]);
  });

  it("makes WebTopNav own its item source instead of accepting overrides", () => {
    const navSource = readFileSync(
      join(process.cwd(), "components/web/web-top-nav.tsx"),
      "utf8",
    );
    const productSources = [
      ...collectTsxFiles(join(process.cwd(), "app")),
      ...collectTsxFiles(join(process.cwd(), "components")),
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(navSource).not.toMatch(/\bitems\??:/);
    expect(productSources).not.toMatch(/<WebTopNav[\s\S]{0,300}\bitems=/);
  });
});
