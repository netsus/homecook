import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sliceId = "product-ingredient-link-foundation";

function read(relativePath: string) {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

describe("product ingredient link hybrid contract lock", () => {
  const readmePath = `docs/workpacks/${sliceId}/README.md`;
  const acceptancePath = `docs/workpacks/${sliceId}/acceptance.md`;
  const automationPath = `docs/workpacks/${sliceId}/automation-spec.json`;
  const workItemPath = `.workflow-v2/work-items/${sliceId}.json`;
  const requirementsPath = "docs/요구사항기준선-v1.7.27.md";
  const screensPath = "docs/화면정의서-v1.5.31.md";
  const flowPath = "docs/유저flow맵-v1.3.29.md";
  const dbPath = "docs/db설계-v1.3.28.md";
  const apiPath = "docs/api문서-v1.2.31.md";

  it("uses only the current official document tuple", () => {
    const bundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
    ].join("\n");

    expect(bundle).toContain(requirementsPath.split("/").at(-1));
    expect(bundle).toContain(screensPath.split("/").at(-1));
    expect(bundle).toContain(flowPath.split("/").at(-1));
    expect(bundle).toContain(dbPath.split("/").at(-1));
    expect(bundle).toContain(apiPath.split("/").at(-1));
    expect(bundle).not.toContain("요구사항기준선-v1.7.26.md");
    expect(bundle).not.toContain("화면정의서-v1.5.30.md");
    expect(bundle).not.toContain("유저flow맵-v1.3.28.md");
    expect(bundle).not.toContain("db설계-v1.3.27.md");
    expect(bundle).not.toContain("api문서-v1.2.30.md");
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
    expect(bundle).not.toContain("BRANCH_NAME=docs/product-ingredient-link-stage2-relock");
    expect(bundle).toContain(
      "BRANCH_NAME=docs/product-ingredient-link-contract-evolution",
    );
  });

  it("records the approved product pantry and shopping contract evolution", () => {
    const sourceOfTruth = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");
    const officialBundle = [
      read(requirementsPath),
      read(screensPath),
      read(flowPath),
      read(dbPath),
      read(apiPath),
    ].join("\n");
    const sliceBundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
      read(".workflow-v2/status.json"),
    ].join("\n");

    expect(sourceOfTruth).toContain(
      "Product Ingredient Link Foundation Contract-Evolution `2026-07-31`",
    );
    expect(sourceOfTruth).toContain(requirementsPath);
    expect(sourceOfTruth).toContain(screensPath);
    expect(sourceOfTruth).toContain(flowPath);
    expect(sourceOfTruth).toContain(dbPath);
    expect(sourceOfTruth).toContain(apiPath);
    expect(officialBundle).toContain("product_items");
    expect(officialBundle).toContain("food_product_id");
    expect(officialBundle).toContain("food_product_nutrition_version_id");
    expect(officialBundle).toContain("ingredient_ids");
    expect(officialBundle).toContain("add_to_pantry_item_ids");
    expect(officialBundle).toContain("DISTINCT");
    expect(officialBundle).toContain("ON DELETE RESTRICT");
    expect(officialBundle).toContain("current version");
    expect(officialBundle).toContain("legacy");
    expect(sliceBundle).toContain("2026-07-31 사용자 승인");
    expect(sliceBundle).not.toContain(
      "public-pantry-product-version-writes-remain-unchecked-until-contract-evolution",
    );
    expect(sliceBundle).not.toContain(
      "shopping-reflection-remains-unchecked-until-product-version-provenance-is-official",
    );
  });

  it("locks the exact additive pantry request and response shape", () => {
    const api = read(apiPath);

    expect(api).toContain('"ingredient_ids": ["uuid"]');
    expect(api).toContain('"product_items": [');
    expect(api).toContain('"food_product_id": "uuid"');
    expect(api).toContain('"food_product_nutrition_version_id": "uuid"');
    expect(api).toContain('"name": "연세우유 생크림빵"');
    expect(api).toContain('"brand": "연세우유"');
    expect(api).toContain("기존 `items`");
    expect(api).toContain("기존 `422 VALIDATION_ERROR`");
    expect(api).toContain("product/version mismatch");
    expect(api).toContain("신규 endpoint");
    expect(api).toContain("신규 public status");
    expect(api).toContain("신규 public error code");
  });

  it("locks the exact tagged DB identity, indexes, and delete order", () => {
    const db = read(dbPath);

    expect(db).toContain(
      "(ingredient_id IS NOT NULL AND food_product_id IS NULL AND food_product_nutrition_version_id IS NULL)",
    );
    expect(db).toContain(
      "(ingredient_id IS NULL AND food_product_id IS NOT NULL AND food_product_nutrition_version_id IS NOT NULL)",
    );
    expect(db).toContain(
      "FOREIGN KEY (food_product_id, food_product_nutrition_version_id)",
    );
    expect(db).toContain(
      "REFERENCES food_product_nutrition_versions(product_id, id) ON DELETE RESTRICT",
    );
    expect(db).toContain(
      "UNIQUE (user_id, ingredient_id) WHERE ingredient_id IS NOT NULL",
    );
    expect(db).toContain(
      "UNIQUE (user_id, food_product_id, food_product_nutrition_version_id)",
    );
    expect(db).toContain(
      "UNIQUE (shopping_list_id, ingredient_id) WHERE ingredient_id IS NOT NULL",
    );
    expect(db).toContain(
      "UNIQUE (shopping_list_id, food_product_id, food_product_nutrition_version_id)",
    );
    expect(db).toContain("owner-private pantry");
    expect(db).toContain("private nutrition versions");
    expect(db).toContain("owner-null public/shared");
  });

  it("locks the shared reader predicate and fail-closed exclusions", () => {
    const officialBundle = [
      read(requirementsPath),
      read(flowPath),
      read(dbPath),
      read(apiPath),
    ].join("\n");

    expect(officialBundle).toContain(
      "select_pantry_effective_ingredients(p_user_id uuid)",
    );
    expect(officialBundle).toContain("active + approved + primary");
    expect(officialBundle).toContain("relation='represents'");
    expect(officialBundle).toContain("contains|substitute");
    expect(officialBundle).toContain("pending");
    expect(officialBundle).toContain("rejected");
    expect(officialBundle).toContain("revoked");
    expect(officialBundle).toContain("superseded");
    expect(officialBundle).toContain("ambiguous");
    expect(officialBundle).toContain("no-link");
    expect(officialBundle).toContain("GET /recipes/pantry-match");
    expect(officialBundle).toContain("HOME pantry-cleanout");
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

  it("projects the merged verifier evidence without closing the full lifecycle", () => {
    const target = "tests/product-ingredient-link-hybrid-verifier.test.ts";
    const workItem = JSON.parse(read(workItemPath)) as Record<string, unknown>;
    const workItemStatus = workItem.status as Record<string, unknown>;
    const statusFile = JSON.parse(
      read(".workflow-v2/status.json"),
    ) as Record<string, unknown>;
    const statusItems = statusFile.items as Array<Record<string, unknown>>;
    const statusItem = statusItems.find((item) => item.id === sliceId);
    const bundle = [
      read(automationPath),
      read(workItemPath),
      read(".workflow-v2/status.json"),
    ].join("\n");
    const evidenceBundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
      read(".workflow-v2/status.json"),
    ].join("\n");

    expect(bundle).toContain(target);
    expect(read(readmePath)).toContain("Hybrid verifier implementation evidence");
    expect(evidenceBundle).toContain("PR #1248");
    expect(evidenceBundle).toContain(
      "4881c4c53181a5504e16f2fa3971e9f6f4b99f05",
    );
    expect(evidenceBundle).toContain("merged exact-SHA dry-run passed");
    expect(evidenceBundle).toContain(
      "full local/remote evidence remains pending",
    );
    expect(read(readmePath)).not.toContain("No merged exact-SHA result");
    expect(workItemStatus).toMatchObject({
      lifecycle: "in_progress",
      verification_status: "pending",
      evaluation_status: "not_started",
    });
    expect(statusItem).toMatchObject({
      lifecycle: "in_progress",
      verification_status: "pending",
      evaluation_status: "not_started",
    });
  });
});
