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
  it("lets the full desktop page scroll instead of trapping tab content", () => {
    expect(ruleBody(".web-mypage-screen")).toContain("display: flex;");
    expect(ruleBody(".web-mypage-screen")).toContain(
      "min-height: calc(100vh - var(--web-nav-h));",
    );
    expect(ruleBody(".web-mypage-screen")).toContain("width: 100%;");
    expect(ruleBody(".web-mypage-screen")).not.toContain("max-width: 1180px;");
    expect(ruleBody(".web-mypage-shell .web-page")).toContain("overflow: visible;");
    expect(ruleBody(".web-mypage-shell .web-container-wide")).toContain(
      "overflow: visible;",
    );
    expect(ruleBody(".web-mypage-panel")).toContain("overflow: visible;");
    expect(ruleBody(".web-mypage-panel")).not.toContain("overflow-y: scroll;");
    expect(ruleBody(".web-mypage-panel")).not.toContain("scrollbar-gutter:");
  });
});
