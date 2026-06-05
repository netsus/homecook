import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const OFFICIAL_DOCS = [
  "docs/요구사항기준선-v1.7.5.md",
  "docs/화면정의서-v1.5.12.md",
  "docs/유저flow맵-v1.3.12.md",
  "docs/db설계-v1.3.11.md",
  "docs/api문서-v1.2.15.md",
] as const;

describe("official docs cooking flow contract", () => {
  it("does not advertise the removed planner cooking-ready flow", () => {
    const removedScreenId = ["COOK", "READY", "LIST"].join("_");
    const removedRoute = ["/cooking", "ready"].join("/");
    const removedKoreanName = ["요리하기", " 준비", " 리스트"].join("");

    OFFICIAL_DOCS.forEach((path) => {
      const body = readFileSync(join(process.cwd(), path), "utf8");

      expect(body, path).not.toContain(removedScreenId);
      expect(body, path).not.toContain(removedRoute);
      expect(body, path).not.toContain(removedKoreanName);
    });
  });
});
