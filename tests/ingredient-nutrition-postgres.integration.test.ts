import { spawn, spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_NUTRITION_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_NUTRITION_PGHOST ?? "";
const port = process.env.HOMECOOK_NUTRITION_PGPORT ?? "";
const database = process.env.HOMECOOK_NUTRITION_PGDATABASE ?? "";
const actorId = "10000000-0000-4000-8000-000000000001";
const ingredientId = "20000000-0000-4000-8000-000000000001";
const flourIngredientId = "20000000-0000-4000-8000-000000000002";
const volumeIngredientId = "20000000-0000-4000-8000-000000000003";
const shadowIngredientId = "20000000-0000-4000-8000-000000000004";

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

function psqlAsync(sql: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [
      "-h", host,
      "-p", port,
      "-U", "postgres",
      "-d", database,
      "-At",
      "-v", "ON_ERROR_STOP=1",
      "-c", sql,
    ], {
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: process.env.NODE_ENV ?? "test",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function encodedJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function modelInput(decisionVersion: "A" | "B" | "C" | "D" = "A") {
  const decisionLabel = decisionVersion.toLowerCase();
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
  const volumeEvidence = {
    evidence_schema_version: "public-nutrition-measurement-evidence-v1",
    evidence_kind: "volume_weight",
    evidence_checksum: "volume-evidence-checksum",
    ingredient_or_category_id: volumeIngredientId,
    source_subject: "멥쌀가루",
    preparation_state: "raw",
    source_observed_unit: "1 tbsp (15mL)",
    source_observed_amount: 1,
    observed_g_per_15ml: 20,
    source_url: "https://example.test/measurement",
    accessed_at: "2026-07-01",
    license_evidence_url: "https://example.test/license",
  };
  return {
    run_id: `model-postgres-decision-${decisionLabel}-0001`,
    idempotency_key: `postgres-apply-key-${decisionLabel}-0001`,
    source_payload_identity: "postgres-payload-identity-0001",
    decision_checksum: `postgres-decision-checksum-${decisionLabel}-0001`,
    content_hash: `postgres-content-hash-${decisionLabel}-0001`,
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
      measurement_evidence: [evidence, volumeEvidence],
    },
    approval: {
      reviewed_by: actorId,
      reviewed_at: "2026-07-14T00:00:00.000Z",
      decision_reason: `postgres integration approval ${decisionVersion}`,
      nutrition_decisions: [{
        fingerprint: "tofu-fingerprint-001",
        ingredient_id: ingredientId,
        preparation_state: "raw",
        candidate_identity: "nutrition-candidate-identity",
        candidate_checksum: "nutrition-candidate-checksum",
        status: "approved",
        reason: `exact semantic fixture match ${decisionVersion}`,
      }],
      conversion_decisions: [{
        evidence_key: volumeIngredientId,
        ingredient_id: volumeIngredientId,
        preparation_state: "raw",
        conversion_profile_code: "VOLUME_G20",
        candidate_identity: "volume-candidate-identity",
        candidate_checksum: "volume-candidate-checksum",
        status: "approved",
        reason: `exact volume fixture match ${decisionVersion}`,
      }],
      piece_decisions: [{
        evidence_key: ingredientId,
        ingredient_id: ingredientId,
        preparation_state: "raw",
        size_code: "large",
        weight_g: 40,
        candidate_identity: "piece-candidate-identity",
        candidate_checksum: "piece-candidate-checksum",
        status: "approved",
        reason: `exact piece fixture match ${decisionVersion}`,
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
      conversion_candidates: [{
        evidence_key: volumeIngredientId,
        ingredient_id: volumeIngredientId,
        evidence_checksum: volumeEvidence.evidence_checksum,
        preparation_state: "raw",
        conversion_profile_code: "VOLUME_G20",
        candidate_identity: "volume-candidate-identity",
        candidate_checksum: "volume-candidate-checksum",
        review_status: "pending",
      }],
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

function multiNutritionModelInput(
  label: "seed" | "C" | "D",
  reverseNutritionOrder = false,
) {
  const model = structuredClone(modelInput(label === "D" ? "D" : "C"));
  const identityLabel = label.toLowerCase();
  model.run_id = `model-postgres-multi-${identityLabel}-0001`;
  model.idempotency_key = `postgres-multi-key-${identityLabel}-0001`;
  model.source_payload_identity = `postgres-multi-payload-${identityLabel}-0001`;
  model.decision_checksum = `postgres-multi-decision-${identityLabel}-0001`;
  model.content_hash = `postgres-multi-content-${identityLabel}-0001`;
  const flourItem = {
    ...model.bundle.approved_items[0]!,
    external_item_key: "flour-001",
    external_name: "밀가루",
    fingerprint: "flour-fingerprint-001",
  };
  const flourDecision = {
    ...model.approval.nutrition_decisions[0]!,
    fingerprint: flourItem.fingerprint,
    ingredient_id: flourIngredientId,
    candidate_identity: "flour-nutrition-candidate-identity",
    candidate_checksum: "flour-nutrition-candidate-checksum",
  };
  const flourCandidate = {
    ...model.candidate_plan.nutrition_candidates[0]!,
    fingerprint: flourItem.fingerprint,
    ingredient_id: flourIngredientId,
    candidate_identity: flourDecision.candidate_identity,
    candidate_checksum: flourDecision.candidate_checksum,
  };
  model.bundle.approved_items.push(flourItem);
  model.approval.nutrition_decisions.push(flourDecision);
  model.candidate_plan.nutrition_candidates.push(flourCandidate);
  if (label === "seed") {
    model.bundle.measurement_evidence = [];
    model.approval.conversion_decisions = [];
    model.approval.piece_decisions = [];
    model.candidate_plan.conversion_candidates = [];
    model.candidate_plan.piece_candidates = [];
  }
  if (reverseNutritionOrder) {
    model.bundle.approved_items.reverse();
    model.approval.nutrition_decisions.reverse();
    model.candidate_plan.nutrition_candidates.reverse();
  }
  return model;
}

function digestShadowModelInput() {
  const model = structuredClone(modelInput());
  const replaceIngredient = (value: unknown): unknown => {
    if (typeof value === "string") return value.replaceAll(ingredientId, shadowIngredientId);
    if (Array.isArray(value)) return value.map(replaceIngredient);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, replaceIngredient(entry)]),
      );
    }
    return value;
  };
  const isolated = replaceIngredient(model) as ReturnType<typeof modelInput>;
  isolated.run_id = "model-postgres-digest-shadow-0001";
  isolated.idempotency_key = "postgres-digest-shadow-key-0001";
  isolated.source_payload_identity = "postgres-digest-shadow-payload-0001";
  isolated.decision_checksum = "postgres-digest-shadow-decision-0001";
  isolated.content_hash = "postgres-digest-shadow-content-0001";
  isolated.bundle.approved_manifest.dataset = "Stage 3 digest shadow fixture";
  isolated.bundle.approved_manifest.raw_sha256 = "digest-shadow-manifest-sha";
  isolated.bundle.approved_items[0]!.external_name = "보안테스트두부";
  isolated.bundle.measurement_evidence = [];
  isolated.approval.conversion_decisions = [];
  isolated.approval.piece_decisions = [];
  isolated.candidate_plan.conversion_candidates = [];
  isolated.candidate_plan.piece_candidates = [];
  return isolated;
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
      values
        ('${ingredientId}', '두부', '가공식품', 'g'),
        ('${flourIngredientId}', '밀가루', '가공식품', 'g'),
        ('${volumeIngredientId}', '쌀가루', '가공식품', 'g'),
        ('${shadowIngredientId}', '보안테스트두부', '가공식품', 'g');
      insert into public.ingredient_synonyms (ingredient_id, synonym)
      values
        ('${flourIngredientId}', '중력분'),
        ('${volumeIngredientId}', '멥쌀가루');
    `);
  });

  it("never resolves attacker-controlled public.digest from security-definer entry points", () => {
    psql(`
      create role digest_shadow_attacker nologin;
      grant create, usage on schema public to digest_shadow_attacker;
      set role digest_shadow_attacker;
      create table public.digest_shadow_calls (entry_point text not null);
      create function public.digest(value text, algorithm text)
      returns bytea
      language plpgsql
      as $digest_shadow$
      begin
        insert into public.digest_shadow_calls(entry_point) values (current_query());
        return extensions.digest(value, algorithm);
      end;
      $digest_shadow$;
      reset role;
    `);

    try {
      const encoded = encodedJson(digestShadowModelInput());
      expect(JSON.parse(psql(`
        select public.apply_ingredient_nutrition_model(
          convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb
        )::text;
      `))).toMatchObject({ status: "applied", replayed: false });
      expect(JSON.parse(psql(`
        select public.get_ingredient_nutrition_model_run(
          'postgres-digest-shadow-key-0001'
        )::text;
      `))).toMatchObject({ idempotency_key: "postgres-digest-shadow-key-0001" });
      expect(JSON.parse(psql(`
        select public.disable_ingredient_nutrition_model(
          'postgres-digest-shadow-key-0001', 'postgres-digest-shadow-disable-0001',
          '${actorId}', 'digest shadow security test', '2026-07-15T00:00:00.000Z'
        )::text;
      `))).toMatchObject({ replayed: false, revoked_count: 1 });
      expect(psql("select count(*) from public.digest_shadow_calls;")).toBe("0");
    } finally {
      psql(`
        drop function if exists public.digest(text, text);
        drop table if exists public.digest_shadow_calls;
        revoke all on schema public from digest_shadow_attacker;
        drop role if exists digest_shadow_attacker;
      `);
    }
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

  it("rejects volume evidence for another subject while accepting an ingredient synonym", () => {
    psql(`
      insert into public.nutrition_sources (
        id, provider_code, dataset_name, source_kind, source_version, fetched_at,
        freshness_checked_at, freshness_status, priority_rank, source_url,
        license_name, manifest_sha256, review_status, decision_reason,
        reviewed_by, reviewed_at, is_active
      ) values (
        '30000000-0000-4000-8000-000000000010', 'RDA_10_4',
        'Volume subject binding fixture', 'measurement_reference', '2026-07-01',
        now(), now(), 'current', 2, 'https://example.test/volume-binding',
        'test-only', 'volume-binding-manifest', 'approved', 'fixture approval',
        '${actorId}', now(), true
      );
      insert into public.measurement_source_evidence (
        id, source_id, evidence_kind, source_subject, preparation_state,
        source_observed_unit, source_observed_amount, observed_volume_ml,
        observed_weight_g, normalized_g_per_15ml, source_url, source_accessed_at,
        evidence_fingerprint, review_status, decision_reason, reviewed_by,
        reviewed_at, version, is_active
      ) values
        (
          '40000000-0000-4000-8000-000000000010',
          '30000000-0000-4000-8000-000000000010', 'volume_weight', '두부', 'raw',
          '1 tbsp (15mL)', 1, 15, 20, 20, 'https://example.test/volume-binding',
          '2026-07-01', 'volume-binding-mismatch', 'approved', 'fixture approval',
          '${actorId}', now(), 1, true
        ),
        (
          '40000000-0000-4000-8000-000000000011',
          '30000000-0000-4000-8000-000000000010', 'volume_weight', '  중력분  ', 'raw',
          '1 tbsp (15mL)', 1, 15, 20, 20, 'https://example.test/volume-binding',
          '2026-07-01', 'volume-binding-synonym', 'approved', 'fixture approval',
          '${actorId}', now(), 1, true
        );
    `);

    const mismatchedSubject = psqlResult(`
      insert into public.ingredient_conversion_assignments (
        ingredient_id, conversion_profile_id, evidence_id, preparation_state,
        distance_g_per_15ml, candidate_rank, assignment_reason, review_status,
        reviewed_by, reviewed_at, version, is_active
      ) values (
        '${flourIngredientId}', '71000000-0000-4000-8000-000000000020',
        '40000000-0000-4000-8000-000000000010', 'raw', 0, 1,
        'subject mismatch must fail', 'approved', '${actorId}', now(), 1, true
      );
    `);
    expect(mismatchedSubject.status).not.toBe(0);
    expect(mismatchedSubject.stderr).toContain("INVALID_CONVERSION_ASSIGNMENT_CONTEXT");

    psql(`
      insert into public.ingredient_conversion_assignments (
        ingredient_id, conversion_profile_id, evidence_id, preparation_state,
        distance_g_per_15ml, candidate_rank, assignment_reason, review_status,
        reviewed_by, reviewed_at, version, is_active
      ) values (
        '${flourIngredientId}', '71000000-0000-4000-8000-000000000020',
        '40000000-0000-4000-8000-000000000011', 'raw', 0, 1,
        'normalized synonym is valid', 'approved', '${actorId}', now(), 1, true
      );
    `);
    expect(psql(`
      select review_status || ':' || is_active
      from public.ingredient_conversion_assignments
      where evidence_id = '40000000-0000-4000-8000-000000000011';
    `)).toBe("approved:true");
  });

  it("runs apply and disable with pgcrypto isolated in extensions, then replays both", () => {
    expect(psql(`
      select namespace.nspname
      from pg_extension extension
      join pg_namespace namespace on namespace.oid = extension.extnamespace
      where extension.extname = 'pgcrypto';
    `)).toBe("extensions");

    const encoded = encodedJson(modelInput());
    const applied = JSON.parse(psql(`
      select public.apply_ingredient_nutrition_model(
        convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb
      )::text;
    `));
    expect(applied).toMatchObject({ status: "applied", replayed: false });
    expect(applied.writes_committed).toBeGreaterThan(0);
    expect(applied.affected_row_ids.conversion_assignment_ids).toHaveLength(1);
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

    const decisionBEncoded = encodedJson(modelInput("B"));
    const decisionB = JSON.parse(psql(`
      select public.apply_ingredient_nutrition_model(
        convert_from(decode('${decisionBEncoded}', 'base64'), 'UTF8')::jsonb
      )::text;
    `));
    expect(decisionB).toMatchObject({
      status: "applied",
      replayed: false,
      superseded_count: 3,
    });
    expect(decisionB.writes_committed).toBeGreaterThan(0);

    const decisionBReplay = JSON.parse(psql(`
      select public.apply_ingredient_nutrition_model(
        convert_from(decode('${decisionBEncoded}', 'base64'), 'UTF8')::jsonb
      )::text;
    `));
    expect(decisionBReplay).toMatchObject({ replayed: true, writes_committed: 0 });
    expect(JSON.parse(psql(`
      select public.get_ingredient_nutrition_model_run(
        'model-postgres-decision-b-0001'
      )::text;
    `))).toMatchObject({
      run_id: "model-postgres-decision-b-0001",
      idempotency_key: "postgres-apply-key-b-0001",
      registry_checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
      summary: {
        status: "applied",
        affected_source_id: expect.any(String),
      },
    });
    expect(JSON.parse(psql(`
      select jsonb_agg(jsonb_build_object(
        'version', version,
        'review_status', review_status,
        'is_active', is_active
      ) order by version)::text
      from public.ingredient_nutrition_profiles
      where ingredient_id = '${ingredientId}' and preparation_state = 'raw';
    `))).toEqual([
      { version: 1, review_status: "superseded", is_active: false },
      { version: 2, review_status: "approved", is_active: true },
    ]);
    expect(JSON.parse(psql(`
      select jsonb_agg(jsonb_build_object(
        'version', version,
        'review_status', review_status,
        'is_active', is_active
      ) order by version)::text
      from public.ingredient_conversion_assignments
      where ingredient_id = '${volumeIngredientId}' and preparation_state = 'raw';
    `))).toEqual([
      { version: 1, review_status: "superseded", is_active: false },
      { version: 2, review_status: "approved", is_active: true },
    ]);
    expect(JSON.parse(psql(`
      select jsonb_agg(jsonb_build_object(
        'version', version,
        'review_status', review_status,
        'is_active', is_active
      ) order by version)::text
      from public.piece_unit_weights
      where ingredient_id = '${ingredientId}' and preparation_state = 'raw';
    `))).toEqual([
      { version: 1, review_status: "superseded", is_active: false },
      { version: 2, review_status: "approved", is_active: true },
    ]);
    expect(psql(`
      select count(*)
      from public.measurement_source_evidence
      where evidence_fingerprint in ('piece-evidence-checksum', 'volume-evidence-checksum');
    `)).toBe("2");

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
        and metadata_json ->> 'idempotency_key' = 'postgres-apply-key-a-0001';
    `);
    expect(registryPlan).toContain("ingredient_nutrition_run_registry_idempotency_idx");

    const disabled = JSON.parse(psql(`
      select public.disable_ingredient_nutrition_model(
        'postgres-apply-key-b-0001', 'postgres-disable-key-0001', '${actorId}',
        'integration disable', '2026-07-15T00:00:00.000Z'
      )::text;
    `));
    expect(disabled).toMatchObject({ replayed: false, revoked_count: 3, payload_deleted: 0 });
    expect(psql(`
      select review_status || ':' || is_active
      from public.piece_unit_weights
      where version = 2;
    `)).toBe(
      "revoked:false",
    );

    const disableReplay = JSON.parse(psql(`
      select public.disable_ingredient_nutrition_model(
        'postgres-apply-key-b-0001', 'postgres-disable-key-0001', '${actorId}',
        'integration disable', '2026-07-15T00:00:00.000Z'
      )::text;
    `));
    expect(disableReplay).toMatchObject({ replayed: true, writes_committed: 0 });
  }, 30_000);

  it("rejects duplicate and conflicting decision multiplicity before direct SQL writes", () => {
    const outcomes: Array<{ label: string; status: number | null; stderr: string }> = [];
    for (const decisionKind of ["nutrition", "conversion", "piece"] as const) {
      for (const [orderLabel, statuses] of [
        ["same-status", ["rejected", "rejected"]],
        ["approved-rejected", ["approved", "rejected"]],
        ["rejected-approved", ["rejected", "approved"]],
      ] as const) {
        const model = structuredClone(modelInput());
        const label = `${decisionKind}-${orderLabel}`;
        model.run_id = `model-postgres-duplicate-${label}`;
        model.idempotency_key = `postgres-duplicate-key-${label}`;
        model.source_payload_identity = `postgres-duplicate-payload-${label}`;
        model.decision_checksum = `postgres-duplicate-decision-${label}`;
        model.content_hash = `postgres-duplicate-content-${label}`;
        if (decisionKind === "nutrition") {
          const original = model.approval.nutrition_decisions[0]!;
          model.approval.nutrition_decisions = statuses.map((status) => ({
            ...original,
            status,
            reason: `${label} must fail closed`,
          }));
        } else if (decisionKind === "conversion") {
          const original = model.approval.conversion_decisions[0]!;
          model.approval.conversion_decisions = statuses.map((status) => ({
            ...original,
            status,
            reason: `${label} must fail closed`,
          }));
        } else {
          const original = model.approval.piece_decisions[0]!;
          model.approval.piece_decisions = statuses.map((status) => ({
            ...original,
            status,
            reason: `${label} must fail closed`,
          }));
        }
        const encoded = encodedJson(model);
        const result = psqlResult(`
          begin;
          select public.apply_ingredient_nutrition_model(
            convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb
          )::text;
          rollback;
        `);
        outcomes.push({ label, status: result.status, stderr: result.stderr });
      }
    }

    expect(
      outcomes.filter((outcome) => outcome.status === 0).map((outcome) => outcome.label),
      outcomes.map((outcome) => outcome.stderr).join("\n"),
    ).toEqual([]);
    expect(outcomes.every((outcome) => outcome.stderr.includes("INVALID_APPROVAL_FILE"))).toBe(true);

    const missingStatusModel = structuredClone(modelInput());
    missingStatusModel.run_id = "model-postgres-missing-decision-status";
    missingStatusModel.idempotency_key = "postgres-missing-decision-status";
    missingStatusModel.source_payload_identity = "postgres-missing-status-payload";
    missingStatusModel.decision_checksum = "postgres-missing-status-decision";
    missingStatusModel.content_hash = "postgres-missing-status-content";
    delete (missingStatusModel.approval.nutrition_decisions[0] as {
      status?: string;
    }).status;
    const missingStatusEncoded = encodedJson(missingStatusModel);
    const missingStatusResult = psqlResult(`
      begin;
      select public.apply_ingredient_nutrition_model(
        convert_from(decode('${missingStatusEncoded}', 'base64'), 'UTF8')::jsonb
      )::text;
      rollback;
    `);
    expect(missingStatusResult.status).not.toBe(0);
    expect(missingStatusResult.stderr).toContain("INVALID_APPROVAL_FILE");

    expect(psql(`
      select count(*) from public.operational_events
      where metadata_json ->> 'idempotency_key' like 'postgres-duplicate-key-%'
        or metadata_json ->> 'idempotency_key' = 'postgres-missing-decision-status';
    `)).toBe("0");
  }, 30_000);

  it("serializes concurrent approvals by each versioned natural key", async () => {
    const seedEncoded = encodedJson(multiNutritionModelInput("seed"));
    expect(JSON.parse(psql(`
      select public.apply_ingredient_nutrition_model(
        convert_from(decode('${seedEncoded}', 'base64'), 'UTF8')::jsonb
      )::text;
    `))).toMatchObject({ status: "applied", replayed: false });

    psql(`
      create function public.delay_concurrent_nutrition_version_insert()
      returns trigger
      language plpgsql
      as $concurrency_delay$
      begin
        if new.ingredient_id in (
          '${ingredientId}'::uuid,
          '${flourIngredientId}'::uuid,
          '${volumeIngredientId}'::uuid
        ) then
          perform pg_sleep(0.75);
        end if;
        return new;
      end;
      $concurrency_delay$;
      create trigger delay_concurrent_nutrition_link
        before insert on public.ingredient_nutrition_profiles
        for each row execute function public.delay_concurrent_nutrition_version_insert();
      create trigger delay_concurrent_conversion_assignment
        before insert on public.ingredient_conversion_assignments
        for each row execute function public.delay_concurrent_nutrition_version_insert();
      create trigger delay_concurrent_piece_weight
        before insert on public.piece_unit_weights
        for each row execute function public.delay_concurrent_nutrition_version_insert();
    `);

    try {
      const encodedC = encodedJson(multiNutritionModelInput("C"));
      const encodedD = encodedJson(multiNutritionModelInput("D", true));
      const results = await Promise.all([
        psqlAsync(`
          select public.apply_ingredient_nutrition_model(
            convert_from(decode('${encodedC}', 'base64'), 'UTF8')::jsonb
          )::text;
        `),
        psqlAsync(`
          select public.apply_ingredient_nutrition_model(
            convert_from(decode('${encodedD}', 'base64'), 'UTF8')::jsonb
          )::text;
        `),
      ]);

      expect(
        results.map((result) => result.status),
        results.map((result) => result.stderr).join("\n"),
      ).toEqual([0, 0]);
      const summaries = results.map((result) => JSON.parse(
        result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "null",
      ));
      expect(summaries).toEqual(expect.arrayContaining([
        expect.objectContaining({ status: "applied", replayed: false }),
        expect.objectContaining({ status: "applied", replayed: false }),
      ]));

      expect(JSON.parse(psql(`
        select jsonb_agg(jsonb_build_object(
          'ingredient_id', ingredient_id,
          'version', version,
          'review_status', review_status,
          'is_active', is_active
        ) order by ingredient_id, version)::text
        from public.ingredient_nutrition_profiles
        where ingredient_id in ('${ingredientId}', '${flourIngredientId}');
      `))).toEqual([
        { ingredient_id: ingredientId, version: 1, review_status: "superseded", is_active: false },
        { ingredient_id: ingredientId, version: 2, review_status: "revoked", is_active: false },
        { ingredient_id: ingredientId, version: 3, review_status: "superseded", is_active: false },
        { ingredient_id: ingredientId, version: 4, review_status: "superseded", is_active: false },
        { ingredient_id: ingredientId, version: 5, review_status: "approved", is_active: true },
        { ingredient_id: flourIngredientId, version: 1, review_status: "superseded", is_active: false },
        { ingredient_id: flourIngredientId, version: 2, review_status: "superseded", is_active: false },
        { ingredient_id: flourIngredientId, version: 3, review_status: "approved", is_active: true },
      ]);
      for (const [table, targetIngredientId] of [
        ["ingredient_conversion_assignments", volumeIngredientId],
        ["piece_unit_weights", ingredientId],
      ] as const) {
        expect(JSON.parse(psql(`
          select jsonb_agg(jsonb_build_object(
            'version', version,
            'review_status', review_status,
            'is_active', is_active
          ) order by version)::text
          from public.${table}
          where ingredient_id = '${targetIngredientId}';
        `))).toEqual([
          { version: 1, review_status: "superseded", is_active: false },
          { version: 2, review_status: "revoked", is_active: false },
          { version: 3, review_status: "superseded", is_active: false },
          { version: 4, review_status: "approved", is_active: true },
        ]);
      }
    } finally {
      psql(`
        drop trigger if exists delay_concurrent_nutrition_link
          on public.ingredient_nutrition_profiles;
        drop trigger if exists delay_concurrent_conversion_assignment
          on public.ingredient_conversion_assignments;
        drop trigger if exists delay_concurrent_piece_weight
          on public.piece_unit_weights;
        drop function if exists public.delay_concurrent_nutrition_version_insert();
      `);
    }
  }, 30_000);

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
