import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/ingredient-nutrition-import.mjs`,
).href;

async function loadImporter(): Promise<Record<string, unknown>> {
  try {
    return await import(MODULE_URL);
  } catch {
    return {};
  }
}

function requireFunction(
  module: Record<string, unknown>,
  name: string,
): (...args: never[]) => unknown {
  expect(module[name], `missing import behavior: ${name}`).toBeTypeOf("function");
  return module[name] as (...args: never[]) => unknown;
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(
    typeof value === "string" ? value : canonicalStringify(value),
  ).digest("hex");
}

function buildBundle() {
  const approvedItems = [{
    external_item_key: "source-item-1",
    external_name: "두부",
    preparation_state: "raw",
    edible_portion: "edible",
    basis: { amount: 100, unit: "g", source_text: "100 g" },
    values: {
      protein_g: {
        source_nutrient_code: "PROCNT",
        amount: 8,
        unit: "g",
        missing_reason: null,
        source_token: "8",
      },
    },
    fingerprint: "fingerprint-1",
    content_hash: sha256("source-item-1"),
  }];
  const counts = {
    fetched_raw_count: 1,
    unique_input_count: 1,
    normalized_count: 1,
    quarantined_count: 0,
    deduplicated_identical_count: 0,
  };
  const normalizedContentHash = sha256({ rows: approvedItems, quarantined: [], counts });
  const base = {
    schema_version: "public-nutrition-handoff-v1",
    handoff_schema_checksum: sha256({
      schema_version: "public-nutrition-handoff-v1",
      measurement_evidence_schema_version: "public-nutrition-measurement-evidence-v1",
      lifecycle: ["raw", "staged", "normalized", "reviewed", "approved_pinned"],
    }),
    status: "approved_pinned",
    lifecycle: ["raw", "staged", "normalized", "reviewed", "approved_pinned"],
    logical_batch_id: "logical-batch-1",
    approved_manifest: {
      logical_batch_id: "logical-batch-1",
      provider: "MFDS",
      dataset: "Synthetic Nutrition Dataset",
      source_version: "test-v1",
      data_basis_date: "2026-07-01",
      license: "test-only",
      license_url: "https://example.test/license",
      license_evidence_url: "https://example.test/license-evidence",
      license_verified_at: "2026-07-01",
      query: {},
      raw_sha256: sha256("synthetic-raw"),
      input_shape: "adapted-row-v1",
      adapter_schema_version: "nutrition-adapter-v1",
      normalized_content_hash: normalizedContentHash,
      review_checksum: sha256("synthetic-review"),
      counts,
    },
    approved_items: approvedItems,
    public_attribution: [{
      provider: "MFDS",
      dataset: "Synthetic Nutrition Dataset",
      source_version: "test-v1",
      data_basis_date: "2026-07-01",
      license: "test-only",
      source_url: "https://example.test/source",
    }],
    measurement_evidence: [],
    normalized_content_hash: normalizedContentHash,
    review_checksum: sha256("synthetic-review"),
    production_db_writes: 0,
  };
  return { ...base, handoff_checksum: sha256(base) };
}

const pilotScope = {
  recipe_ids: Array.from({ length: 30 }, (_, index) => `recipe-${String(index + 1).padStart(2, "0")}`),
  ingredient_ids: ["ingredient-tofu"],
};

const canonicalIngredients = [{
  id: "ingredient-tofu",
  normalized_names: ["두부"],
  preparation_state: "raw",
  edible_portion: "edible",
  basis_dimension: "mass",
}];

const approvedNutritionCandidate = {
  fingerprint: "fingerprint-1",
  ingredient_id: "ingredient-tofu",
  preparation_state: "raw",
  review_status: "pending",
  is_active: false,
  candidate_rank: 1,
};
const approvedNutritionCandidateIdentity = sha256({
  kind: "nutrition",
  ...approvedNutritionCandidate,
});

const approval = {
  schema_version: "ingredient-nutrition-review-v1",
  reviewed_by: "operator-1",
  reviewed_at: "2026-07-14T00:00:00.000Z",
  decision_reason: "synthetic test decision",
  pilot_scope: pilotScope,
  nutrition_decisions: [{
    fingerprint: "fingerprint-1",
    ingredient_id: "ingredient-tofu",
    preparation_state: "raw",
    status: "approved",
    reason: "semantic match reviewed",
    candidate_identity: approvedNutritionCandidateIdentity,
    candidate_checksum: sha256({
      candidate_identity: approvedNutritionCandidateIdentity,
      source_checksum: buildBundle().handoff_checksum,
      candidate: { kind: "nutrition", ...approvedNutritionCandidate },
    }),
  }],
  conversion_decisions: [],
  piece_decisions: [],
};

describe("ingredient nutrition model import", () => {
  it("validates approved/pinned handoff status, manifest, lifecycle, and checksum", async () => {
    const importer = await loadImporter();
    const validateHandoffBundle = requireFunction(importer, "validateHandoffBundle");
    const bundle = buildBundle();

    expect(validateHandoffBundle(bundle as never)).toMatchObject({
      status: "approved_pinned",
      handoff_checksum: bundle.handoff_checksum,
      approved_items: expect.any(Array),
    });

    expect(() => validateHandoffBundle({ ...bundle, status: "reviewed" } as never)).toThrowError(
      expect.objectContaining({ code: "INVALID_HANDOFF_BUNDLE" }),
    );
    expect(() => validateHandoffBundle({ ...bundle, handoff_checksum: "tampered" } as never)).toThrowError(
      expect.objectContaining({ code: "INVALID_HANDOFF_BUNDLE" }),
    );
  });

  it("keeps every dry-run and rejected input path at zero attempted and committed writes", async () => {
    const importer = await loadImporter();
    const createMemoryModelStore = requireFunction(importer, "createMemoryModelStore");
    const runModelImport = requireFunction(importer, "runModelImport");
    const store = createMemoryModelStore() as { snapshot: () => { writes: number } };

    const summary = await runModelImport({
      bundle: buildBundle(),
      mode: "dry-run",
      environment: "local",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: pilotScope,
      expected_pilot_scope: pilotScope,
      canonical_ingredients: canonicalIngredients,
      approval: null,
      store,
    } as never) as Record<string, unknown>;
    expect(summary).toMatchObject({
      run_id: expect.any(String),
      mode: "dry-run",
      environment: "local",
      pilot_scope: "foodsafety-30",
      input_checksum: buildBundle().handoff_checksum,
      source_versions: ["test-v1"],
      freshness_statuses: ["current"],
      scope_recipe_count: 30,
      scope_ingredient_count: 1,
      source_item_count: 1,
      profile_count: 1,
      nutrient_value_count: 1,
      missing_value_count: 0,
      zero_value_count: 0,
      nutrition_candidate_count: 1,
      conversion_candidate_count: 0,
      piece_candidate_count: 0,
      approved_count: 0,
      rejected_count: 0,
      needs_review_count: 1,
      revoked_count: 0,
      superseded_count: 0,
      writes_attempted: 0,
      writes_committed: 0,
      secret_leak_count: 0,
      reason_counts: {},
      report_artifact: expect.stringMatching(/^\.artifacts\/ops\//),
      rollback_artifact: null,
    });
    expect(store.snapshot().writes).toBe(0);

    await expect(runModelImport({
      bundle: { ...buildBundle(), handoff_checksum: "invalid" },
      mode: "dry-run",
      environment: "local",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: pilotScope,
      expected_pilot_scope: pilotScope,
      canonical_ingredients: canonicalIngredients,
      approval: null,
      store,
    } as never)).rejects.toMatchObject({
      code: "INVALID_HANDOFF_BUNDLE",
      summary: { writes_attempted: 0, writes_committed: 0 },
    });
    expect(store.snapshot().writes).toBe(0);
  });

  it("creates deterministic idempotency/content hashes and commits duplicate apply replays with zero writes", async () => {
    const importer = await loadImporter();
    const createMemoryModelStore = requireFunction(importer, "createMemoryModelStore");
    const runModelImport = requireFunction(importer, "runModelImport");
    const store = createMemoryModelStore() as unknown;
    const input = {
      bundle: buildBundle(),
      mode: "apply",
      environment: "local",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: pilotScope,
      expected_pilot_scope: pilotScope,
      canonical_ingredients: canonicalIngredients,
      approval,
      store,
    };

    const first = await runModelImport(input as never) as Record<string, unknown>;
    const replay = await runModelImport(input as never) as Record<string, unknown>;
    expect(replay).toMatchObject({
      idempotency_key: first.idempotency_key,
      content_hash: first.content_hash,
      writes_committed: 0,
      replayed: true,
    });
  });

  it("reports a database-detected source drift without activating candidates", async () => {
    const importer = await loadImporter();
    const runModelImport = requireFunction(importer, "runModelImport");
    const store = {
      findRun: () => null,
      applyModelBundle: async () => ({
        source_id: "source-drift-1",
        affected_row_ids: { nutrition_source_ids: ["source-drift-1"] },
        status: "needs_source_check",
        freshness_status: "drifted",
        reason_codes: ["SOURCE_NOT_CURRENT"],
        writes_committed: 1,
        replayed: false,
      }),
    };

    await expect(runModelImport({
      bundle: buildBundle(),
      mode: "apply",
      environment: "local",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: pilotScope,
      expected_pilot_scope: pilotScope,
      canonical_ingredients: canonicalIngredients,
      approval,
      store,
    } as never)).resolves.toMatchObject({
      status: "needs_source_check",
      freshness_statuses: ["drifted"],
      reason_codes: ["SOURCE_NOT_CURRENT"],
      writes_attempted: 1,
      writes_committed: 1,
      approved_count: 0,
      affected_row_ids: { nutrition_source_ids: ["source-drift-1"] },
    });
  });

  it("rejects a piece approval that cites volume-only measurement evidence", async () => {
    const importer = await loadImporter();
    const createMemoryModelStore = requireFunction(importer, "createMemoryModelStore");
    const runModelImport = requireFunction(importer, "runModelImport");
    const evidenceBase = {
      evidence_schema_version: "public-nutrition-measurement-evidence-v1",
      evidence_kind: "volume_weight",
      ingredient_or_category_id: "ingredient-tofu",
      source_observed_unit: "tbsp",
      observed_g_per_15ml: 20,
      source_url: "https://example.test/measurement",
      accessed_at: "2026-07-01",
      license_evidence_url: "https://example.test/measurement-license",
      review_result: "approved",
      license_disposition: "approved_for_internal_evidence",
    };
    const evidence = { ...evidenceBase, evidence_checksum: sha256(evidenceBase) };
    const baseBundle = buildBundle();
    const bundleWithoutChecksum = {
      ...baseBundle,
      measurement_evidence: [evidence],
      handoff_checksum: undefined,
    };
    delete bundleWithoutChecksum.handoff_checksum;
    const bundle = {
      ...bundleWithoutChecksum,
      handoff_checksum: sha256(bundleWithoutChecksum),
    };
    const unsafeApproval = {
      ...approval,
      piece_decisions: [{
        evidence_key: "ingredient-tofu",
        ingredient_id: "ingredient-tofu",
        size_code: "medium",
        preparation_state: "raw",
        weight_g: 100,
        status: "approved",
        reason: "wrong evidence kind",
      }],
    };

    await expect(runModelImport({
      bundle,
      mode: "apply",
      environment: "local",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: pilotScope,
      expected_pilot_scope: pilotScope,
      canonical_ingredients: canonicalIngredients,
      approval: unsafeApproval,
      store: createMemoryModelStore(),
    } as never)).rejects.toMatchObject({
      code: "INVALID_APPROVAL_FILE",
      summary: { writes_committed: 0 },
    });
  });

  it("rejects production apply before a transaction and never creates a production approval artifact", async () => {
    const importer = await loadImporter();
    const createMemoryModelStore = requireFunction(importer, "createMemoryModelStore");
    const runModelImport = requireFunction(importer, "runModelImport");
    const store = createMemoryModelStore() as { snapshot: () => { writes: number } };

    await expect(runModelImport({
      bundle: buildBundle(),
      mode: "apply",
      environment: "production",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: pilotScope,
      expected_pilot_scope: pilotScope,
      canonical_ingredients: canonicalIngredients,
      approval,
      store,
    } as never)).rejects.toMatchObject({
      code: "PRODUCTION_LOAD_APPROVAL_REQUIRED",
      summary: { writes_attempted: 0, writes_committed: 0 },
    });
    expect(store.snapshot().writes).toBe(0);
  });

  it("accepts exactly 30 pilot recipes and canonical closure and rejects 29/31 or outside ingredients", async () => {
    const importer = await loadImporter();
    const validatePilotScope = requireFunction(importer, "validatePilotScope");

    expect(validatePilotScope(pilotScope as never, pilotScope as never)).toMatchObject({
      scope_recipe_count: 30,
      scope_ingredient_count: 1,
    });
    for (const invalid of [
      { ...pilotScope, recipe_ids: pilotScope.recipe_ids.slice(0, 29) },
      { ...pilotScope, recipe_ids: [...pilotScope.recipe_ids, "recipe-31"] },
      { ...pilotScope, ingredient_ids: [...pilotScope.ingredient_ids, "outside-ingredient"] },
    ]) {
      expect(() => validatePilotScope(invalid as never, pilotScope as never)).toThrowError(
        expect.objectContaining({ code: "PILOT_SCOPE_MISMATCH" }),
      );
    }
  });

  it("rejects incomplete decisions or decision ingredients outside the canonical pilot closure before writes", async () => {
    const importer = await loadImporter();
    const createMemoryModelStore = requireFunction(importer, "createMemoryModelStore");
    const runModelImport = requireFunction(importer, "runModelImport");

    for (const invalidApproval of [
      { ...approval, nutrition_decisions: [] },
      {
        ...approval,
        nutrition_decisions: [{
          ...approval.nutrition_decisions[0],
          ingredient_id: "outside-ingredient",
        }],
      },
    ]) {
      const store = createMemoryModelStore() as { snapshot: () => { writes: number } };
      await expect(runModelImport({
        bundle: buildBundle(),
        mode: "apply",
        environment: "local",
        pilot_scope: "foodsafety-30",
        actual_pilot_scope: pilotScope,
        expected_pilot_scope: pilotScope,
        canonical_ingredients: canonicalIngredients,
        approval: invalidApproval,
        store,
      } as never)).rejects.toMatchObject({
        code: "INVALID_APPROVAL_FILE",
        summary: { writes_attempted: 0, writes_committed: 0 },
      });
      expect(store.snapshot().writes).toBe(0);
    }
  });

  it("fails closed on secret/auth-query/raw-row/private-path material and returns no unsafe value", async () => {
    const importer = await loadImporter();
    const assertPrSafeValue = requireFunction(importer, "assertPrSafeValue");

    for (const unsafe of [
      { credential_name: "DATA_GO_KR_API_KEY" },
      { source_url: "https://example.test/data?serviceKey=SYNTHETIC_TEST_ONLY" },
      { raw_payload: { item: "provider-shaped-row" } },
      { raw_row: "full provider row" },
      { report_artifact: "/private/workspace/report.json" },
    ]) {
      expect(() => assertPrSafeValue(unsafe as never)).toThrowError(
        expect.objectContaining({ code: "SECRET_OR_RAW_DATA_LEAK" }),
      );
    }
  });

  it("rolls back atomically, validates run reports, and disables without deleting immutable payload", async () => {
    const importer = await loadImporter();
    const createMemoryModelStore = requireFunction(importer, "createMemoryModelStore");
    const runModelImport = requireFunction(importer, "runModelImport");
    const buildRunReport = requireFunction(importer, "buildRunReport");
    const validateRunReport = requireFunction(importer, "validateRunReport");
    const disableModelRun = requireFunction(importer, "disableModelRun");
    const store = createMemoryModelStore({ fail_after_writes: 1 } as never) as {
      snapshot: () => { writes: number; payload_rows: unknown[] };
    };

    await expect(runModelImport({
      bundle: buildBundle(),
      mode: "apply",
      environment: "local",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: pilotScope,
      expected_pilot_scope: pilotScope,
      canonical_ingredients: canonicalIngredients,
      approval,
      store,
    } as never)).rejects.toMatchObject({
      code: "IMPORT_TRANSACTION_FAILED",
      summary: { writes_committed: 0 },
    });
    expect(store.snapshot()).toMatchObject({ writes: 0, payload_rows: [] });

    const healthyStore = createMemoryModelStore() as unknown;
    const summary = await runModelImport({
      bundle: buildBundle(),
      mode: "apply",
      environment: "local",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: pilotScope,
      expected_pilot_scope: pilotScope,
      canonical_ingredients: canonicalIngredients,
      approval,
      store: healthyStore,
    } as never) as Record<string, unknown>;
    const report = buildRunReport(summary as never) as Record<string, unknown>;
    expect(validateRunReport(report as never)).toEqual(report);
    expect(validateRunReport(JSON.parse(JSON.stringify(report)) as never)).toEqual(report);
    expect(() => validateRunReport({ ...report, writes_committed: 999 } as never))
      .toThrowError(expect.objectContaining({ code: "INVALID_RUN_REPORT" }));
    const databaseSummary = {
      ...summary,
      affected_source_id: "00000000-0000-4000-8000-000000000010",
      affected_row_ids: {
        nutrition_source_ids: ["00000000-0000-4000-8000-000000000010"],
        nutrition_source_item_ids: [],
        nutrition_profile_ids: [],
        nutrition_value_keys: [],
        nutrition_link_ids: [],
        measurement_evidence_ids: [],
        conversion_assignment_ids: [],
        piece_weight_ids: [],
      },
    };
    const databaseReport = buildRunReport(databaseSummary as never) as Record<string, unknown>;
    const missingAffectedRows = { ...databaseReport };
    delete missingAffectedRows.affected_row_ids;
    delete missingAffectedRows.report_checksum;
    missingAffectedRows.report_checksum = sha256(missingAffectedRows);
    expect(() => validateRunReport(missingAffectedRows as never))
      .toThrowError(expect.objectContaining({ code: "INVALID_RUN_REPORT" }));
    const disabled = await disableModelRun({
      report,
      store: healthyStore,
      environment: "local",
      decision: {
        reviewed_by: "operator-2",
        reviewed_at: "2026-07-14T02:00:00.000Z",
        reason: "local rollback rehearsal",
      },
    } as never) as Record<string, unknown>;
    expect(disabled).toMatchObject({ mode: "disable", payload_deleted: 0 });
  });

  it("registers strict import/report/disable package commands", () => {
    const pkg = JSON.parse(readFileSync(`${process.cwd()}/package.json`, "utf8"));

    expect(pkg.scripts).toMatchObject({
      "nutrition:model:import": expect.stringContaining("ingredient-nutrition-model-cli.mjs import"),
      "nutrition:model:report": expect.stringContaining("ingredient-nutrition-model-cli.mjs report"),
      "nutrition:model:disable": expect.stringContaining("ingredient-nutrition-model-cli.mjs disable"),
    });
  });

  it("rejects unknown CLI flags and missing apply approval instead of ignoring them", async () => {
    const importer = await loadImporter();
    const parseModelCliArgs = requireFunction(importer, "parseModelCliArgs");

    expect(parseModelCliArgs("import" as never, [
      "--bundle", "bundle.json",
      "--mode", "dry-run",
      "--pilot-scope", "foodsafety-30",
    ] as never)).toMatchObject({
      bundle: "bundle.json",
      mode: "dry-run",
      pilot_scope: "foodsafety-30",
      environment: "local",
    });
    expect(parseModelCliArgs("report" as never, ["--", "--run-id", "model-12345678"] as never))
      .toEqual({ run_id: "model-12345678" });
    expect(() => parseModelCliArgs("import" as never, ["--unknown", "value"] as never))
      .toThrowError(expect.objectContaining({ code: "CLI_ARGUMENT_INVALID" }));
    expect(() => parseModelCliArgs("import" as never, [
      "--bundle", "bundle.json",
      "--mode", "apply",
      "--pilot-scope", "foodsafety-30",
      "--environment", "local",
    ] as never)).toThrowError(expect.objectContaining({ code: "APPROVAL_FILE_REQUIRED" }));
  });
});
