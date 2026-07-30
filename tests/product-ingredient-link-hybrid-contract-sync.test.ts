import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sliceId = "product-ingredient-link-foundation";

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("product ingredient link hybrid contract lock", () => {
  const readmePath = `docs/workpacks/${sliceId}/README.md`;
  const acceptancePath = `docs/workpacks/${sliceId}/acceptance.md`;
  const automationPath = `docs/workpacks/${sliceId}/automation-spec.json`;
  const workItemPath = `.workflow-v2/work-items/${sliceId}.json`;

  it("uses only the current official document tuple", () => {
    const bundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
    ].join("\n");

    expect(bundle).toContain("요구사항기준선-v1.7.26.md");
    expect(bundle).toContain("화면정의서-v1.5.30.md");
    expect(bundle).toContain("유저flow맵-v1.3.28.md");
    expect(bundle).toContain("db설계-v1.3.27.md");
    expect(bundle).toContain("api문서-v1.2.30.md");
    expect(bundle).not.toContain("요구사항기준선-v1.7.25.md");
    expect(bundle).not.toContain("화면정의서-v1.5.29.md");
    expect(bundle).not.toContain("유저flow맵-v1.3.27.md");
    expect(bundle).not.toContain("db설계-v1.3.26.md");
    expect(bundle).not.toContain("api문서-v1.2.29.md");
  });

  it("records the completed F0 and slice 3 predecessors", () => {
    const readme = read(readmePath);

    expect(readme).toContain("account-session-generation-foundation");
    expect(readme).toContain("recipe-visibility-read-hardening");
    expect(readme).toMatch(/account-session-generation-foundation[^|\n]*\|\s*merged/i);
    expect(readme).toMatch(/recipe-visibility-read-hardening[^|\n]*\|\s*merged/i);
    expect(readme).not.toContain("Stage 1 docs pending");
  });

  it("uses hybrid Auth and local Data verification instead of the retired verifier", () => {
    const bundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
      read(".workflow-v2/status.json"),
    ].join("\n");

    expect(bundle).not.toContain("verify-product-ingredient-link-local-first.mjs");
    expect(bundle).toContain("verify-product-ingredient-link-hybrid.mjs");
    expect(bundle).toContain("remote Auth");
    expect(bundle).toContain("local application DB");
    expect(bundle).toContain("local auth.users=0");
    expect(bundle).toContain("exact epoch");
    expect(bundle).not.toContain("BRANCH_NAME=docs/product-ingredient-link-foundation");
    expect(bundle).toContain("BRANCH_NAME=docs/product-ingredient-link-stage2-relock");
  });

  it("keeps unresolved public pantry product writes behind contract evolution", () => {
    const bundle = [read(readmePath), read(acceptancePath), read(automationPath)].join("\n");

    expect(bundle).toContain("Contract Evolution");
    expect(bundle).toContain("ingredient_ids");
    expect(bundle).toContain("product/version");
    expect(bundle).toContain("unchecked");
    expect(bundle).toContain("shopping reflection");
  });

  it("locks the first Stage 2 PR to the safe link-only subset", () => {
    const bundle = [read(readmePath), read(acceptancePath)].join("\n");

    expect(bundle).toContain("first small Stage 2 PR");
    expect(bundle).toContain("fail-closed eligible-link selector");
    expect(bundle).toContain("leaving `pantry_items`, public payloads and existing readers unchanged");
    expect(bundle).toContain("after approved Contract Evolution");
  });

  it("keeps this relock regression in the executable verification contract", () => {
    const target = "tests/product-ingredient-link-hybrid-contract-sync.test.ts";
    const bundle = [
      read(automationPath),
      read(workItemPath),
      read(".workflow-v2/status.json"),
    ].join("\n");

    expect(bundle).toContain(target);
  });
});
