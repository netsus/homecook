import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_NUTRITION_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_NUTRITION_PGHOST ?? "";
const port = process.env.HOMECOOK_NUTRITION_PGPORT ?? "";
const database = process.env.HOMECOOK_NUTRITION_PGDATABASE ?? "";

const IMPORT_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/ingredient-nutrition-import.mjs`,
).href;
const COVERAGE_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/ingredient-nutrition-coverage.mjs`,
).href;
const PIPELINE_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/public-nutrition-pipeline.mjs`,
).href;

const actorId = "10000000-0000-4000-8000-000000000011";
const eligibleIngredientId = "20000000-0000-4000-8000-000000000011";
const excludedIngredientId = "20000000-0000-4000-8000-000000000012";
let pipelineHelpers: null | {
  PUBLIC_NUTRITION_HANDOFF_SCHEMA_CHECKSUM: string;
  sha256: (value: unknown) => string;
} = null;

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

function psqlJson(sql: string): Record<string, unknown> | null {
  const output = psql(sql);
  return output === "" ? null : JSON.parse(output);
}

function databaseStore() {
  return {
    findRun(idempotencyKey: string) {
      const encoded = Buffer.from(idempotencyKey, "utf8").toString("base64");
      const result = psqlJson(
        `select coalesce(public.get_ingredient_nutrition_model_run(convert_from(decode('${encoded}', 'base64'), 'UTF8')), 'null'::jsonb)::text;`,
      );
      return result === null ? null : result.summary;
    },
    getRunRegistry(idempotencyKey: string) {
      const encoded = Buffer.from(idempotencyKey, "utf8").toString("base64");
      return psqlJson(
        `select coalesce(public.get_ingredient_nutrition_model_run(convert_from(decode('${encoded}', 'base64'), 'UTF8')), 'null'::jsonb)::text;`,
      );
    },
    async applyModelBundle(model: Record<string, unknown>) {
      const encoded = Buffer.from(JSON.stringify(model), "utf8").toString("base64");
      return psqlJson(
        `select public.apply_ingredient_nutrition_model(convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb)::text;`,
      );
    },
    async disableAppliedModel({
      report,
      decision,
      disable_key: disableKey,
    }: {
      report: Record<string, unknown>;
      decision: Record<string, unknown>;
      disable_key: string;
    }) {
      const encoded = Buffer.from(
        JSON.stringify({ report, decision, disable_key: disableKey }),
        "utf8",
      ).toString("base64");
      return psqlJson(`
with input as (
  select convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb as value
)
select public.disable_ingredient_nutrition_model(
  value -> 'report' ->> 'idempotency_key',
  value ->> 'disable_key',
  (value -> 'decision' ->> 'reviewed_by')::uuid,
  value -> 'decision' ->> 'reason',
  (value -> 'decision' ->> 'reviewed_at')::timestamptz
)::text from input;
`);
    },
    async getCoverageStats({
      inventory_ids: inventoryIds,
      excluded_ingredient_ids: excludedIngredientIds,
    }: {
      inventory_ids: string[];
      excluded_ingredient_ids: string[];
    }) {
      const encoded = Buffer.from(
        JSON.stringify({
          inventory_ids: inventoryIds,
          excluded_ingredient_ids: excludedIngredientIds,
        }),
        "utf8",
      ).toString("base64");
      return psqlJson(`
