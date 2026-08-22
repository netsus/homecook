import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

function extractCurrentEndpointTable(apiDoc: string) {
  const start = apiDoc.indexOf("## 엔드포인트 전체 목록");
  expect(start).toBeGreaterThanOrEqual(0);

  const headingText = apiDoc.slice(start);
  const totalMatch = headingText.match(/\n> \*\*v1\.2\.\d+ 총계\*\*/);
  expect(totalMatch?.index).toBeGreaterThanOrEqual(0);

  return headingText.slice(0, totalMatch?.index);
}

describe("legacy auth API contract cleanup", () => {
  it("removes the legacy auth login/profile route handlers from the public API surface", () => {
    expect(existsSync(join(rootDir, "app/api/v1/auth/login/route.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "app/api/v1/auth/profile/route.ts"))).toBe(false);
  });

  it("documents the profile replacement through the users/me API in the current contract", () => {
    const sourceOfTruth = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");
    const apiDocMatch = sourceOfTruth.match(/`(docs\/api문서-v[\d.]+\.md)`/);
    expect(apiDocMatch?.[1]).toBeTruthy();

    const apiDocPath = apiDocMatch?.[1] ?? "";
    const apiDoc = read(apiDocPath);
    const endpointTable = extractCurrentEndpointTable(apiDoc);

    expect(endpointTable).not.toContain("/auth/login");
    expect(endpointTable).not.toContain("/auth/profile");
    expect(apiDoc).toContain("`PATCH /auth/profile` 대체");
    expect(apiDoc).toContain("`PATCH /users/me`");
  });
});
