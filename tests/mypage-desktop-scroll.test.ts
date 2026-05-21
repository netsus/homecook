import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function ruleBody(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));

  return match?.[1] ?? "";
}

describe("mypage desktop scroll stability", () => {
  it("keeps tab content scrolling inside a stable desktop viewport", () => {
    expect(ruleBody(".web-mypage-screen")).toContain("display: flex;");
    expect(ruleBody(".web-mypage-screen")).toContain(
      "height: calc(100vh - var(--web-nav-h));",
    );
    expect(ruleBody(".web-mypage-shell .web-page")).toContain("overflow: hidden;");
    expect(ruleBody(".web-mypage-shell .web-container-wide")).toContain(
      "overflow: hidden;",
    );
    expect(ruleBody(".web-mypage-panel")).toContain("overflow-y: scroll;");
    expect(ruleBody(".web-mypage-panel")).toContain(
      "scrollbar-gutter: stable both-edges;",
    );
  });
});
