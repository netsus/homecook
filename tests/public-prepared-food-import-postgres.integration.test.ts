import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_PRODUCT_CATALOG_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_PRODUCT_CATALOG_PGHOST ?? "";
const port = process.env.HOMECOOK_PRODUCT_CATALOG_PGPORT ?? "";
const database = process.env.HOMECOOK_PRODUCT_CATALOG_PGDATABASE ?? "";
const actorId = "10000000-0000-4000-8000-000000000001";
const importSchema = {
  schema_version: "public-prepared-food-catalog-import-v1",
  lifecycle: ["raw", "normalized", "reviewed", "approved_pinned"],
};

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(",")}}`;
  }
  if (value === undefined) return "null";
  return JSON.stringify(value);
}

function sha256(value: unknown) {
  return createHash("sha256").update(
    typeof value === "string" ? value : canonicalStringify(value),
  ).digest("hex");
}

function approvedItemDigest(item: Record<string, unknown>) {
  const nutrientEntries = Object.entries(item.values as Record<string, Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([code, value]) => [
      code,
      value.amount ?? "",
      value.source_nutrient_code ?? "",
      value.source_unit ?? "",
      value.value_status ?? "",
      value.source_token ?? "",
    ].join("\u001f"));
  return sha256([
    item.external_item_key ?? "",
    item.external_name ?? "",
    item.manufacturer_name ?? "",
    item.distributor_name ?? "",
    item.importer_name ?? "",
    (item.basis as Record<string, unknown>).amount ?? "",
    (item.basis as Record<string, unknown>).unit ?? "",
    (item.basis as Record<string, unknown>).source_text ?? "",
    item.label_basis_text ?? "",
    item.source_serving_text ?? "",
    item.source_food_size_text ?? "",
    nutrientEntries.join("\u001e"),
  ].join("\u001d"));
}

function approvedFingerprintChecksum(items: Array<Record<string, unknown>>) {
  return sha256(items.map((item) => approvedItemDigest(item)).sort((left, right) => left.localeCompare(right, "en")).join("\u001e"));
}

function normalizedContentHash(items: Array<Record<string, unknown>>, counts: Record<string, number>) {
  return sha256([
    counts.fetched_raw_count,
    counts.unique_input_count,
    counts.normalized_count,
    counts.deduplicated_identical_count,
    counts.quarantined_count,
    items.map((item) => approvedItemDigest(item)).sort((left, right) => left.localeCompare(right, "en")).join("\u001e"),
  ].join("\u001d"));
}

function sourcePayloadIdentity(manifest: Record<string, unknown>, digest: string) {
  return sha256([
    manifest.provider ?? "",
    manifest.dataset ?? "",
    manifest.source_version ?? "",
    manifest.endpoint_or_file_url ?? "",
    digest,
  ].join("\u001d"));
}

function importContentHash(payloadIdentity: string, digest: string, reviewChecksum: string) {
  return sha256([payloadIdentity, digest, reviewChecksum].join("\u001d"));
}

function psqlResult(sql: string) {
  return spawnSync("psql", [
    "-h", host, "-p", port, "-U", "postgres", "-d", database,
    "-At", "-v", "ON_ERROR_STOP=1",
  ], {
    input: sql,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
  });
}

function psql(sql: string) {
  const result = psqlResult(sql);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function encodedJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function jsonExpression(value: unknown) {
  return `convert_from(decode('${encodedJson(value)}', 'base64'), 'UTF8')::jsonb`;
}

function buildBundle({
  count = 10_000,
  energy = 52,
  scope = "pilot",
  targetFingerprint,
  approvedRowCount = count,
  keyPrefix = "REPORT",
  selectionMode,
  validRowCount = approvedRowCount,
  quarantinedCount = 0,
  sourceUrl = "https://www.data.go.kr/data/15100066/standard.do",
  firstSodiumAmount,
}: {
  count?: number;
  energy?: number;
  scope?: "pilot" | "full";
  targetFingerprint?: string;
  approvedRowCount?: number;
  keyPrefix?: string;
  selectionMode?: "pilot-min-10000" | "all-valid";
  validRowCount?: number;
  quarantinedCount?: number;
  sourceUrl?: string;
  firstSodiumAmount?: number;
} = {}) {
  const approvedItems = Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(5, "0");
    const basisUnit = index % 3 === 0 ? "ml" : "g";
    const basisText = basisUnit === "ml" ? "100mL" : "100g";
    const rowEnergy = index === 0 ? energy : 50 + (index % 400);
    return {
      external_item_key: `item-report:${keyPrefix}-${suffix}`,
      external_name: `테스트 제품 ${suffix}`,
      manufacturer_name: "테스트 제조사",
      distributor_name: index % 2 === 0 ? `테스트 판매원 ${String(index % 50).padStart(2, "0")}` : null,
      importer_name: index % 2 === 1 ? `테스트 수입원 ${String(index % 40).padStart(2, "0")}` : null,
      basis: { amount: 100, unit: basisUnit, source_text: basisText },
      label_basis_text: basisText,
      source_serving_text: basisUnit === "ml" ? "1회 제공량 190mL" : "1회 제공량 30g",
      source_food_size_text: basisUnit === "ml" ? "총 내용량 190mL" : "총 내용량 300g",
      stable_fingerprint: `fingerprint-${energy}-${suffix}`,
      fingerprint: `fingerprint-${energy}-${suffix}`,
      content_hash: `content-hash-${energy}-${suffix}`,
      values: {
        energy_kcal: {
          amount: rowEnergy,
          source_nutrient_code: "enerc",
          source_unit: "kcal",
          value_status: "observed",
          source_token: String(rowEnergy),
        },
        carbohydrate_g: {
          amount: (index % 70) + 1,
          source_nutrient_code: "chocdf",
          source_unit: "g",
          value_status: "observed",
          source_token: String((index % 70) + 1),
        },
        protein_g: {
          amount: (index % 30) + 1,
          source_nutrient_code: "prot",
          source_unit: "g",
          value_status: "observed",
          source_token: String((index % 30) + 1),
        },
        fat_g: {
          amount: (index % 20) + 1,
          source_nutrient_code: "fatce",
          source_unit: "g",
          value_status: "observed",
          source_token: String((index % 20) + 1),
        },
        sodium_mg: {
          amount: index === 0 && firstSodiumAmount !== undefined
            ? firstSodiumAmount
            : (index % 500) + 1,
          source_nutrient_code: "nat",
          source_unit: "mg",
          value_status: "observed",
          source_token: String(
            index === 0 && firstSodiumAmount !== undefined
              ? firstSodiumAmount
              : (index % 500) + 1,
          ),
        },
      },
    };
  });
  for (const item of approvedItems) {
    const digest = approvedItemDigest(item as unknown as Record<string, unknown>);
    item.stable_fingerprint = digest;
    item.fingerprint = digest;
    item.content_hash = digest;
  }
  const counts = {
    fetched_raw_count: count + quarantinedCount,
    unique_input_count: count + quarantinedCount,
    normalized_count: count,
    deduplicated_identical_count: 0,
    quarantined_count: quarantinedCount,
  };
  const recomputedNormalizedContentHash = normalizedContentHash(
    approvedItems as unknown as Array<Record<string, unknown>>,
    counts,
  );
  const resolvedTargetFingerprint = targetFingerprint ?? recomputedNormalizedContentHash;
  const manifest = {
    logical_batch_id: `batch-${energy}`,
    provider: "data.go.kr",
    dataset: "전국통합식품영양성분정보(가공식품) 표준데이터",
    source_id: "data-go-kr-15100066",
    dataset_id: "15100066",
    source_version: "2026-06-26",
    data_basis_date: "2026-06-26",
    endpoint_or_file_url: sourceUrl,
    license: "이용허락범위 제한 없음",
    license_url: "https://www.data.go.kr/data/15100066/standard.do",
    license_evidence_url: "https://www.data.go.kr/data/15100066/standard.do",
    license_verified_at: "2026-07-17",
    raw_sha256: `raw-sha-${energy}-${count}-${quarantinedCount}`,
    schema_fingerprint: "public-prepared-food-row-v1:itemMnftrRptNo,foodCd,foodNm,makerNm,saleCorpNm,importerNm,nutConSrtrQua,servSize,foodSize,enerc,chocdf,prot,fatce,nat",
    pagination_metadata: {
      mode: "fixture",
      page_count: 1,
      total_count: count,
      page_size: count,
    },
    query: {
      acquisition_mode: "fixture",
      file_name: `prepared-food-${count}.json`,
      scope,
      approval_checkpoint: {
        scope,
        approved_row_count: approvedRowCount,
        valid_row_count: validRowCount,
        selection_mode: selectionMode ?? (scope === "pilot" ? "pilot-min-10000" : "all-valid"),
        target_fingerprint: resolvedTargetFingerprint,
        approved_at: "2026-07-17T00:00:00.000Z",
      },
    },
    counts,
  } satisfies Record<string, unknown>;
  const reviewChecksum = approvedFingerprintChecksum(approvedItems as unknown as Array<Record<string, unknown>>);
  const payloadIdentity = sourcePayloadIdentity(manifest, recomputedNormalizedContentHash);
  const contentHash = importContentHash(payloadIdentity, recomputedNormalizedContentHash, reviewChecksum);

  return {
    schema_version: "public-prepared-food-catalog-import-v1",
    handoff_schema_checksum: sha256(importSchema),
    status: "approved_pinned",
    lifecycle: ["raw", "normalized", "reviewed", "approved_pinned"],
    logical_batch_id: `batch-${energy}`,
    source_payload_identity: payloadIdentity,
    approved_manifest: manifest,
    approved_items: approvedItems,
    public_attribution: [{
      provider: "data.go.kr",
      dataset: "전국통합식품영양성분정보(가공식품) 표준데이터",
      source_version: "2026-06-26",
      data_basis_date: "2026-06-26",
      license: "이용허락범위 제한 없음",
      source_url: sourceUrl,
    }],
    approved_fingerprint_checksum: reviewChecksum,
    normalized_content_hash: recomputedNormalizedContentHash,
    review_checksum: reviewChecksum,
    content_hash: contentHash,
    production_db_writes: 0,
  };
}

function explainAnalyze(sql: string) {
  const output = psql(sql);
  const line = output.split("\n").findLast((entry) => entry.includes("Execution Time"));
  expect(line).toBeDefined();
  return Number(line!.replace(/.*Execution Time:\s*/, "").replace(/\s*ms.*/, ""));
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index]!;
}

function seedBenchmarkCatalog(prefix: string, rowCount: number) {
  psql(`
    begin;
    set constraints food_products_current_version_fk deferred;
    insert into public.nutrition_sources (
      id, provider_code, dataset_name, source_kind, source_version, data_basis_date,
      fetched_at, freshness_checked_at, freshness_status, priority_rank, source_url,
      license_name, license_url, manifest_sha256, review_status, decision_reason,
      reviewed_by, reviewed_at, is_active
    ) values (
      ('97000000-0000-4000-8000-' || lpad(length('${prefix}')::text, 12, '0'))::uuid,
      '${prefix}-provider', '${prefix}-dataset', 'nutrition_dataset', '2026-07-17', '2026-07-17',
      now(), now(), 'current', 1, 'https://example.test/${prefix}',
      'test-only', 'https://example.test/license', '${prefix}-manifest',
      'approved', 'benchmark seed', '${actorId}'::uuid, now(), true
    );
    with generated as (
      select
        gs,
        ('97000000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as item_id,
        ('97100000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as profile_id,
        ('97200000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as product_id,
        ('97300000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as version_id,
        'bench-${prefix}-key-' || lpad(gs::text, 6, '0') as external_key,
        '${prefix} prefix 제품 ' || lpad(gs::text, 6, '0') as product_name,
        '${prefix} company 제조사 ' || lpad((gs % 100)::text, 2, '0') as brand_name,
        case when gs % 3 = 0 then 'ml' else 'g' end as basis_unit
      from generate_series(1, ${rowCount}) as gs
    )
    insert into public.nutrition_source_items (
      id, source_id, external_item_key, external_name, source_basis_text,
      source_basis_amount, source_basis_unit, stable_fingerprint,
      review_status, decision_reason, reviewed_by, reviewed_at, provenance_json
    )
    select
      item_id,
      ('97000000-0000-4000-8000-' || lpad(length('${prefix}')::text, 12, '0'))::uuid,
      external_key,
      product_name,
      case when basis_unit = 'ml' then '100mL' else '100g' end,
      100,
      basis_unit,
      external_key || '-fingerprint',
      'approved',
      'benchmark seed',
      '${actorId}'::uuid,
      now(),
      jsonb_build_object('content_hash', external_key || '-content')
    from generated;
    with generated as (
      select
        gs,
        ('97000000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as item_id,
        ('97100000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as profile_id,
        case when gs % 3 = 0 then 'ml' else 'g' end as basis_unit
      from generate_series(1, ${rowCount}) as gs
    )
    insert into public.nutrition_profiles (
      id, source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
      version, review_status, decision_reason, reviewed_by, reviewed_at, is_active
    )
    select
      profile_id, item_id, 'product_label', 'as_labeled', 100, basis_unit,
      1, 'approved', 'benchmark seed', '${actorId}'::uuid, now(), true
    from generated;
    with generated as (
      select
        gs,
        ('97100000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as profile_id
      from generate_series(1, ${rowCount}) as gs
    )
    insert into public.nutrition_values (
      profile_id, nutrient_code, source_nutrient_code, source_unit, amount, value_status, source_token
    )
    select
      profile_id, nutrient_code, source_nutrient_code, source_unit, amount, 'observed', amount::text
    from generated
    cross join lateral (values
      ('energy_kcal', 'enerc', 'kcal', ((generated.gs % 400) + 50)::numeric),
      ('carbohydrate_g', 'chocdf', 'g', ((generated.gs % 70) + 1)::numeric),
      ('protein_g', 'prot', 'g', ((generated.gs % 30) + 1)::numeric),
      ('fat_g', 'fatce', 'g', ((generated.gs % 20) + 1)::numeric),
      ('sodium_mg', 'nat', 'mg', ((generated.gs % 500) + 1)::numeric)
    ) valueset(nutrient_code, source_nutrient_code, source_unit, amount);
    with generated as (
      select
        gs,
        ('97200000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as product_id,
        ('97300000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as version_id,
        'bench-${prefix}-key-' || lpad(gs::text, 6, '0') as external_key,
        '${prefix} prefix 제품 ' || lpad(gs::text, 6, '0') as product_name,
        '${prefix} company 제조사 ' || lpad((gs % 100)::text, 2, '0') as brand_name
      from generate_series(1, ${rowCount}) as gs
    )
    insert into public.food_products (
      id, owner_user_id, visibility, source_type, name, brand, external_product_key,
      current_nutrition_version_id, created_at
    )
    select
      product_id, null, 'public', 'public_dataset', product_name, brand_name,
      external_key, version_id, now() - ((gs % 1000) || ' seconds')::interval
    from generated;
    with generated as (
      select
        gs,
        ('97000000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as item_id,
        ('97100000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as profile_id,
        ('97200000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as product_id,
        ('97300000-0000-4000-8000-' || lpad((100000 + gs + length('${prefix}') * 100000)::text, 12, '0'))::uuid as version_id
      from generate_series(1, ${rowCount}) as gs
    )
    insert into public.food_product_nutrition_versions (
      id, product_id, nutrition_profile_id, version, label_basis_text, basis_relations_json, source_item_id
    )
    select version_id, product_id, profile_id, 1, null, '[]'::jsonb, item_id
    from generated;
    commit;
  `);
}

describe.runIf(enabled)("public prepared food catalog import isolated PostgreSQL integration", () => {
  beforeAll(() => {
    expect(host).not.toBe("");
    expect(port).not.toBe("");
    expect(database).toMatch(/^homecook_[a-z0-9_]+$/);
    psql(`
      insert into public.users (id, nickname, social_provider, social_id) values
        ('${actorId}', 'prepared-food-importer', 'google', 'prepared-food-importer');
    `);
  });

  it("creates operator-only import surfaces on top of the existing prepared-food catalog schema", () => {
    expect(psql(`
      select count(*) from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname in (
          'apply_public_prepared_food_catalog_import',
          'disable_public_prepared_food_catalog_import',
          'get_public_prepared_food_catalog_import_run'
        );
    `)).toBe("3");
  });

  it("rejects partial pilot apply without a locked checkpoint and keeps the current catalog visible", { timeout: 120_000 }, () => {
    const initial = JSON.parse(psql(`
      select public.apply_public_prepared_food_catalog_import(
        ${jsonExpression({
          actor_user_id: actorId,
          run_id: "prepared-food-import-run-pilot",
          idempotency_key: "prepared-food-import-key-pilot",
          bundle: buildBundle({ energy: 51, keyPrefix: "PILOT" }),
        })}
      )::text;
    `));
    expect(initial.product_count).toBe(10_000);

    const partial = psqlResult(`
      select public.apply_public_prepared_food_catalog_import(
        ${jsonExpression({
          actor_user_id: actorId,
          run_id: "prepared-food-import-run-partial",
          idempotency_key: "prepared-food-import-key-partial",
          bundle: (() => {
            const bundle = buildBundle({
              count: 2,
              scope: "pilot",
              approvedRowCount: 2,
              targetFingerprint: "partial-target",
            });
            const queryWithoutCheckpoint: Record<string, unknown> = {
              ...bundle.approved_manifest.query,
            };
            delete queryWithoutCheckpoint.approval_checkpoint;
            return {
              ...bundle,
              approved_manifest: {
                ...bundle.approved_manifest,
                query: queryWithoutCheckpoint,
              },
            };
          })(),
        })}
      )::text;
    `);
    expect(partial.status).not.toBe(0);
    expect(partial.stderr).toContain("CHECKPOINT_MISMATCH");
    expect(psql(`
      set role service_role;
      set request.jwt.claim.role = 'service_role';
      select jsonb_array_length(public.list_food_products('${actorId}', '테스트 제품', null, null, 20) -> 'items')::text;
    `)).toBe("20");
  });

  it("rejects a tampered SQL bundle before any write and allows a proven all-valid full set below 10,000", () => {
    const beforeProducts = psql(`
      select count(*)
      from public.food_products
      where visibility = 'public'
        and external_product_key like 'item-report:SQLTAMPER-%';
    `);
    const tampered = psqlResult(`
      select public.apply_public_prepared_food_catalog_import(
        ${jsonExpression({
          actor_user_id: actorId,
          run_id: "prepared-food-import-run-sql-tamper",
          idempotency_key: "prepared-food-import-key-sql-tamper",
          bundle: {
            ...buildBundle({ count: 2, scope: "full", keyPrefix: "SQLTAMPER" }),
            handoff_schema_checksum: "not-the-official-checksum",
          },
        })}
      )::text;
    `);
    expect(tampered.status).not.toBe(0);
    expect(tampered.stderr).toContain("INVALID_IMPORT_BUNDLE");
    expect(psql(`
      select count(*)
      from public.food_products
      where visibility = 'public'
        and external_product_key like 'item-report:SQLTAMPER-%';
    `)).toBe(beforeProducts);

    const applied = JSON.parse(psql(`
      select public.apply_public_prepared_food_catalog_import(
        ${jsonExpression({
          actor_user_id: actorId,
          run_id: "prepared-food-import-run-full-small",
          idempotency_key: "prepared-food-import-key-full-small",
          bundle: buildBundle({
            count: 2,
            energy: 62,
            scope: "full",
            keyPrefix: "FULLSMALL",
            approvedRowCount: 2,
            validRowCount: 2,
            selectionMode: "all-valid",
          }),
        })}
      )::text;
    `));
    expect(applied).toMatchObject({
      replayed: false,
      source_item_count: 2,
      product_count: 2,
    });
  });

  it("rejects a self-consistent source URL with an authentication query before any write", () => {
    const authQueryKey = ["service", "Key"].join("");
    const rejected = psqlResult(`
      select public.apply_public_prepared_food_catalog_import(
        ${jsonExpression({
          actor_user_id: actorId,
          run_id: "prepared-food-import-run-auth-url",
          idempotency_key: "prepared-food-import-key-auth-url",
          bundle: buildBundle({
            count: 2,
            energy: 63,
            scope: "full",
            keyPrefix: "AUTHURL",
            sourceUrl: `https://www.data.go.kr/data/15100066/standard.do?${authQueryKey}=synthetic-only`,
          }),
        })}
      )::text;
    `);

    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("INVALID_IMPORT_BUNDLE");
    expect(psql(`
      select count(*) from public.food_products
      where external_product_key like 'item-report:AUTHURL-%';
    `)).toBe("0");
  });

  it("rejects a self-consistent negative nutrient amount before any write", () => {
    const rejected = psqlResult(`
      select public.apply_public_prepared_food_catalog_import(
        ${jsonExpression({
          actor_user_id: actorId,
          run_id: "prepared-food-import-run-negative-nutrient",
          idempotency_key: "prepared-food-import-key-negative-nutrient",
          bundle: buildBundle({
            count: 2,
            scope: "full",
            keyPrefix: "NEGATIVE",
            firstSodiumAmount: -1,
          }),
        })}
      )::text;
    `);

    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("INVALID_IMPORT_BUNDLE");
    expect(psql(`
      select count(*) from public.food_products
      where external_product_key like 'item-report:NEGATIVE-%';
    `)).toBe("0");
  });

  it("promotes every approved valid row while preserving nonzero quarantine accounting", () => {
    const stagedBundle = buildBundle({
      count: 2,
      scope: "full",
      keyPrefix: "QUARANTINE",
      quarantinedCount: 3,
    });
    const stagedItems = stagedBundle.approved_items;
    const stagedBundleHeader = { ...stagedBundle } as Record<string, unknown>;
    delete stagedBundleHeader.approved_items;
    const applied = JSON.parse(psql(`
      create temp table homecook_prepared_food_import_items (item jsonb);
      insert into pg_temp.homecook_prepared_food_import_items(item)
      select value from jsonb_array_elements(${jsonExpression(stagedItems)});
      select public.apply_public_prepared_food_catalog_import(
        ${jsonExpression({
          actor_user_id: actorId,
          run_id: "prepared-food-import-run-quarantine",
          idempotency_key: "prepared-food-import-key-quarantine",
          bundle: stagedBundleHeader,
        })}
      )::text;
    `));

    expect(applied).toMatchObject({
      replayed: false,
      source_item_count: 2,
      product_count: 2,
    });
  });

  it("applies an approved bundle once, replays the same idempotency key at zero writes, versions changed content, and disables search visibility without deleting immutable rows", { timeout: 120_000 }, () => {
    const initial = JSON.parse(psql(`
      select public.apply_public_prepared_food_catalog_import(
        ${jsonExpression({
          actor_user_id: actorId,
          run_id: "prepared-food-import-run-0001",
          idempotency_key: "prepared-food-import-key-0001",
          bundle: buildBundle({ energy: 52 }),
        })}
      )::text;
    `));
    expect(initial).toMatchObject({
      replayed: false,
      source_item_count: 10_000,
      product_count: 10_000,
      version_updates: 0,
    });
    expect(Number(initial.writes_committed)).toBeGreaterThan(0);
    expect(psql(`
      select count(*)
      from public.food_products
      where visibility = 'public'
        and external_product_key like 'item-report:REPORT-%';
    `)).toBe("10000");

    const replay = JSON.parse(psql(`
      select public.apply_public_prepared_food_catalog_import(
        ${jsonExpression({
          actor_user_id: actorId,
          run_id: "prepared-food-import-run-0001",
          idempotency_key: "prepared-food-import-key-0001",
          bundle: buildBundle({ energy: 52 }),
        })}
      )::text;
    `));
    expect(replay).toMatchObject({
      replayed: true,
      writes_committed: 0,
    });

    const updated = JSON.parse(psql(`
      select public.apply_public_prepared_food_catalog_import(
        ${jsonExpression({
          actor_user_id: actorId,
          run_id: "prepared-food-import-run-0002",
          idempotency_key: "prepared-food-import-key-0002",
          bundle: buildBundle({ energy: 53 }),
        })}
      )::text;
    `));
    expect(updated).toMatchObject({
      replayed: false,
      version_updates: 10_000,
    });
    expect(psql(`
      select count(*)
      from public.food_product_nutrition_versions version
      join public.food_products product on product.id = version.product_id
      where product.external_product_key = 'item-report:REPORT-00000';
    `)).toBe("2");
    expect(psql(`
      select count(*)
      from public.food_product_nutrition_versions version
      join public.food_products product on product.id = version.product_id
      where product.external_product_key like 'item-report:REPORT-%';
    `)).toBe("20000");

    const listed = JSON.parse(psql(`
      set role service_role;
      set request.jwt.claim.role = 'service_role';
      select public.list_food_products('${actorId}', '테스트', null, null, 20)::text;
    `));
    expect(listed.items).toHaveLength(20);

    const disabled = JSON.parse(psql(`
      select public.disable_public_prepared_food_catalog_import(
        'prepared-food-import-key-0002',
        'prepared-food-disable-key-0001',
        '${actorId}'::uuid,
        'operator rollback',
        '2026-07-17T01:00:00.000Z'::timestamptz
      )::text;
    `));
    expect(disabled).toMatchObject({
      replayed: false,
      payload_deleted: 0,
    });
    expect(psql(`
      select count(*)
      from public.food_products
      where visibility = 'public'
        and external_product_key like 'item-report:REPORT-%';
    `)).toBe("10000");
    expect(psql(`
      select count(*)
      from public.food_product_nutrition_versions version
      join public.food_products product on product.id = version.product_id
      where product.external_product_key like 'item-report:REPORT-%';
    `)).toBe("20000");

    const hidden = JSON.parse(psql(`
      set role service_role;
      set request.jwt.claim.role = 'service_role';
      select public.list_food_products('${actorId}', '테스트', null, null, 20)::text;
    `));
    expect(hidden.items).toEqual([]);

    const registry = JSON.parse(psql(`
      select public.get_public_prepared_food_catalog_import_run('prepared-food-import-key-0002')::text;
    `));
    expect(registry).toMatchObject({
      idempotency_key: "prepared-food-import-key-0002",
      status: "applied",
      source: "public-prepared-food-catalog-import",
    });

    const disableReplay = JSON.parse(psql(`
      select public.disable_public_prepared_food_catalog_import(
        'prepared-food-import-key-0002',
        'prepared-food-disable-key-0001',
        '${actorId}'::uuid,
        'operator rollback',
        '2026-07-17T01:00:00.000Z'::timestamptz
      )::text;
    `));
    expect(disableReplay).toMatchObject({
      replayed: true,
      writes_committed: 0,
    });
  });

  it("keeps the import registry immutable without blocking other operational_events sources", () => {
    psql(`
      insert into public.operational_events (
        id, event_type, severity, source, actor_user_id, message_summary, metadata_json
      ) values (
        '98000000-0000-4000-8000-000000000001',
        'other_event',
        'info',
        'other-source',
        '${actorId}'::uuid,
        'mutable control event',
        '{}'::jsonb
      );
    `);
    expect(psql(`
      with updated as (
        update public.operational_events
        set message_summary = 'changed control event'
        where id = '98000000-0000-4000-8000-000000000001'
        returning message_summary
      )
      select message_summary from updated;
    `)).toBe("changed control event");

    const immutable = psqlResult(`
      with target as (
        select id
        from public.operational_events
        where source = 'public-prepared-food-catalog-import'
        order by created_at asc
        limit 1
      )
      update public.operational_events
      set message_summary = 'changed import event'
      where id = (select id from target);
    `);
    expect(immutable.status).not.toBe(0);
    expect(immutable.stderr).toContain("IMMUTABLE_PUBLIC_PREPARED_FOOD_IMPORT_RUN");
  });

  it("measures 10k and 100k prefix/substring/company/cursor limit-20 search under the 300ms p95 budget", { timeout: 120_000 }, () => {
    const scenarios = [
      { prefix: "perf10k", rowCount: 10_000 },
      { prefix: "perf100k", rowCount: 100_000 },
    ];
    const report = [];

    for (const scenario of scenarios) {
      seedBenchmarkCatalog(scenario.prefix, scenario.rowCount);
      const actorLiteral = `'${actorId}'::uuid`;
      const prefixQuery = `${scenario.prefix} prefix 제품 000`;
      const substringQuery = `제품 000`;
      const companyQuery = `${scenario.prefix} company 제조사 01`;
      const listSql = (query: string) => `
        set role service_role;
        set request.jwt.claim.role = 'service_role';
        explain analyze
        select public.list_food_products(${actorLiteral}, '${query}', null, null, 20)::text;
      `;

      const coldPrefixMs = explainAnalyze(listSql(prefixQuery));
      const warmPrefixMs = Array.from({ length: 8 }, () => explainAnalyze(listSql(prefixQuery)));
      const warmSubstringMs = Array.from({ length: 8 }, () => explainAnalyze(listSql(substringQuery)));
      const warmCompanyMs = Array.from({ length: 8 }, () => explainAnalyze(listSql(companyQuery)));

      const cursorPayload = JSON.parse(psql(`
        set role service_role;
        set request.jwt.claim.role = 'service_role';
        select public.list_food_products(${actorLiteral}, '${prefixQuery}', null, null, 20)::text;
      `));
      const cursor = JSON.parse(Buffer.from(cursorPayload.next_cursor, "base64url").toString("utf8")) as {
        created_at: string;
        id: string;
      };
      const cursorSql = `
        set role service_role;
        set request.jwt.claim.role = 'service_role';
        explain analyze
        select public.list_food_products(
          ${actorLiteral},
          '${prefixQuery}',
          '${cursor.created_at}'::timestamptz,
          '${cursor.id}'::uuid,
          20
        )::text;
      `;
      const warmCursorMs = Array.from({ length: 8 }, () => explainAnalyze(cursorSql));

      const metrics = {
        rowCount: scenario.rowCount,
        coldPrefixMs,
        prefixP95Ms: percentile(warmPrefixMs, 0.95),
        substringP95Ms: percentile(warmSubstringMs, 0.95),
        companyP95Ms: percentile(warmCompanyMs, 0.95),
        cursorP95Ms: percentile(warmCursorMs, 0.95),
      };
      report.push(metrics);
      expect(metrics.prefixP95Ms).toBeLessThan(300);
      expect(metrics.substringP95Ms).toBeLessThan(300);
      expect(metrics.companyP95Ms).toBeLessThan(300);
      expect(metrics.cursorP95Ms).toBeLessThan(300);
    }

    console.warn("public-prepared-food-import-perf", JSON.stringify(report));
  });
});
