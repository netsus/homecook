import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_NUTRITION_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_NUTRITION_PGHOST ?? "";
const port = process.env.HOMECOOK_NUTRITION_PGPORT ?? "";
const database = process.env.HOMECOOK_NUTRITION_PGDATABASE ?? "";
const actorId = "10000000-0000-4000-8000-000000000001";
const ingredientId = "20000000-0000-4000-8000-000000000001";

function psqlResult(sql: string) {
  return spawnSync("psql", [
    "-h", host,
    "-p", port,
    "-U", "postgres",
    "-d", database,
    "-At",
    "-v", "ON_ERROR_STOP=1",
    "-c", sql,
  ], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: process.env.NODE_ENV ?? "test",
    },
  });
}

function psql(sql: string): string {
  const result = psqlResult(sql);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function psqlAll(sql: string): string {
  const result = psqlResult(sql);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function encodedJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function modelInput() {
  const evidence = {
    evidence_schema_version: "public-nutrition-measurement-evidence-v1",
    evidence_kind: "piece_weight",
    evidence_checksum: "piece-evidence-checksum",
    ingredient_or_category_id: ingredientId,
    source_subject: "두부",
    preparation_state: "raw",
    size_code: "large",
    source_observed_unit: "piece",
    source_observed_amount: 1,
    observed_g: 40,
    source_url: "https://example.test/measurement",
    accessed_at: "2026-07-01",
    license_evidence_url: "https://example.test/license",
  };
  return {
    run_id: "model-postgres-integration-0001",
    idempotency_key: "postgres-apply-key-0001",
    source_payload_identity: "postgres-payload-identity-0001",
    decision_checksum: "postgres-decision-checksum-0001",
    content_hash: "postgres-content-hash-0001",
    bundle: {
      status: "approved_pinned",
      handoff_schema_checksum: "handoff-schema-checksum",
      approved_manifest: {
        provider: "MFDS",
        dataset: "Stage 3 PostgreSQL fixture",
        source_version: "2026-07-01",
        data_basis_date: "2026-07-01",
        license: "test-only",
        license_url: "https://example.test/license",
        raw_sha256: "fixture-manifest-sha",
      },
      public_attribution: [{ source_url: "https://example.test/nutrition" }],
      approved_items: [{
        external_item_key: "tofu-001",
        external_name: "두부",
        preparation_state: "raw",
        basis: { source_text: "100 g", amount: 100, unit: "g" },
        serving: { source_text: "50 g", amount: 50, unit: "g" },
        total_content: { source_text: "300 g", amount: 300, unit: "g" },
        edible_portion: { text: "가식부 100%", percent: 100 },
        fingerprint: "tofu-fingerprint-001",
        values: {
          protein_g: {
            source_nutrient_code: "PROCNT",
            amount: 8,
            unit: "g",
            source_token: "8",
          },
        },
      }],
      measurement_evidence: [evidence],
    },
    approval: {
      reviewed_by: actorId,
      reviewed_at: "2026-07-14T00:00:00.000Z",
      decision_reason: "postgres integration approval",
      nutrition_decisions: [{
        fingerprint: "tofu-fingerprint-001",
        ingredient_id: ingredientId,
        preparation_state: "raw",
        candidate_identity: "nutrition-candidate-identity",
        candidate_checksum: "nutrition-candidate-checksum",
        status: "approved",
        reason: "exact semantic fixture match",
      }],
      conversion_decisions: [],
      piece_decisions: [{
        evidence_key: ingredientId,
        ingredient_id: ingredientId,
        preparation_state: "raw",
        size_code: "large",
        weight_g: 40,
        candidate_identity: "piece-candidate-identity",
        candidate_checksum: "piece-candidate-checksum",
        status: "approved",
        reason: "exact piece fixture match",
      }],
    },
    candidate_plan: {
      nutrition_candidates: [{
        fingerprint: "tofu-fingerprint-001",
        ingredient_id: ingredientId,
        preparation_state: "raw",
        candidate_identity: "nutrition-candidate-identity",
        candidate_checksum: "nutrition-candidate-checksum",
        review_status: "pending",
      }],
      conversion_candidates: [],
      piece_candidates: [{
        evidence_key: ingredientId,
        ingredient_id: ingredientId,
        evidence_checksum: evidence.evidence_checksum,
        preparation_state: "raw",
        size_code: "large",
        weight_g: 40,
        candidate_identity: "piece-candidate-identity",
        candidate_checksum: "piece-candidate-checksum",
        review_status: "pending",
      }],
    },
  };
}

describe.runIf(enabled)("ingredient nutrition isolated PostgreSQL integration", () => {
  beforeAll(() => {
    expect(host).not.toBe("");
    expect(port).not.toBe("");
    expect(database).not.toBe("");
    psql(`
      insert into public.users (id, nickname, social_provider, social_id)
      values ('${actorId}', 'stage3-operator', 'google', 'stage3-operator');
      insert into public.ingredients (id, standard_name, category, default_unit)
      values ('${ingredientId}', '두부', '가공식품', 'g');
    `);
  });

  it("applies exactly the official ten-table migration and enforces real role denial", () => {
    const count = psql(`
      select count(*)
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'nutrient_definitions', 'nutrition_sources', 'nutrition_source_items',
          'nutrition_profiles', 'nutrition_values', 'ingredient_nutrition_profiles',
          'measurement_conversion_profiles', 'measurement_source_evidence',
          'ingredient_conversion_assignments', 'piece_unit_weights'
        );
    `);
    expect(count).toBe("10");

    for (const role of ["anon", "authenticated"]) {
      const result = psqlResult(`set role ${role}; select count(*) from public.nutrition_sources;`);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("permission denied");
    }
    expect(psql("set role service_role; select count(*) from public.nutrition_sources;")).toBe("0");
  });

  it("runs apply, piece persistence, indexed registry replay, disable, and disable replay", () => {
    const encoded = encodedJson(modelInput());
    const applied = JSON.parse(psql(`
      select public.apply_ingredient_nutrition_model(
        convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb
      )::text;
    `));
    expect(applied).toMatchObject({ status: "applied", replayed: false });
    expect(applied.writes_committed).toBeGreaterThan(0);
    expect(applied.affected_row_ids.piece_weight_ids).toHaveLength(1);

    const piece = JSON.parse(psql(`
      select jsonb_build_object(
        'weight_g', weight_g,
        'review_status', review_status,
        'is_active', is_active
      )::text
      from public.piece_unit_weights;
    `));
    expect(piece).toEqual({ weight_g: 40, review_status: "approved", is_active: true });

    const replay = JSON.parse(psql(`
      select public.apply_ingredient_nutrition_model(
        convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb
      )::text;
    `));
    expect(replay).toMatchObject({ replayed: true, writes_committed: 0 });
    expect(psql("select count(*) from public.piece_unit_weights;")).toBe("1");

    const driftModel = structuredClone(modelInput());
    driftModel.run_id = "model-postgres-drift-0001";
    driftModel.idempotency_key = "postgres-drift-key-0001";
    driftModel.source_payload_identity = "postgres-drift-payload-0001";
    driftModel.decision_checksum = "postgres-drift-decision-0001";
    driftModel.content_hash = "postgres-drift-content-0001";
    driftModel.bundle.approved_manifest.source_version = "2026-07-02";
    driftModel.bundle.approved_manifest.raw_sha256 = "fixture-drift-manifest-sha";
    const driftEncoded = encodedJson(driftModel);
    const drifted = JSON.parse(psql(`
      select public.apply_ingredient_nutrition_model(
        convert_from(decode('${driftEncoded}', 'base64'), 'UTF8')::jsonb
      )::text;
    `));
    expect(drifted).toMatchObject({
      status: "needs_source_check",
      freshness_status: "drifted",
      replayed: false,
      writes_committed: 2,
    });
    expect(JSON.parse(psql(`
      select public.get_ingredient_nutrition_model_run('postgres-drift-key-0001')::text;
    `))).toMatchObject({
      idempotency_key: "postgres-drift-key-0001",
      source_payload_identity: "postgres-drift-payload-0001",
    });
    const driftReplay = JSON.parse(psql(`
      select public.apply_ingredient_nutrition_model(
        convert_from(decode('${driftEncoded}', 'base64'), 'UTF8')::jsonb
      )::text;
    `));
    expect(driftReplay).toMatchObject({ replayed: true, writes_committed: 0 });

    const registryPlan = psqlAll(`
      explain (format json)
      select metadata_json
      from public.operational_events
      where source = 'ingredient-nutrition-model'
        and event_type = 'ingredient_nutrition_model_applied'
        and metadata_json ->> 'idempotency_key' = 'postgres-apply-key-0001';
    `);
    expect(registryPlan).toContain("ingredient_nutrition_run_registry_idempotency_idx");

    const disabled = JSON.parse(psql(`
      select public.disable_ingredient_nutrition_model(
        'postgres-apply-key-0001', 'postgres-disable-key-0001', '${actorId}',
        'integration disable', '2026-07-15T00:00:00.000Z'
      )::text;
    `));
    expect(disabled).toMatchObject({ replayed: false, revoked_count: 2, payload_deleted: 0 });
    expect(psql("select review_status || ':' || is_active from public.piece_unit_weights;")).toBe(
      "revoked:false",
    );

    const disableReplay = JSON.parse(psql(`
      select public.disable_ingredient_nutrition_model(
        'postgres-apply-key-0001', 'postgres-disable-key-0001', '${actorId}',
        'integration disable', '2026-07-15T00:00:00.000Z'
      )::text;
    `));
    expect(disableReplay).toMatchObject({ replayed: true, writes_committed: 0 });
  });

  it("enforces append-only provenance, active uniqueness, and run ownership in PostgreSQL", () => {
    const registryMutation = psqlResult(`
      update public.operational_events
      set message_summary = 'tampered'
      where source = 'ingredient-nutrition-model';
    `);
    expect(registryMutation.status).not.toBe(0);
    expect(registryMutation.stderr).toContain("IMMUTABLE_INGREDIENT_NUTRITION_RUN");

    const duplicateActiveSource = psqlResult(`
      insert into public.nutrition_sources (
        provider_code, dataset_name, source_kind, source_version, fetched_at,
        freshness_checked_at, freshness_status, priority_rank, source_url,
        license_name, manifest_sha256, review_status, decision_reason,
        reviewed_by, reviewed_at, is_active
      ) values (
        'MFDS', 'Stage 3 PostgreSQL fixture', 'nutrition_dataset', '2026-07-02',
        now(), now(), 'current', 1, 'https://example.test/duplicate', 'test-only',
        'duplicate-manifest', 'approved', 'duplicate must fail', '${actorId}', now(), true
      );
    `);
    expect(duplicateActiveSource.status).not.toBe(0);
    expect(duplicateActiveSource.stderr).toContain("nutrition_sources_active_provider_dataset_idx");

    psql(`
      insert into public.nutrition_sources (
        id, provider_code, dataset_name, source_kind, source_version, fetched_at,
        freshness_checked_at, freshness_status, source_url, license_name,
        manifest_sha256, review_status, is_active
      ) values (
        '30000000-0000-4000-8000-000000000001', 'MFDS', 'Unapproved fixture',
        'nutrition_dataset', '2026-07-01', now(), now(), 'drifted',
        'https://example.test/unapproved', 'test-only', 'unapproved-manifest',
        'needs_source_check', false
      );
    `);
    const directInsertBypass = psqlResult(`
      insert into public.nutrition_source_items (
        source_id, external_item_key, external_name, source_basis_amount,
        source_basis_unit, stable_fingerprint, review_status
      ) values (
        '30000000-0000-4000-8000-000000000001', 'unsafe', '두부', 100,
        'g', 'unsafe-direct-insert', 'pending'
      );
    `);
    expect(directInsertBypass.status).not.toBe(0);
    expect(directInsertBypass.stderr).toContain("INVALID_NUTRITION_SOURCE_ITEM_CONTEXT");

    psql(`
      insert into public.nutrition_sources (
        id, provider_code, dataset_name, source_kind, source_version, fetched_at,
        freshness_checked_at, freshness_status, priority_rank, source_url,
        license_name, manifest_sha256, review_status, decision_reason,
        reviewed_by, reviewed_at, is_active
      ) values (
        '30000000-0000-4000-8000-000000000002', 'RDA_10_4', 'Tie fixture',
        'measurement_reference', '2026-07-01', now(), now(), 'current', 2,
        'https://example.test/tie', 'test-only', 'tie-manifest', 'approved',
        'tie fixture approval', '${actorId}', now(), true
      );
      insert into public.measurement_source_evidence (
        id, source_id, evidence_kind, source_subject, preparation_state,
        source_observed_unit, source_observed_amount, observed_volume_ml,
        observed_weight_g, normalized_g_per_15ml, source_url, source_accessed_at,
        evidence_fingerprint, review_status, decision_reason, reviewed_by,
        reviewed_at, version, is_active
      ) values (
        '40000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000002', 'volume_weight', '두부', 'raw',
        '1 tbsp (15mL)', 1, 15, 17.5, 17.5, 'https://example.test/tie',
        '2026-07-01', 'tie-evidence', 'approved', 'tie evidence approval',
        '${actorId}', now(), 1, true
      );
    `);
    const tieApproval = psqlResult(`
      insert into public.ingredient_conversion_assignments (
        ingredient_id, conversion_profile_id, evidence_id, preparation_state,
        distance_g_per_15ml, candidate_rank, assignment_reason, review_status,
        reviewed_by, reviewed_at, version, is_active
      ) values (
        '${ingredientId}', '71000000-0000-4000-8000-000000000015',
        '40000000-0000-4000-8000-000000000001', 'raw', 2.5, 1,
        'tie must not approve', 'approved', '${actorId}', now(), 1, true
      );
    `);
    expect(tieApproval.status).not.toBe(0);
    expect(tieApproval.stderr).toContain("INVALID_CONVERSION_ASSIGNMENT_CONTEXT");

    const crossRun = psqlResult(`
      select public.disable_ingredient_nutrition_model(
        'missing-model-run', 'postgres-disable-key-cross-run', '${actorId}',
        'cross run must fail', '2026-07-15T00:00:00.000Z'
      );
    `);
    expect(crossRun.status).not.toBe(0);
    expect(crossRun.stderr).toContain("INVALID_DISABLE_DECISION");
  });
});