with input as (
  select convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb as value
),
inventory as (
  select jsonb_array_elements_text(value -> 'inventory_ids') as ingredient_id
  from input
),
excluded as (
  select jsonb_array_elements_text(value -> 'excluded_ingredient_ids') as ingredient_id
  from input
),
qualified_primary_counts as (
  select
    inventory.ingredient_id,
    count(*) filter (
      where link.review_status = 'approved'
        and link.is_active
        and link.is_primary
        and profile.review_status = 'approved'
        and profile.is_active
        and item.review_status = 'approved'
        and source.freshness_status = 'current'
        and source.review_status = 'approved'
        and source.is_active
    ) as active_primary_count
  from inventory
  left join public.ingredient_nutrition_profiles link
    on link.ingredient_id::text = inventory.ingredient_id
  left join public.nutrition_profiles profile
    on profile.id = link.nutrition_profile_id
  left join public.nutrition_source_items item
    on item.id = profile.source_item_id
  left join public.nutrition_sources source
    on source.id = item.source_id
  group by inventory.ingredient_id
)
select json_build_object(
  'denominator_count',
  (select count(*) from inventory),
  'approved_exactly_one_count',
  (
    select count(*)
    from qualified_primary_counts
    where ingredient_id not in (select ingredient_id from excluded)
      and active_primary_count = 1
  ),
  'excluded_count',
  (select count(*) from excluded),
  'eligible_without_profile',
  (
    select count(*)
    from qualified_primary_counts
    where ingredient_id not in (select ingredient_id from excluded)
      and active_primary_count = 0
  ),
  'unclassified',
  (
    select count(*)
    from qualified_primary_counts
    where ingredient_id not in (select ingredient_id from excluded)
      and active_primary_count <> 1
  ),
  'classification_conflict',
  (
    select count(*)
    from qualified_primary_counts
    where ingredient_id in (select ingredient_id from excluded)
      and active_primary_count > 0
  ),
  'multiple_qualified_primary',
  (
    select count(*)
    from qualified_primary_counts
    where ingredient_id not in (select ingredient_id from excluded)
      and active_primary_count > 1
  )
)::text;
`);
    },
  };
}

function buildBundle() {
  const { PUBLIC_NUTRITION_HANDOFF_SCHEMA_CHECKSUM, sha256 } = pipelineHelpers ?? {};
  if (
    typeof PUBLIC_NUTRITION_HANDOFF_SCHEMA_CHECKSUM !== "string" ||
    typeof sha256 !== "function"
  ) {
    throw new Error("pipeline helpers not loaded");
  }
  const approvedItem = {
    external_item_key: "full-coverage-tofu-001",
    external_name: "Stage2 두부",
    business_key: "synthetic:full-coverage-tofu-001",
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
    content_hash: sha256("full-coverage-content-hash-001"),
    fingerprint: "full-coverage-fingerprint-001",
  };

  const counts = {
    fetched_raw_count: 1,
    unique_input_count: 1,
    normalized_count: 1,
    deduplicated_identical_count: 0,
    quarantined_count: 0,
  };
  const normalizedContentHash = sha256({ rows: [approvedItem], quarantined: [], counts });
  const reviewChecksum = sha256("full-coverage-review-001");

  const bundleBase = {
    schema_version: "public-nutrition-handoff-v1",
    handoff_schema_checksum: PUBLIC_NUTRITION_HANDOFF_SCHEMA_CHECKSUM,
    status: "approved_pinned",
    lifecycle: ["raw", "staged", "normalized", "reviewed", "approved_pinned"],
    logical_batch_id: "full-coverage-batch-001",
    approved_manifest: {
      logical_batch_id: "full-coverage-batch-001",
      provider: "MFDS",
      dataset: "Ingredient Full Coverage Fixture",
      source_version: "2026-07-17",
      data_basis_date: "2026-07-17",
      license: "test-only",
      license_url: "https://example.test/license",
      license_evidence_url: "https://example.test/license-evidence",
      license_verified_at: "2026-07-17",
      query: {},
      raw_sha256: "full-coverage-raw-001",
      input_shape: "adapted-row-v1",
      adapter_schema_version: "nutrition-adapter-v1",
      normalized_content_hash: normalizedContentHash,
      review_checksum: reviewChecksum,
      counts,
    },
    approved_items: [approvedItem],
    public_attribution: [{
      provider: "MFDS",
      dataset: "Ingredient Full Coverage Fixture",
      source_version: "2026-07-17",
      data_basis_date: "2026-07-17",
      license: "test-only",
      source_url: "https://example.test/source",
    }],
    measurement_evidence: [],
    normalized_content_hash: normalizedContentHash,
    review_checksum: reviewChecksum,
    production_db_writes: 0,
  };
  return { ...bundleBase, handoff_checksum: sha256(bundleBase) };
}

function buildBundleVariant(options: {
  logical_batch_id: string;
  dataset: string;
  raw_sha256: string;
  external_item_key: string;
  external_name: string;
  fingerprint: string;
  content_hash_seed: string;
}) {
  const { sha256 } = pipelineHelpers ?? {};
  if (typeof sha256 !== "function") {
    throw new Error("pipeline helpers not loaded");
  }
  const base = buildBundle();
  const approvedItem = {
    ...base.approved_items[0],
    external_item_key: options.external_item_key,
    external_name: options.external_name,
    content_hash: sha256(options.content_hash_seed),
    fingerprint: options.fingerprint,
  };
  const counts = {
    fetched_raw_count: 1,
    unique_input_count: 1,
    normalized_count: 1,
    deduplicated_identical_count: 0,
    quarantined_count: 0,
  };
  const normalizedContentHash = sha256({ rows: [approvedItem], quarantined: [], counts });
  const reviewChecksum = base.review_checksum;
  const baseWithoutChecksum = { ...base };
  delete (baseWithoutChecksum as { handoff_checksum?: string }).handoff_checksum;
  const bundleBase = {
    ...baseWithoutChecksum,
    logical_batch_id: options.logical_batch_id,
    approved_manifest: {
      ...base.approved_manifest,
      logical_batch_id: options.logical_batch_id,
      dataset: options.dataset,
      raw_sha256: options.raw_sha256,
      normalized_content_hash: normalizedContentHash,
      review_checksum: reviewChecksum,
      counts,
    },
    approved_items: [approvedItem],
    public_attribution: [{
      provider: "MFDS",
      dataset: options.dataset,
      source_version: "2026-07-17",
      data_basis_date: "2026-07-17",
      license: "test-only",
      source_url: "https://example.test/source",
    }],
    normalized_content_hash: normalizedContentHash,
    review_checksum: reviewChecksum,
  };
  return { ...bundleBase, handoff_checksum: sha256(bundleBase) };
}

describe.skipIf(!enabled)("ingredient nutrition full coverage postgres integration", () => {
  beforeAll(async () => {
    pipelineHelpers = await import(PIPELINE_URL);
  });

  beforeAll(() => {
    expect(host).not.toBe("");
    expect(port).not.toBe("");
    expect(database).not.toBe("");
    psql(`
      insert into public.users (id, nickname, social_provider, social_id)
      values ('${actorId}', 'full-coverage-operator', 'google', 'full-coverage-operator')
      on conflict (id) do nothing;

      insert into public.ingredients (id, standard_name, category, default_unit)
      values
        ('${eligibleIngredientId}', 'Stage2 두부', '가공식품', 'g'),
        ('${excludedIngredientId}', 'Stage2 육수', '기타', 'ml')
      on conflict (id) do nothing;

      insert into public.ingredient_synonyms (ingredient_id, synonym)
      values ('${eligibleIngredientId}', '스테이지2 부침두부')
      on conflict (ingredient_id, synonym) do nothing;
    `);
  });

  it("keeps all-active reports registry-consistent and supports apply-disable replay on real postgres", async () => {
    const { runModelImport, buildRunReport, validateRunReportAgainstRegistry, disableModelRun } =
      await import(IMPORT_URL);
    const { buildInventoryArtifact } = await import(COVERAGE_URL);

    const inventory = buildInventoryArtifact({
      ingredients: [
        {
          ingredient_id: eligibleIngredientId,
          canonical_name: "Stage2 두부",
          category_code: "가공식품",
          category_name: "가공식품",
          default_unit: "g",
          synonyms: ["스테이지2 부침두부"],
        },
        {
          ingredient_id: excludedIngredientId,
          canonical_name: "Stage2 육수",
          category_code: "기타",
          category_name: "기타",
          default_unit: "ml",
          synonyms: [],
        },
      ],
      query_version: "all-active-integration-v1",
    } as never);

    const decision = {
      schema_version: "ingredient-nutrition-decision-v1",
      inventory_checksum: inventory.checksum,
      reviewed_by: actorId,
      reviewed_at: "2026-07-17T15:00:00.000Z",
      decision_reason: "full coverage postgres integration review",
      decisions: [
        {
          ingredient_id: eligibleIngredientId,
          classification: "eligible",
          provider_code: "MFDS",
          external_item_key: "full-coverage-tofu-001",
          source_item_fingerprint: "full-coverage-fingerprint-001",
        },
        {
          ingredient_id: excludedIngredientId,
          classification: "excluded",
          reason_code: "UNBOUNDED_COMPOSITE",
          reviewed_by: actorId,
          reviewed_at: "2026-07-17T15:00:00.000Z",
          reason: "stock base is intentionally non-canonical",
        },
      ],
    };

    const store = databaseStore();
    const summary = await runModelImport({
      bundle: buildBundle(),
      mode: "apply",
      environment: "local",
      pilot_scope: "all-active",
      inventory,
      decision,
      canonical_ingredients: [
        {
          id: eligibleIngredientId,
          normalized_names: ["Stage2 두부", "스테이지2 부침두부"],
          preparation_state: null,
          edible_portion: "edible",
          basis_dimension: null,
        },
        {
          id: excludedIngredientId,
          normalized_names: ["Stage2 육수"],
          preparation_state: null,
          edible_portion: "edible",
          basis_dimension: null,
        },
      ],
      approval: null,
      store,
    } as never) as Record<string, unknown>;

    expect(summary).toMatchObject({
      pilot_scope: "all-active",
      denominator_count: 2,
      approved_exactly_one_count: 1,
      excluded_count: 1,
      writes_committed: expect.any(Number),
      replayed: false,
    });

    const report = buildRunReport(summary as never) as Record<string, unknown>;
    const registry = store.getRunRegistry(summary.idempotency_key as string);
    expect(validateRunReportAgainstRegistry(report as never, registry as never)).toMatchObject({
      idempotency_key: summary.idempotency_key,
      decision_checksum: summary.decision_checksum,
    });

    expect(psql(`
      select json_build_object(
        'active_links',
        count(*) filter (where review_status = 'approved' and is_active),
        'all_links',
        count(*)
      )::text
      from public.ingredient_nutrition_profiles
      where ingredient_id = '${eligibleIngredientId}'::uuid;
    `)).toBe('{"active_links" : 1, "all_links" : 1}');

    const disableDecision = {
      reviewed_by: actorId,
      reviewed_at: "2026-07-17T15:05:00.000Z",
      reason: "full coverage integration disable",
    };

    const disabled = await disableModelRun({
      report,
      store,
      environment: "local",
      decision: disableDecision,
    } as never) as Record<string, unknown>;
    const replay = await disableModelRun({
      report,
      store,
      environment: "local",
      decision: disableDecision,
    } as never) as Record<string, unknown>;

    expect(disabled).toMatchObject({
      mode: "disable",
      writes_committed: expect.any(Number),
      replayed: false,
    });
    expect(replay).toMatchObject({
      idempotency_key: disabled.idempotency_key,
      writes_committed: 0,
      replayed: true,
    });
    expect(psql(`
      select json_build_object(
        'active_links',
        count(*) filter (where is_active),
        'revoked_links',
        count(*) filter (where review_status = 'revoked')
      )::text
      from public.ingredient_nutrition_profiles
      where ingredient_id = '${eligibleIngredientId}'::uuid;
    `)).toBe('{"active_links" : 0, "revoked_links" : 1}');
  });

  it("treats drifted sources or revoked profiles as missing coverage instead of approved links", async () => {
    const { runModelImport } = await import(IMPORT_URL);
    const { buildInventoryArtifact } = await import(COVERAGE_URL);
    const eligibleOnlyIngredientId = "20000000-0000-4000-8000-000000000021";
    const driftedIngredientId = "20000000-0000-4000-8000-000000000022";

    psql(`
      insert into public.ingredients (id, standard_name, category, default_unit)
      values
        ('${eligibleOnlyIngredientId}', 'Stage2 드리프트 두부', '가공식품', 'g'),
        ('${driftedIngredientId}', 'Stage2 소스 드리프트 두부', '가공식품', 'g')
      on conflict (id) do nothing;
    `);

    const inventory = buildInventoryArtifact({
      ingredients: [
        {
          ingredient_id: eligibleOnlyIngredientId,
          canonical_name: "Stage2 드리프트 두부",
          category_code: "가공식품",
          category_name: "가공식품",
          default_unit: "g",
          synonyms: [],
        },
      ],
      query_version: "all-active-integration-v1",
    } as never);

    const store = databaseStore();
    const summary = await runModelImport({
      bundle: buildBundleVariant({
        logical_batch_id: "full-coverage-batch-002",
        dataset: "Ingredient Full Coverage Fixture 2",
        raw_sha256: "full-coverage-raw-002",
        external_item_key: "full-coverage-tofu-002",
        external_name: "Stage2 드리프트 두부",
        fingerprint: "full-coverage-fingerprint-002",
        content_hash_seed: "full-coverage-content-hash-002",
      }),
      mode: "apply",
      environment: "local",
      pilot_scope: "all-active",
      inventory,
      decision: {
        schema_version: "ingredient-nutrition-decision-v1",
        inventory_checksum: inventory.checksum,
        reviewed_by: actorId,
        reviewed_at: "2026-07-17T15:10:00.000Z",
        decision_reason: "coverage drift validation",
        decisions: [{
          ingredient_id: eligibleOnlyIngredientId,
          classification: "eligible",
          provider_code: "MFDS",
          external_item_key: "full-coverage-tofu-002",
          source_item_fingerprint: "full-coverage-fingerprint-002",
        }],
      },
      canonical_ingredients: [{
        id: eligibleOnlyIngredientId,
        normalized_names: ["Stage2 드리프트 두부"],
        preparation_state: null,
        edible_portion: "edible",
        basis_dimension: null,
      }],
      approval: null,
      store,
    } as never) as Record<string, unknown>;

    expect(summary).toMatchObject({
      approved_exactly_one_count: 1,
      eligible_without_profile: 0,
      unclassified: 0,
    });

    const profileId = psql(`
      select profile.id::text
      from public.ingredient_nutrition_profiles link
      join public.nutrition_profiles profile on profile.id = link.nutrition_profile_id
      where link.ingredient_id = '${eligibleOnlyIngredientId}'::uuid
      order by link.created_at desc
      limit 1;
    `);
    psql(`
      update public.nutrition_profiles
      set review_status = 'revoked',
          is_active = false,
          reviewed_at = '2026-07-17T15:11:00.000Z',
          decision_reason = 'test revoke'
      where id = '${profileId}'::uuid;
    `);
    expect(await store.getCoverageStats({
      inventory_ids: [eligibleOnlyIngredientId],
      excluded_ingredient_ids: [],
    })).toMatchObject({
      approved_exactly_one_count: 0,
      eligible_without_profile: 1,
      unclassified: 1,
    });

    const driftInventory = buildInventoryArtifact({
      ingredients: [
        {
          ingredient_id: driftedIngredientId,
          canonical_name: "Stage2 소스 드리프트 두부",
          category_code: "가공식품",
          category_name: "가공식품",
          default_unit: "g",
          synonyms: [],
        },
      ],
      query_version: "all-active-integration-v1",
    } as never);

    await runModelImport({
      bundle: buildBundleVariant({
        logical_batch_id: "full-coverage-batch-003",
        dataset: "Ingredient Full Coverage Fixture 3",
        raw_sha256: "full-coverage-raw-003",
        external_item_key: "full-coverage-tofu-003",
        external_name: "Stage2 소스 드리프트 두부",
        fingerprint: "full-coverage-fingerprint-003",
        content_hash_seed: "full-coverage-content-hash-003",
      }),
      mode: "apply",
      environment: "local",
      pilot_scope: "all-active",
      inventory: driftInventory,
      decision: {
        schema_version: "ingredient-nutrition-decision-v1",
        inventory_checksum: driftInventory.checksum,
        reviewed_by: actorId,
        reviewed_at: "2026-07-17T15:13:00.000Z",
        decision_reason: "source drift validation",
        decisions: [{
          ingredient_id: driftedIngredientId,
          classification: "eligible",
          provider_code: "MFDS",
          external_item_key: "full-coverage-tofu-003",
          source_item_fingerprint: "full-coverage-fingerprint-003",
        }],
      },
      canonical_ingredients: [{
        id: driftedIngredientId,
        normalized_names: ["Stage2 소스 드리프트 두부"],
        preparation_state: null,
        edible_portion: "edible",
        basis_dimension: null,
      }],
      approval: null,
      store,
    } as never);

    const driftSourceId = psql(`
      select source.id::text
      from public.ingredient_nutrition_profiles link
      join public.nutrition_profiles profile on profile.id = link.nutrition_profile_id
      join public.nutrition_source_items item on item.id = profile.source_item_id
      join public.nutrition_sources source on source.id = item.source_id
      where link.ingredient_id = '${driftedIngredientId}'::uuid
      order by link.created_at desc
      limit 1;
    `);
    psql(`
      update public.nutrition_sources
      set freshness_status = 'drifted',
          review_status = 'superseded',
          is_active = false,
          reviewed_at = '2026-07-17T15:14:00.000Z',
          decision_reason = 'test drift'
      where id = '${driftSourceId}'::uuid;
    `);
    expect(await store.getCoverageStats({
      inventory_ids: [driftedIngredientId],
      excluded_ingredient_ids: [],
    })).toMatchObject({
      approved_exactly_one_count: 0,
      eligible_without_profile: 1,
      unclassified: 1,
    });
  });
});
