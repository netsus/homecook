import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

describe("legacy auth API contract cleanup", () => {
  it("removes the legacy auth login/profile route handlers from the public API surface", () => {
    expect(existsSync(join(rootDir, "app/api/v1/auth/login/route.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "app/api/v1/auth/profile/route.ts"))).toBe(false);
  });

  it("documents the profile replacement through the users/me API in the current contract", () => {
    const sourceOfTruth = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");
    expect(sourceOfTruth).toContain("docs/api문서-v1.2.9.md");

    const apiDoc = read("docs/api문서-v1.2.9.md");
    const endpointList = apiDoc.slice(apiDoc.indexOf("## 엔드포인트 전체 목록"));
    const endpointTable = endpointList.split("\n> **v1.2.9 총계**")[0];

    expect(endpointTable).not.toContain("/auth/login");
    expect(endpointTable).not.toContain("/auth/profile");
    expect(apiDoc).toContain("`PATCH /auth/profile` 대체");
    expect(apiDoc).toContain("`PATCH /users/me`");
  });
});
