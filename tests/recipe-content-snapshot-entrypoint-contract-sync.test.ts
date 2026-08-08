import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sliceId = "recipe-content-snapshot-future-propagation";

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath)) as Record<string, unknown>;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

describe("recipe snapshot entrypoint Stage 1 contract lock", () => {
  const readmePath = `docs/workpacks/${sliceId}/README.md`;
  const acceptancePath = `docs/workpacks/${sliceId}/acceptance.md`;
  const automationPath = `docs/workpacks/${sliceId}/automation-spec.json`;
  const workItemPath = `.workflow-v2/work-items/${sliceId}.json`;
  const authorityPath = `ui/designs/authority/${sliceId}-authority.md`;

  function statusItem() {
    const status = readJson(".workflow-v2/status.json");
    const items = status.items as Array<Record<string, unknown>>;
    const item = items.find((candidate) => candidate.id === sliceId);
    expect(item).toBeDefined();
    return item ?? {};
  }

  function automationContract() {
    const automation = readJson(automationPath);
    const backend = automation.backend as Record<string, unknown>;

    return {
      invariants: strings(backend.invariants),
      blockedConditions: strings(automation.blocked_conditions),
      notes: String(automation.notes),
    };
  }

  function workItemContract() {
    const workItem = readJson(workItemPath);
    const docsRefs = workItem.docs_refs as Record<string, unknown>;
    const verification = workItem.verification as Record<string, unknown>;

    return {
      workItem,
      sourceOfTruth: strings(docsRefs.source_of_truth),
      artifactAssertions: strings(verification.artifact_assertions),
      notes: String(workItem.notes),
    };
  }

  it("uses the post-Contract-Evolution official tuple on each owning surface", () => {
    const readme = read(readmePath);
    const automation = automationContract();
    const workItem = workItemContract();

    expect(workItem.sourceOfTruth).toEqual([
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      "docs/요구사항기준선-v1.7.29.md",
      "docs/화면정의서-v1.5.33.md",
      "docs/유저flow맵-v1.3.31.md",
      "docs/db설계-v1.3.31.md",
      "docs/api문서-v1.2.35.md",
    ]);
    expect(readme).toContain("requirements `v1.7.29`");
    expect(readme).toContain("screens `v1.5.33`");
    expect(readme).toContain("flow `v1.3.31`");
    expect(readme).toContain("DB `v1.3.31`");
    expect(readme).toContain("API `v1.2.35`");
    expect(automation.notes).toContain("requirements v1.7.29");
    expect(automation.notes).toContain("API v1.2.35");
  });

  it("proves the exact meaning exists in the approved official API and DB", () => {
    const officialApi = read("docs/api문서-v1.2.35.md");
    const officialDb = read("docs/db설계-v1.3.31.md");

    expect(officialApi).toContain("base_recipe_revision === data.revision");
    expect(officialApi).toContain("두 값을 다른 시점의 query로 조합하지 않는다");
    expect(officialApi).toContain(
      "`ingredients_used[]` exact key는 `ingredient_id`, `amount`, `unit`, `cut_size`",
    );
    expect(officialApi).toContain(
      "URL을 managed identity로 승격하지 않는다",
    );
    expect(officialDb).toContain(
      "사용 재료 [{ingredient_id, amount, unit, cut_size}]",
    );
  });

  it("locks the complete owner edit context semantics in the README itself", () => {
    const readme = read(readmePath);

    expect(readme).toContain(
      "`edit_context.base_recipe_revision === GET /recipes/{id}.data.revision`",
    );
    expect(readme).toContain("one detail read snapshot");
    expect(readme).toContain("separate query results are never combined");
    expect(readme).toContain(
      "`ingredients_used[]` item is exactly `{ingredient_id,amount,unit,cut_size}`",
    );
    expect(readme).toContain("verified managed object identity");
    expect(readme).toContain("URL-derived image identity");
    expect(readme).toContain("explicit `null`");
    expect(readme).toContain("always arrays");
    expect(readme).toContain("omit the whole field");
    expect(readme).toContain("existing 404 non-disclosure boundary");
  });

  it("locks the complete owner edit context semantics in acceptance itself", () => {
    const acceptance = read(acceptancePath);

    expect(acceptance).toContain(
      "`edit_context.base_recipe_revision === GET /recipes/{id}.data.revision`",
    );
    expect(acceptance).toContain("one detail read snapshot");
    expect(acceptance).toContain("separate query results are never combined");
    expect(acceptance).toContain(
      "`ingredients_used[]` item is exactly `{ingredient_id,amount,unit,cut_size}`",
    );
    expect(acceptance).toContain("verified managed object identity");
    expect(acceptance).toContain("never inferred from a URL");
    expect(acceptance).toContain("explicit `null`");
    expect(acceptance).toContain("arrays in authority order");
    expect(acceptance).toContain("omits the whole `edit_context` field");
    expect(acceptance).toContain("existing 404 non-disclosure");
  });

  it("locks the complete owner edit context semantics as automation invariants", () => {
    const automation = automationContract();

    expect(automation.invariants).toEqual(
      expect.arrayContaining([
        "edit-context-base-recipe-revision-equals-same-response-data-revision",
        "recipe-revision-and-edit-context-read-from-one-detail-snapshot-never-combined-across-queries",
        "edit-context-draft-exact-title-description-base-servings-ingredients-steps",
        "ingredients-used-item-exact-ingredient-id-amount-unit-cut-size",
        "nullable-scalars-explicit-null-and-list-fields-always-arrays",
        "unauthorized-public-non-owner-edit-context-field-omitted-not-null-or-empty",
        "image-object-id-verified-managed-object-identity-or-null-never-url-derived",
        "meal-items-revision-recipe-meal-only-product-entries-unchanged",
      ]),
    );
    expect(automation.blockedConditions).toEqual(
      expect.arrayContaining([
        "recipe-detail-revision-and-edit-context-combined-from-different-read-snapshots",
        "ingredients-used-item-missing-cut-size-or-containing-unofficial-key",
        "image-object-id-inferred-from-thumbnail-signed-external-or-legacy-url",
      ]),
    );
  });

  it("locks the complete owner edit context semantics as work-item artifacts", () => {
    const workItem = workItemContract();

    expect(workItem.artifactAssertions).toEqual(
      expect.arrayContaining([
        "edit-context-base-recipe-revision-equals-same-response-data-revision",
        "recipe-revision-and-edit-context-one-detail-read-snapshot-no-cross-query-composition",
        "edit-context-full-draft-exact-nested-ingredients-used-cut-size-null-array-omit",
        "image-object-id-verified-managed-identity-or-null-never-url-derived",
        "meal-items-revision-recipe-meal-only-product-entries-unchanged",
        "endpoint-request-wrapper-status-public-error-contract-unchanged",
      ]),
    );
  });

  it("locks joint capability fail-closed and activation boundaries per surface", () => {
    const readme = read(readmePath);
    const acceptance = read(acceptancePath);
    const automation = automationContract();
    const workItem = workItemContract();

    for (const surface of [readme, acceptance]) {
      expect(surface).toContain("personal_recipe_v2");
      expect(surface).toContain("snapshot_v2_creation");
      expect(surface).toContain("legacy_v1");
      expect(surface).toContain("fail-closed");
      expect(surface).toContain("raw capability");
      expect(surface).toContain("R/R+1");
      expect(surface).toContain("R+2");
    }

    expect(automation.invariants).toEqual(
      expect.arrayContaining([
        "server-only-joint-personal-recipe-v2-and-snapshot-v2-creation-projection",
        "both-capabilities-exact-active-select-snapshot-v2-otherwise-legacy-v1-fail-closed",
        "raw-capability-public-json-browser-prop-html-query-env-cache-telemetry-exposure-zero",
        "existing-endpoints-request-wrapper-status-and-public-error-contract-unchanged",
        "r-r1-entrypoint-creation-off-legacy-v1-new-personal-v2-write-zero",
        "seeded-existing-v2-read-cancel-drain-remains-available",
        "no-activation-before-slice8-r-r1-evidence-and-r2-joint-approval",
      ]),
    );
    expect(workItem.artifactAssertions).toEqual(
      expect.arrayContaining([
        "server-only-joint-capability-projection-legacy-fail-closed-raw-exposure-zero",
        "r-r1-creation-off-seeded-read-cancel-drain-no-r2-preactivation",
      ]),
    );
  });

  it("projects the honest current Stage state without claiming closeout", () => {
    const readme = read(readmePath);
    const roadmap = read("docs/workpacks/README.md");
    const authority = read(authorityPath);
    const automation = automationContract();
    const workItemContractProjection = workItemContract();
    const workItemStatus = workItemContractProjection.workItem
      .status as Record<string, unknown>;
    const status = statusItem();
    const statusNotes = String(status.notes);

    expect(status.branch).toBe(
      "feature/fe-recipe-content-snapshot-future-propagation",
    );
    expect(status.pr_path).toBe("https://github.com/netsus/homecook/pull/1281");
    expect(status.lifecycle).toBe("in_progress");
    expect(status.approval_state).toBe("needs_revision");
    expect(status.verification_status).toBe("pending");
    expect(workItemStatus.lifecycle).toBe(status.lifecycle);
    expect(workItemStatus.approval_state).toBe(status.approval_state);
    expect(workItemStatus.verification_status).toBe(status.verification_status);

    for (const notes of [
      automation.notes,
      workItemContractProjection.notes,
      statusNotes,
    ]) {
      expect(notes).toContain("9eb1ebd8ea5a12294a76d7f2799693f03654b0a4");
      expect(notes).toContain("ef5903b131a2eb9e505b2121b4e390970c565b95");
      expect(notes).toContain("1096494ab3e246987efe2792e9379c1f7c2a3ed6");
      expect(notes).toContain("019fca76-eb5f-79a3-8d2a-a2f46a5591d3");
      expect(notes).toContain(
        "design-status-confirmed-final-authority-0-0-0",
      );
      expect(notes).toContain("019fca98-d8a1-7613-a34f-39cc836de385");
      expect(notes).toContain("APPROVE");
      expect(notes).toContain("P0/P1/P2 0/0/0");
      expect(notes).toContain("blocker/major/minor 0/0/0");
      expect(notes).toContain(
        "docs/workpacks/recipe-content-snapshot-future-propagation/evidence/2026-08-04-stage6-frontend-closeout-review.md",
      );
      expect(notes).toContain(
        "aab9a65e6123e3134478842971765ad3aa737d6a",
      );
      expect(notes).toContain(
        "2173737e8ea2eec2297e1cc0227ce4f2c27c50b9",
      );
      expect(notes).toContain("manual-server-mac-activation-pending");
    }
    expect(readme).toContain("`confirmed`");
    expect(readme).toContain(authorityPath);
    expect(authority).toContain("verdict: `FINAL_AUTHORITY_APPROVED`");
    expect(authority).toContain("blocker_count: `0`");
    expect(authority).toContain("major_count: `0`");
    expect(authority).toContain("Stage 6: `pending`");
    expect(roadmap).toMatch(
      /recipe-content-snapshot-future-propagation[\s\S]*PR #1281 exact head `aab9a65e` merge `2173737e`[\s\S]*Design Status는 confirmed/,
    );
  });
});
