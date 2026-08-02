import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sliceId = "product-ingredient-link-foundation";

function read(relativePath: string) {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

describe("product ingredient link contract lock", () => {
  const readmePath = `docs/workpacks/${sliceId}/README.md`;
  const acceptancePath = `docs/workpacks/${sliceId}/acceptance.md`;
  const automationPath = `docs/workpacks/${sliceId}/automation-spec.json`;
  const workItemPath = `.workflow-v2/work-items/${sliceId}.json`;
  const statusPath = ".workflow-v2/status.json";
  const closeoutEvidencePath =
    `docs/workpacks/${sliceId}/evidence/2026-08-01-stage4-6-closeout.md`;
  const requirementsPath = "docs/요구사항기준선-v1.7.28.md";
  const screensPath = "docs/화면정의서-v1.5.32.md";
  const flowPath = "docs/유저flow맵-v1.3.30.md";
  const dbPath = "docs/db설계-v1.3.30.md";
  const apiPath = "docs/api문서-v1.2.34.md";

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

  it("keeps historical hybrid evidence while using the full-local production gate", () => {
    const bundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
      read(".workflow-v2/status.json"),
    ].join("\n");

    expect(bundle).not.toContain("verify-product-ingredient-link-local-first.mjs");
    expect(bundle).toContain("verify-product-ingredient-link-hybrid.mjs");
    expect(read(readmePath)).toContain(
      "Historical hybrid verifier implementation evidence",
    );
    expect(read(readmePath)).toContain("full-local UUID/session-binding/RLS");
    expect(read(readmePath)).toContain("remote Supabase Auth/DB/Storage");
    expect(read(acceptancePath)).toContain("Full-local relock 2026-08-01");
    expect(read(acceptancePath)).toContain("full-local RLS/cross-owner/delete-recreate");
    expect(read(acceptancePath)).not.toContain(
      "existing application DB must prove `local auth.users=0`",
    );
    expect(read(acceptancePath)).not.toContain(
      "the merged-exact full hybrid verifier must read",
    );
    expect(bundle).not.toContain("BRANCH_NAME=docs/product-ingredient-link-foundation");
    expect(bundle).not.toContain("BRANCH_NAME=docs/product-ingredient-link-stage2-relock");
    expect(bundle).toContain(
      "BRANCH_NAME=docs/product-ingredient-link-contract-evolution",
    );
  });

  it("routes active workflow gates through full-local authority and keeps status in sync", () => {
    const workItem = JSON.parse(read(workItemPath)) as {
      dependencies: string[];
      workflow: { external_smokes: string[] };
      verification: {
        required_checks: string[];
        artifact_assertions: string[];
      };
      status: { approval_state: string };
    };
    const automation = JSON.parse(read(automationPath)) as {
      backend: { invariants: string[]; required_test_targets: string[] };
      external_smokes: string[];
      blocked_conditions: string[];
    };
    const status = JSON.parse(read(statusPath)) as {
      items: Array<{
        id: string;
        approval_state: string;
        required_checks: string[];
      }>;
    };
    const aggregate = status.items.find((item) => item.id === sliceId);

    expect(workItem.dependencies.join("\n")).toContain(
      "full-local UUID/session-binding/RLS",
    );
    expect(workItem.workflow.external_smokes.join("\n")).toContain(
      "full-local Auth auth.uid() RLS",
    );
    expect(workItem.verification.required_checks).toContain(
      "pnpm exec vitest run tests/full-local-production-runtime.test.ts",
    );
    expect(workItem.verification.required_checks).not.toContain(
      "pnpm exec vitest run tests/product-ingredient-link-hybrid-verifier.test.ts",
    );
    expect(workItem.verification.required_checks).not.toContain(
      "node scripts/verify-product-ingredient-link-hybrid.mjs --mode post-merge-read-only",
    );
    expect(workItem.verification.artifact_assertions).toContain(
      "full-local-auth-uuid-session-binding-rls-cross-owner-delete-recreate-evidence",
    );
    expect(automation.backend.invariants).toContain(
      "historical-hybrid-verifier-not-an-active-release-gate",
    );
    expect(automation.backend.required_test_targets.join("\n")).toContain(
      "full-local Auth UUID/session-binding",
    );
    expect(automation.external_smokes.join("\n")).toContain(
      "full-local Auth auth.uid() RLS",
    );
    expect(automation.blocked_conditions).toContain(
      "full-local-product-link-rehearsal-verifier-not-yet-implemented",
    );
    expect(aggregate?.approval_state).toBe(workItem.status.approval_state);
    expect(aggregate?.required_checks).toEqual(
      workItem.verification.required_checks,
    );
  });

  it("records the merged Stage 6 closeout without closing Manual Only gates", () => {
    const workItem = JSON.parse(read(workItemPath)) as {
      status: {
        lifecycle: string;
        verification_status: string;
        evaluation_status: string;
      };
      closeout?: {
        phase: string;
        verification_projection: { external_smokes: string };
        merge_gate_projection: {
          current_head_sha: string;
          all_checks_green: boolean;
        };
      };
    };
    const status = JSON.parse(read(statusPath)) as {
      items: Array<{
        id: string;
        lifecycle: string;
        verification_status: string;
        evaluation_status: string;
      }>;
    };
    const aggregate = status.items.find((item) => item.id === sliceId);
    const acceptance = read(acceptancePath);
    const readme = read(readmePath);
    const roadmap = read("docs/workpacks/README.md");
    const evidence = read(closeoutEvidencePath);

    expect(workItem.status).toMatchObject({
      lifecycle: "merged",
      verification_status: "passed",
      evaluation_status: "passed",
    });
    expect(workItem.closeout).toMatchObject({
      phase: "completed",
      verification_projection: { external_smokes: "pending" },
      merge_gate_projection: {
        current_head_sha: "27fc07c48e61f9f8c252949e598ef5c67fc00068",
        all_checks_green: true,
      },
    });
    expect(aggregate).toMatchObject({
      lifecycle: "merged",
      verification_status: "passed",
      evaluation_status: "passed",
    });
    expect(acceptance).toContain(
      "[x] independent internal 1.5, security/DB and five-axis reviewers",
    );
    expect(acceptance).toContain(
      "[x] Draft→Ready and current exact head started checks",
    );
    expect(readme).toContain("PR #1256");
    expect(readme).toContain("5e9773f5e715e7d63132d7f6b8fadcaafd4b76a0");
    expect(roadmap).not.toMatch(
      /\| `product-ingredient-link-foundation` \| in-progress \|/,
    );
    expect(
      roadmap.match(/\| `product-ingredient-link-foundation` \| merged \|/g),
    ).toHaveLength(2);
    expect(evidence).toContain("P0/P1/P2=0/0/0");
    expect(evidence).toContain("Manual Only");
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
    const pantryReadSection =
      api.match(/## 0-PIL-B\.[\s\S]*?(?=\n## 0-PIL-C\.)/)?.[0] ?? "";

    expect(api).toContain('"ingredient_ids": ["uuid"]');
    expect(api).toContain('"product_items": [');
    expect(api).toContain('"product_added": 1');
    expect(api).toContain('"food_product_id": "uuid"');
    expect(api).toContain('"food_product_nutrition_version_id": "uuid"');
    expect(api).toContain('"name": "연세우유 생크림빵"');
    expect(api).toContain('"brand": "연세우유"');
    expect(api).toContain(
      "두 collection은 각각 optional이지만 적어도 하나는 non-empty",
    );
    expect(api).toContain("기존 `items`");
    expect(api).toContain("기존 `422 VALIDATION_ERROR`");
    expect(api).toContain("product/version mismatch");
    expect(api).toContain(
      "field는 `product_items[n].food_product_nutrition_version_id`",
    );
    expect(api).toContain("reason은 `product_version_mismatch`");
    expect(api).toContain("기존 `404 RESOURCE_NOT_FOUND`");
    expect(api).toContain("존재 여부를 노출하지 않도록");
    expect(pantryReadSection).toContain("`q`는 `name`/`brand`에 적용");
    expect(pantryReadSection).toContain(
      "`category`가 지정되면 product는 category authority가 없으므로 `product_items=[]`",
    );
    expect(pantryReadSection).toContain(
      "approved representative link를 display category/filter 추측에 사용하지 않는다.",
    );
    expect(api).toContain("신규 endpoint");
    expect(api).toContain("신규 public status");
    expect(api).toContain("신규 public error code");
  });

  it("locks authenticated-self reader authority without a user-path service token fallback", () => {
    const officialDocs = [
      read(requirementsPath),
      read(screensPath),
      read(flowPath),
      read(dbPath),
      read(apiPath),
    ];
    const sliceBundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
    ].join("\n");

    for (const officialDoc of officialDocs) {
      expect(officialDoc).toContain("authenticated-self");
      expect(officialDoc).toContain("`auth.uid() = p_user_id`");
      expect(officialDoc).toContain("user-path service-token fallback");
    }

    expect(read(dbPath)).not.toContain(
      "service-role-only execute, PUBLIC/anon/authenticated revoke",
    );
    expect(sliceBundle).toContain("missing auth");
    expect(sliceBundle).toContain("other-owner");
    expect(sliceBundle).toContain("stale generation/session");
    expect(sliceBundle).toContain("user-path service-token fallback");
  });

  it("locks shopping create/detail provenance in automation and contract sections", () => {
    const api = read(apiPath);
    const acceptance = read(acceptancePath);
    const automation = JSON.parse(read(automationPath)) as {
      backend: {
        required_endpoints: string[];
        invariants: string[];
        required_test_targets: string[];
      };
    };

    expect(automation.backend.required_endpoints).toContain(
      "POST /api/v1/shopping/lists",
    );
    expect(automation.backend.required_endpoints).toContain(
      "GET /api/v1/shopping/lists/{list_id}",
    );
    expect(api).toContain("`POST /shopping/lists`");
    expect(api).toContain("`GET /shopping/lists/{list_id}`");
    expect(api).toContain(
      '`source_type: "ingredient" | "food_product" | null`',
    );
    expect(api).toContain("nullable `food_product_id`");
    expect(api).toContain("nullable `food_product_nutrition_version_id`");
    expect(api).toContain("generic item은 기존 `ingredient_id`");
    expect(api).toContain("product item은 `ingredient_id=null`");
    expect(api).toContain("all-null malformed legacy row");
    expect(automation.backend.invariants).toContain(
      "shopping-create-detail-response-source-type-and-nullable-product-version-fields",
    );
    expect(automation.backend.required_test_targets).toContain(
      "shopping create/detail generic product and all-null legacy response branch evidence",
    );
    expect(acceptance).toContain(
      "shopping create/detail response exposes source_type and nullable exact product/version provenance",
    );
  });

  it("keeps custom-recipe and meal-log runtime consumption with owning successors", () => {
    const acceptance = read(acceptancePath);
    const automation = JSON.parse(read(automationPath)) as {
      backend: {
        required_endpoints: string[];
        invariants: string[];
        required_test_targets: string[];
      };
    };
    const requiredEndpoints = automation.backend.required_endpoints.join("\n");

    expect(requiredEndpoints).not.toContain("custom recipe");
    expect(requiredEndpoints).not.toContain("meal-log");
    expect(acceptance).not.toMatch(
      /custom recipe product validation.*stage=2.*scope=backend/,
    );
    expect(acceptance).not.toMatch(
      /meal-log product\/ingredient picker.*stage=2.*scope=backend/,
    );
    expect(acceptance).toContain(
      "shared reader signature/semantics regression contract only",
    );
    expect(automation.backend.invariants).toContain(
      "successor-custom-recipe-and-meal-log-own-runtime-endpoint-and-ui-consumption",
    );
    expect(automation.backend.required_test_targets).toContain(
      "successor regression contract preserves shared reader signature and semantics without runtime endpoint ownership",
    );
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

  it("preserves the historical verifier evidence without closing Manual Only gates", () => {
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
    const historicalEvidenceBundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
    ]
      .join("\n")
      .toLowerCase();

    expect(bundle).toContain(target);
    expect(read(readmePath)).toContain(
      "Historical hybrid verifier implementation evidence",
    );
    expect(historicalEvidenceBundle).toContain("pr #1248");
    expect(historicalEvidenceBundle).toContain(
      "4881c4c53181a5504e16f2fa3971e9f6f4b99f05",
    );
    expect(historicalEvidenceBundle).toContain(
      "merged exact-sha dry-run passed",
    );
    expect(historicalEvidenceBundle).toContain(
      "full local/remote evidence remains pending",
    );
    expect(read(readmePath)).not.toContain("No merged exact-SHA result");
    expect(workItemStatus).toMatchObject({
      lifecycle: "merged",
      verification_status: "passed",
      evaluation_status: "passed",
    });
    expect(statusItem).toMatchObject({
      lifecycle: "merged",
      verification_status: "passed",
      evaluation_status: "passed",
    });
  });
});
