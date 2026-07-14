import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

const IMPORT_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/ingredient-nutrition-import.mjs`,
).href;
const CONVERSION_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/ingredient-conversion-domain.mjs`,
).href;
const MODEL_CLI_URL = pathToFileURL(
  `${process.cwd()}/scripts/ingredient-nutrition-model-cli.mjs`,
).href;

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : canonicalStringify(value))
    .digest("hex");
}

function withHandoffChecksum<T extends Record<string, unknown>>(bundle: T) {
  const body = { ...bundle };
  delete body.handoff_checksum;
  return { ...body, handoff_checksum: sha256(body) };
}

function buildBundle() {
  const handoffSchemaChecksum = sha256({
    schema_version: "public-nutrition-handoff-v1",
    measurement_evidence_schema_version: "public-nutrition-measurement-evidence-v1",
    lifecycle: ["raw", "staged", "normalized", "reviewed", "approved_pinned"],
  });
  const approvedItems = [{
    external_item_key: "source-item-1",
    external_name: "두부",
    business_key: "synthetic:source-item-1",
    preparation_state: "raw",
    edible_portion: "edible",
    basis: { amount: 100, unit: "g", source_text: "100 g" },
    serving: { amount: 50, unit: "g", source_text: "50 g" },
    total_content: { amount: 300, unit: "g", source_text: "300 g" },
    values: {
      protein_g: {
        source_nutrient_code: "PROCNT",
        amount: 8,
        unit: "g",
        missing_reason: null,
        source_token: "8",
      },
    },
    content_hash: "",
    fingerprint: "",
  }];
  approvedItems[0].content_hash = sha256({
    external_item_key: approvedItems[0].external_item_key,
    external_name: approvedItems[0].external_name,
    basis: approvedItems[0].basis,
    values: approvedItems[0].values,
  });
  approvedItems[0].fingerprint = sha256({
    business_key: approvedItems[0].business_key,
    content_hash: approvedItems[0].content_hash,
  });
  const counts = {
    fetched_raw_count: 1,
    unique_input_count: 1,
    normalized_count: 1,
    deduplicated_identical_count: 0,
    quarantined_count: 0,
  };
  const normalizedContentHash = sha256({ rows: approvedItems, quarantined: [], counts });
  const body = {
    schema_version: "public-nutrition-handoff-v1",
    handoff_schema_checksum: handoffSchemaChecksum,
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
  return withHandoffChecksum(body);
}

const expectedPilotScope = {
  recipe_ids: Array.from({ length: 30 }, (_, index) =>
    `recipe-${String(index + 1).padStart(2, "0")}`),
  ingredient_ids: ["ingredient-tofu"],
};

const canonicalIngredients = [{
  id: "ingredient-tofu",
  normalized_names: ["두부"],
  preparation_state: "raw",
  edible_portion: "edible",
  basis_dimension: "mass",
}];

function approvalFor(bundle: {
  approved_items: Array<{ fingerprint: string }>;
  handoff_checksum: string;
}) {
  const candidate = {
    fingerprint: bundle.approved_items[0].fingerprint,
    ingredient_id: "ingredient-tofu",
    preparation_state: "raw",
    review_status: "pending",
    is_active: false,
    candidate_rank: 1,
  };
  const candidateIdentity = sha256({ kind: "nutrition", ...candidate });
  return {
    schema_version: "ingredient-nutrition-review-v1",
    reviewed_by: "operator-1",
    reviewed_at: "2026-07-14T00:00:00.000Z",
    decision_reason: "reviewed test decision",
    pilot_scope: expectedPilotScope,
    nutrition_decisions: [{
      fingerprint: bundle.approved_items[0].fingerprint,
      ingredient_id: "ingredient-tofu",
      preparation_state: "raw",
      status: "approved",
      reason: "semantic match reviewed",
      candidate_identity: candidateIdentity,
      candidate_checksum: sha256({
        candidate_identity: candidateIdentity,
        source_checksum: bundle.handoff_checksum,
        candidate: { kind: "nutrition", ...candidate },
      }),
    }],
    conversion_decisions: [],
    piece_decisions: [],
  };
}

describe("Stage 3 group 1: shared handoff, dry-run, and approval semantics", () => {
  it("rejects a self-checksummed handoff whose approved row no longer matches the pinned normalized hash", async () => {
    const { validateHandoffBundle } = await import(IMPORT_URL);
    const bundle = buildBundle();
    const fabricated = withHandoffChecksum({
      ...bundle,
      approved_items: [{ ...bundle.approved_items[0], external_name: "변조 두부" }],
    });

    expect(() => validateHandoffBundle(fabricated)).toThrowError(
      expect.objectContaining({ code: "INVALID_HANDOFF_BUNDLE" }),
    );
  });

  it("runs dry-run validation through nutrient normalization and rejects a negative nutrient with zero writes", async () => {
    const { createMemoryModelStore, runModelImport } = await import(IMPORT_URL);
    const bundle = buildBundle();
    const unsafe = withHandoffChecksum({
      ...bundle,
      approved_items: [{
        ...bundle.approved_items[0],
        values: {
          protein_g: { ...bundle.approved_items[0].values.protein_g, amount: -1, source_token: "-1" },
        },
      }],
    });
    const store = createMemoryModelStore();

    await expect(runModelImport({
      bundle: unsafe,
      mode: "dry-run",
      environment: "local",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: expectedPilotScope,
      expected_pilot_scope: expectedPilotScope,
      canonical_ingredients: canonicalIngredients,
      approval: null,
      store,
    })).rejects.toMatchObject({
      code: "INVALID_HANDOFF_BUNDLE",
      summary: { writes_attempted: 0, writes_committed: 0 },
    });
    expect(store.snapshot().writes).toBe(0);
  });

  it("compares authoritative actual scope with the pinned seed scope instead of self-comparing expected scope", async () => {
    const { createMemoryModelStore, runModelImport } = await import(IMPORT_URL);
    const actualPilotScope = {
      ...expectedPilotScope,
      ingredient_ids: [...expectedPilotScope.ingredient_ids, "outside-ingredient"],
    };

    await expect(runModelImport({
      bundle: buildBundle(),
      mode: "dry-run",
      environment: "local",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: actualPilotScope,
      expected_pilot_scope: expectedPilotScope,
      canonical_ingredients: canonicalIngredients,
      approval: null,
      store: createMemoryModelStore(),
    })).rejects.toMatchObject({ code: "PILOT_SCOPE_MISMATCH" });
  });

  it("rejects approval when the authoritative ingredient context is not semantically compatible", async () => {
    const { createMemoryModelStore, runModelImport } = await import(IMPORT_URL);
    const bundle = buildBundle();

    await expect(runModelImport({
      bundle,
      mode: "apply",
      environment: "local",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: expectedPilotScope,
      expected_pilot_scope: expectedPilotScope,
      canonical_ingredients: [{ ...canonicalIngredients[0], normalized_names: ["콩"] }],
      approval: approvalFor(bundle),
      store: createMemoryModelStore(),
    })).rejects.toMatchObject({ code: "INVALID_APPROVAL_FILE" });
  });

  it("rejects a single-profile approval for exact 17.5 midpoint evidence", async () => {
    const { createMemoryModelStore, runModelImport } = await import(IMPORT_URL);
    const base = buildBundle();
    const evidenceBase = {
      evidence_schema_version: "public-nutrition-measurement-evidence-v1",
      evidence_kind: "volume_weight",
      ingredient_or_category_id: "ingredient-tofu",
      source_observed_unit: "1 tbsp (15mL)",
      observed_g_per_15ml: 17.5,
      selected_representative_grade: "VOLUME_G15",
      absolute_error_g_per_15ml: 2.5,
      review_result: "approved",
      license_disposition: "approved_for_internal_evidence",
      source_url: "https://example.test/measurement",
      accessed_at: "2026-07-01",
      license_evidence_url: "https://example.test/measurement-license",
      license_checked_at: "2026-07-01",
    };
    const evidence = { ...evidenceBase, evidence_checksum: sha256(evidenceBase) };
    const bundle = withHandoffChecksum({ ...base, measurement_evidence: [evidence] });
    const approval = approvalFor(bundle);
    approval.conversion_decisions.push({
      evidence_key: "ingredient-tofu",
      ingredient_id: "ingredient-tofu",
      conversion_profile_code: "VOLUME_G15",
      preparation_state: "raw",
      status: "approved",
      reason: "must not bypass the tie",
    } as never);

    await expect(runModelImport({
      bundle,
      mode: "apply",
      environment: "local",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: expectedPilotScope,
      expected_pilot_scope: expectedPilotScope,
      canonical_ingredients: canonicalIngredients,
      approval,
      store: createMemoryModelStore(),
    })).rejects.toMatchObject({ code: "INVALID_APPROVAL_FILE" });
  });

  it("rejects raw distance 2.50004 before rounding for display", async () => {
    const { generateVolumeCandidates } = await import(CONVERSION_URL);
    const result = generateVolumeCandidates({
      ingredient_id: "ingredient-tofu",
      evidence_id: "raw-distance",
      normalized_g_per_15ml: 3.49996,
      preparation_state: "raw",
      compatibility: "compatible",
      evidence_review_status: "approved",
      evidence_is_active: true,
      source_freshness_status: "current",
      source_review_status: "approved",
      source_is_active: true,
    });

    expect(result).toEqual({ candidates: [], reason_codes: ["NO_PROFILE_WITHIN_DISTANCE"] });
  });
});

describe("Stage 3 group 2: SQL ownership, piece persistence, and recovery", () => {
  it("rejects affected-row tampering even when the attacker recomputes the file checksum", async () => {
    const { buildRunReport, validateRunReportAgainstRegistry } = await import(IMPORT_URL);
    const affectedRowIds = {
      nutrition_source_ids: ["source-a"],
      nutrition_source_item_ids: ["item-a"],
      nutrition_profile_ids: ["profile-a"],
      nutrition_value_keys: ["profile-a:protein_g"],
      nutrition_link_ids: ["link-a"],
      measurement_evidence_ids: [],
      conversion_assignment_ids: [],
      piece_weight_ids: ["piece-a"],
    };
    const report = buildRunReport({
      schema_version: "ingredient-nutrition-model-run-v1",
      run_id: "model-aaaaaaaaaaaaaaaaaaaaaaaa",
      environment: "local",
      status: "applied",
      idempotency_key: "run-a",
      source_payload_identity: "payload-a",
      decision_checksum: "decision-a",
      content_hash: "content-a",
      affected_source_id: "source-a",
      affected_row_ids: affectedRowIds,
      writes_attempted: 8,
      writes_committed: 8,
    });
    const registry = {
      registry_checksum: "a".repeat(64),
      run_id: report.run_id,
      idempotency_key: report.idempotency_key,
      source_payload_identity: report.source_payload_identity,
      decision_checksum: report.decision_checksum,
      content_hash: report.content_hash,
      affected_source_id: report.affected_source_id,
      affected_row_ids: affectedRowIds,
      writes_committed: 8,
    };
    const forgedBody = {
      ...report,
      affected_row_ids: { ...affectedRowIds, piece_weight_ids: ["piece-from-run-b"] },
      report_checksum: undefined,
    };
    delete forgedBody.report_checksum;
    const forged = { ...forgedBody, report_checksum: sha256(forgedBody) };

    expect(() => validateRunReportAgainstRegistry(forged, registry)).toThrowError(
      expect.objectContaining({ code: "INVALID_RUN_REPORT" }),
    );
  });

  it("refuses cross-run disable before entering a write transaction", async () => {
    const { disableModelRun } = await import(IMPORT_URL);
    const reportBody = {
      schema_version: "ingredient-nutrition-model-report-v1",
      mode: "report",
      run_id: "model-bbbbbbbbbbbbbbbbbbbbbbbb",
      environment: "local",
      status: "applied",
      idempotency_key: "run-a",
      source_payload_identity: "payload-a",
      decision_checksum: "decision-a",
      content_hash: "content-a",
      affected_source_id: "source-a",
      affected_row_ids: {
        nutrition_source_ids: ["source-a"],
        nutrition_source_item_ids: [],
        nutrition_profile_ids: [],
        nutrition_value_keys: [],
        nutrition_link_ids: [],
        measurement_evidence_ids: [],
        conversion_assignment_ids: [],
        piece_weight_ids: ["piece-from-run-b"],
      },
      writes_attempted: 1,
      writes_committed: 1,
    };
    const report = { ...reportBody, report_checksum: sha256(reportBody) };
    const transaction = vi.fn();
    const store = {
      findRun: () => null,
      getRunRegistry: () => ({
        registry_checksum: "b".repeat(64),
        ...reportBody,
        affected_row_ids: { ...reportBody.affected_row_ids, piece_weight_ids: ["piece-a"] },
      }),
      transaction,
    };

    await expect(disableModelRun({
      report,
      store,
      environment: "local",
      decision: {
        reviewed_by: "operator-2",
        reviewed_at: "2026-07-14T02:00:00.000Z",
        reason: "must be owned by the requested run",
      },
    })).rejects.toMatchObject({ code: "INVALID_RUN_REPORT" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("preserves committed write truth when report publication fails and marks recovery pending", async () => {
    const { IngredientNutritionImportError, publishRunWithRecovery } = await import(IMPORT_URL);
    const { formatCliFailure } = await import(MODEL_CLI_URL);
    const summary = {
      schema_version: "ingredient-nutrition-model-run-v1",
      run_id: "model-cccccccccccccccccccccccc",
      status: "applied",
      idempotency_key: "run-c",
      content_hash: "content-c",
      writes_attempted: 7,
      writes_committed: 7,
    };

    const pending = await publishRunWithRecovery(summary, async () => {
      throw new Error("synthetic publication failure");
    }).catch((error: unknown) => error);
    expect(pending).toMatchObject({
      code: "REPORT_PUBLICATION_PENDING",
      summary: {
        run_id: summary.run_id,
        status: "applied",
        writes_attempted: 7,
        writes_committed: 7,
        report_publication_status: "pending_recovery",
      },
    });
    expect(formatCliFailure(pending)).toMatchObject({
      status: "applied",
      writes_attempted: 7,
      writes_committed: 7,
      report_publication_status: "pending_recovery",
      error: { code: "REPORT_PUBLICATION_PENDING" },
    });
    expect(formatCliFailure(new IngredientNutritionImportError(
      "IMPORT_TRANSACTION_FAILED",
      {},
      { ...summary, writes_committed: 0 },
    ))).toMatchObject({
      status: "rejected",
      writes_committed: 0,
      error: { code: "IMPORT_TRANSACTION_FAILED" },
    });
  });

  it("propagates authoritative DB supersede counts into the operator summary", async () => {
    const { runModelImport } = await import(IMPORT_URL);
    const bundle = buildBundle();
    const affectedRowIds = Object.fromEntries([
      "nutrition_source_ids",
      "nutrition_source_item_ids",
      "nutrition_profile_ids",
      "nutrition_value_keys",
      "nutrition_link_ids",
      "measurement_evidence_ids",
      "conversion_assignment_ids",
      "piece_weight_ids",
    ].map((field) => [field, []]));
    const summary = await runModelImport({
      bundle,
      mode: "apply",
      environment: "local",
      pilot_scope: "foodsafety-30",
      actual_pilot_scope: expectedPilotScope,
      expected_pilot_scope: expectedPilotScope,
      canonical_ingredients: canonicalIngredients,
      approval: approvalFor(bundle),
      store: {
        findRun: () => null,
        applyModelBundle: async () => ({
          status: "applied",
          freshness_status: "current",
          writes_committed: 6,
          replayed: false,
          source_id: "source-db",
          affected_row_ids: affectedRowIds,
          superseded_count: 3,
        }),
      },
    });

    expect(summary).toMatchObject({
      status: "applied",
      writes_attempted: 6,
      writes_committed: 6,
      superseded_count: 3,
    });
  });

  it("recovers and disables an applied run from the indexed DB registry without a local report file", async () => {
    const { disableModelRun } = await import(IMPORT_URL);
    const { loadRegisteredReport } = await import(MODEL_CLI_URL);
    const registryRoot = mkdtempSync(path.join(tmpdir(), "nutrition-report-recovery-"));
    const affectedRowIds = {
      nutrition_source_ids: ["source-recovery"],
      nutrition_source_item_ids: ["item-recovery"],
      nutrition_profile_ids: ["profile-recovery"],
      nutrition_value_keys: ["profile-recovery:protein_g"],
      nutrition_link_ids: ["link-recovery"],
      measurement_evidence_ids: [],
      conversion_assignment_ids: [],
      piece_weight_ids: ["piece-recovery"],
    };
    const summary = {
      schema_version: "ingredient-nutrition-model-run-v1",
      run_id: "model-dddddddddddddddddddddddd",
      environment: "local",
      status: "applied",
      idempotency_key: "run-recovery",
      source_payload_identity: "payload-recovery",
      decision_checksum: "decision-recovery",
      content_hash: "content-recovery",
      affected_source_id: "source-recovery",
      affected_row_ids: affectedRowIds,
      writes_attempted: 7,
      writes_committed: 7,
    };
    const registry = {
      registry_checksum: "d".repeat(64),
      run_id: summary.run_id,
      idempotency_key: summary.idempotency_key,
      source_payload_identity: summary.source_payload_identity,
      decision_checksum: summary.decision_checksum,
      content_hash: summary.content_hash,
      affected_source_id: summary.affected_source_id,
      affected_row_ids: affectedRowIds,
      writes_committed: summary.writes_committed,
      summary,
    };
    const getRunRegistry = vi.fn((identifier: string) =>
      [summary.run_id, summary.idempotency_key].includes(identifier) ? registry : null);
    const publisher = vi.fn(async (recoveredSummary) => recoveredSummary);
    const disableAppliedModel = vi.fn(async () => ({
      writes_committed: 3,
      payload_deleted: 0,
      revoked_count: 2,
    }));
    const store = {
      getRunRegistry,
      findRun: () => null,
      disableAppliedModel,
    };

    try {
      const report = await loadRegisteredReport(summary.run_id, store, {
        registryRoot,
        publisher,
      });
      expect(report).toMatchObject({
        run_id: summary.run_id,
        status: "applied",
        report_publication_status: "recovered",
      });
      expect(getRunRegistry).toHaveBeenCalledWith(summary.run_id);
      expect(publisher).toHaveBeenCalledOnce();

      const disabled = await disableModelRun({
        report,
        store,
        environment: "local",
        decision: {
          reviewed_by: "operator-recovery",
          reviewed_at: "2026-07-15T00:00:00.000Z",
          reason: "recovered report disable",
        },
      });
      expect(disabled).toMatchObject({
        status: "disabled",
        writes_committed: 3,
        revoked_count: 2,
        payload_deleted: 0,
      });
      expect(disableAppliedModel).toHaveBeenCalledOnce();
    } finally {
      rmSync(registryRoot, { recursive: true, force: true });
    }
  });

  it("persists piece decisions and provenance while registering immutable run ownership in the same SQL transaction", () => {
    const sql = readFileSync(
      "supabase/migrations/20260714143000_ingredient_nutrition_conversion_model.sql",
      "utf8",
    );
    const applySql = sql.slice(sql.indexOf("create function public.apply_ingredient_nutrition_model"));

    expect(applySql).toMatch(/insert into public\.piece_unit_weights/i);
    expect(applySql).toContain("source_serving_amount");
    expect(applySql).toContain("source_total_content_amount");
    expect(applySql).toContain("edible_portion_percent");
    expect(applySql).toContain("source_nutrient_code");
    expect(applySql).toContain("insert into public.operational_events");
    expect(sql).toMatch(/metadata_json\s*->>\s*'idempotency_key'/i);
    expect(sql).toMatch(/metadata_json\s*->>\s*'run_id'/i);
    expect(sql).toContain("IMMUTABLE_INGREDIENT_NUTRITION_RUN");
    expect(sql).toContain("validate_ingredient_nutrition_model_insert");
    expect(applySql).toContain("decision_checksum");
    expect(applySql).toContain("source_payload_identity");
  });
});

describe("Stage 3 group 3: staging boundary, RLS, and registry performance", () => {
  it("uses only the package-owned staging adapter and rejects every external adapter option", async () => {
    const { parseModelCliArgs } = await import(IMPORT_URL);
    const base = [
      "--bundle", "bundle.json",
      "--mode", "apply",
      "--pilot-scope", "foodsafety-30",
      "--approval-file", "approval.json",
      "--environment", "staging",
    ];

    expect(parseModelCliArgs("import", base)).toMatchObject({ environment: "staging" });
    for (const adapter of [
      "scripts/public-nutrition-source-cli.mjs",
      "tests/fixtures/ingredient-nutrition-database-adapter.mjs",
      "https://staging.example.test/query",
      ".env.staging",
    ]) {
      expect(() => parseModelCliArgs("import", [
        ...base,
        "--database-adapter", adapter,
      ])).toThrowError(expect.objectContaining({ code: "CLI_ARGUMENT_INVALID" }));
    }
  });

  it("uses the indexed database registry instead of scanning every report directory", () => {
    const cli = readFileSync("scripts/ingredient-nutrition-model-cli.mjs", "utf8");
    const migration = readFileSync(
      "supabase/migrations/20260714143000_ingredient_nutrition_conversion_model.sql",
      "utf8",
    );

    expect(cli).not.toContain("readdirSync");
    expect(cli).not.toContain("registrySummaryByIdempotency");
    expect(cli).toContain("get_ingredient_nutrition_model_run");
    expect(migration).toMatch(
      /create unique index[^;]+metadata_json\s*->>\s*'idempotency_key'/i,
    );
  });

  it("keeps production fail-closed before any external adapter can be selected", async () => {
    const { parseModelCliArgs } = await import(IMPORT_URL);

    expect(() => parseModelCliArgs("import", [
      "--bundle", "bundle.json",
      "--mode", "apply",
      "--pilot-scope", "foodsafety-30",
      "--approval-file", "approval.json",
      "--environment", "production",
    ])).toThrowError(expect.objectContaining({
      code: "PRODUCTION_LOAD_APPROVAL_REQUIRED",
    }));
  });

  it("limits executable adapter injection to the exact regular test fixture and rejects symlinks", async () => {
    const { runTestDatabaseAdapter } = await import(MODEL_CLI_URL);
    const tempRoot = mkdtempSync(path.join(tmpdir(), "nutrition-adapter-link-"));
    const adapterLink = path.join(tempRoot, "adapter-link.mjs");
    symlinkSync(
      path.resolve("tests/fixtures/ingredient-nutrition-database-adapter.mjs"),
      adapterLink,
    );

    try {
      expect(runTestDatabaseAdapter(
        "tests/fixtures/ingredient-nutrition-database-adapter.mjs",
        "select 'safe fixture query'::text",
      )).toEqual({ adapter_contract: "accepted" });
      expect(() => runTestDatabaseAdapter(
        "scripts/public-nutrition-source-cli.mjs",
        "select 1",
      )).toThrowError(expect.objectContaining({ code: "DATABASE_ADAPTER_FORBIDDEN" }));
      expect(() => runTestDatabaseAdapter(adapterLink, "select 1")).toThrowError(
        expect.objectContaining({ code: "DATABASE_ADAPTER_FORBIDDEN" }),
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
