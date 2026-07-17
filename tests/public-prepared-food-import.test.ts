import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE_URL = pathToFileURL(
  join(process.cwd(), "scripts/lib/public-prepared-food-catalog-import.mjs"),
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
  expect(module[name], `missing prepared-food import behavior: ${name}`).toBeTypeOf("function");
  return module[name] as (...args: never[]) => unknown;
}

function syntheticSnapshot() {
  return {
    source: {
      id: "data-go-kr-15100066",
      provider: "data.go.kr",
      dataset: "전국통합식품영양성분정보(가공식품) 표준데이터",
      source_version: "2026-06-26",
      data_basis_date: "2026-06-26",
      endpoint_or_file_url: "https://www.data.go.kr/data/15100066/standard.do",
      license: "이용허락범위 제한 없음",
      license_url: "https://www.data.go.kr/data/15100066/standard.do",
      license_evidence_url: "https://www.data.go.kr/data/15100066/standard.do",
      license_verified_at: "2026-07-17",
    },
    query: {
      acquisition_mode: "fixture",
      file_name: "synthetic-public-prepared-food-2026-07-17.json",
    },
    pages: [
      {
        page_no: 1,
        total_count: 4,
        items: [
          {
            itemMnftrRptNo: "REPORT-100",
            foodCd: "FOOD-100",
            foodNm: "테스트 두유",
            makerNm: "테스트 제조사",
            saleCorpNm: "테스트 판매원",
            nutConSrtrQua: "100mL",
            servSize: "1회 제공량 190mL",
            foodSize: "총 내용량 190mL",
            enerc: "52",
            chocdf: "4.8",
            prot: "3.1",
            fatce: "2.0",
            nat: "40",
          },
          {
            itemMnftrRptNo: "",
            foodCd: "FOOD-200",
            foodNm: "테스트 그래놀라",
            makerNm: "테스트 제조사",
            importerNm: "테스트 수입원",
            nutConSrtrQua: "100g",
            servSize: "1회 제공량 30g",
            foodSize: "총 내용량 300g",
            enerc: "410",
            chocdf: "62",
            prot: "10",
            fatce: "14",
            nat: "150",
          },
          {
            itemMnftrRptNo: "REPORT-300",
            foodCd: "FOOD-300",
            foodNm: "기준량 불일치 제품",
            makerNm: "테스트 제조사",
            nutConSrtrQua: "1회 제공량 35g",
            enerc: "100",
            chocdf: "10",
            prot: "5",
            fatce: "2",
            nat: "90",
          },
          {
            itemMnftrRptNo: "REPORT-400",
            foodCd: "FOOD-400",
            foodNm: "결측 나트륨 제품",
            makerNm: "테스트 제조사",
            nutConSrtrQua: "100g",
            enerc: "0",
            chocdf: "12",
            prot: "4",
            fatce: "1",
            nat: "",
          },
        ],
      },
    ],
  };
}

function cleanSyntheticSnapshot() {
  const snapshot = syntheticSnapshot();
  return {
    ...snapshot,
    pages: [{
      ...snapshot.pages[0],
      total_count: 2,
      items: snapshot.pages[0].items.slice(0, 2),
    }],
  };
}

function largeSyntheticSnapshot(rowCount = 10_000) {
  const importerRows = Array.from({ length: rowCount }, (_, index) => {
    const suffix = String(index).padStart(5, "0");
    return {
      itemMnftrRptNo: `PILOT-${suffix}`,
      foodCd: `PILOT-CODE-${suffix}`,
      foodNm: `파일럿 제품 ${suffix}`,
      makerNm: `파일럿 제조사 ${String(index % 100).padStart(2, "0")}`,
      saleCorpNm: index % 2 === 0 ? `파일럿 판매원 ${String(index % 50).padStart(2, "0")}` : "",
      nutConSrtrQua: index % 3 === 0 ? "100mL" : "100g",
      servSize: index % 3 === 0 ? "1회 제공량 190mL" : "1회 제공량 30g",
      foodSize: index % 3 === 0 ? "총 내용량 190mL" : "총 내용량 300g",
      enerc: String(50 + (index % 400)),
      chocdf: String((index % 70) + 1),
      prot: String((index % 30) + 1),
      fatce: String((index % 20) + 1),
      nat: String((index % 500) + 1),
    };
  });
  return {
    source: {
      id: "data-go-kr-15100066",
      provider: "data.go.kr",
      dataset: "전국통합식품영양성분정보(가공식품) 표준데이터",
      source_version: "2026-06-26",
      data_basis_date: "2026-06-26",
      endpoint_or_file_url: "https://www.data.go.kr/data/15100066/standard.do",
      license: "이용허락범위 제한 없음",
      license_url: "https://www.data.go.kr/data/15100066/standard.do",
      license_evidence_url: "https://www.data.go.kr/data/15100066/standard.do",
      license_verified_at: "2026-07-17",
    },
    query: {
      acquisition_mode: "fixture",
      file_name: `synthetic-public-prepared-food-${rowCount}.json`,
    },
    pages: [
      {
        page_no: 1,
        total_count: rowCount,
        items: importerRows,
      },
    ],
  };
}

function buildApproval(normalizedBundle: { rows: Array<{ fingerprint: string }> }) {
  return {
    decisions: normalizedBundle.rows.map((row) => ({
      fingerprint: row.fingerprint,
      status: "approved",
    })),
  };
}

describe("public prepared food catalog import", () => {
  it("registers the operator-only package scripts", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

    expect(pkg.scripts).toMatchObject({
      "external:prepared-food:fetch": expect.any(String),
      "external:prepared-food:normalize": expect.any(String),
      "external:prepared-food:review": expect.any(String),
      "external:prepared-food:import": expect.any(String),
      "external:prepared-food:report": expect.any(String),
      "external:prepared-food:disable": expect.any(String),
    });
  });

  it("normalizes stable-key priority, strict 100g/100mL basis, and missing-is-not-zero", async () => {
    const importer = await loadImporter();
    const buildRawBatch = requireFunction(importer, "buildPreparedFoodRawBatch");
    const normalizeBatch = requireFunction(importer, "normalizePreparedFoodCatalogBatch");

    const raw = buildRawBatch({
      ...syntheticSnapshot(),
      fetchedAt: "2026-07-17T00:00:00.000Z",
    } as never) as Record<string, unknown>;
    const normalized = normalizeBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "public-prepared-food-row-v1",
    } as never) as {
      rows: Array<Record<string, unknown>>;
      quarantined: Array<Record<string, unknown>>;
      counts: Record<string, number>;
    };

    expect(normalized.counts.normalized_count).toBe(2);
    expect(normalized.counts.quarantined_count).toBe(2);
    const rowByKey = Object.fromEntries(
      normalized.rows.map((row) => [row.external_item_key, row]),
    ) as Record<string, Record<string, unknown>>;
    expect(rowByKey["item-report:REPORT-100"]).toMatchObject({
      external_item_key: "item-report:REPORT-100",
      external_name: "테스트 두유",
      manufacturer_name: "테스트 제조사",
      distributor_name: "테스트 판매원",
      basis: { amount: 100, unit: "ml", source_text: "100mL" },
    });
    expect(rowByKey["food-code:FOOD-200"]).toMatchObject({
      external_item_key: "food-code:FOOD-200",
      basis: { amount: 100, unit: "g", source_text: "100g" },
      source_serving_text: "1회 제공량 30g",
      source_food_size_text: "총 내용량 300g",
    });
    expect(rowByKey["item-report:REPORT-100"]?.values).toMatchObject({
      energy_kcal: { amount: 52, value_status: "observed" },
      sodium_mg: { amount: 40, value_status: "observed" },
    });
    expect(rowByKey["food-code:FOOD-200"]?.values).toMatchObject({
      energy_kcal: { amount: 410, value_status: "observed" },
      sodium_mg: { amount: 150, value_status: "observed" },
    });
    expect(normalized.quarantined.map((row) => row.reason_code)).toEqual([
      "PRODUCT_BASIS_UNSUPPORTED",
      "PRODUCT_CORE_NUTRIENT_MISSING",
    ]);
  });

  it("keeps a stable key quarantined for every later repeat after one A-B conflict regardless of order", async () => {
    const importer = await loadImporter();
    const buildRawBatch = requireFunction(importer, "buildPreparedFoodRawBatch");
    const normalizeBatch = requireFunction(importer, "normalizePreparedFoodCatalogBatch");

    const conflictingRows = [
      {
        itemMnftrRptNo: "CONFLICT-1",
        foodCd: "FOOD-A",
        foodNm: "동일 키 A",
        makerNm: "제조사 A",
        nutConSrtrQua: "100g",
        enerc: "100",
        chocdf: "10",
        prot: "5",
        fatce: "1",
        nat: "50",
      },
      {
        itemMnftrRptNo: "CONFLICT-1",
        foodCd: "FOOD-B",
        foodNm: "동일 키 B",
        makerNm: "제조사 B",
        nutConSrtrQua: "100g",
        enerc: "101",
        chocdf: "11",
        prot: "6",
        fatce: "2",
        nat: "51",
      },
      {
        itemMnftrRptNo: "CONFLICT-1",
        foodCd: "FOOD-A",
        foodNm: "동일 키 A",
        makerNm: "제조사 A",
        nutConSrtrQua: "100g",
        enerc: "100",
        chocdf: "10",
        prot: "5",
        fatce: "1",
        nat: "50",
      },
    ];
    const buildSnapshot = (items: Array<Record<string, string>>) => ({
      ...cleanSyntheticSnapshot(),
      pages: [{ page_no: 1, total_count: items.length, items }],
    });

    for (const items of [
      conflictingRows,
      [conflictingRows[1]!, conflictingRows[0]!, conflictingRows[2]!],
    ]) {
      const raw = buildRawBatch({
        ...buildSnapshot(items),
        fetchedAt: "2026-07-17T00:00:00.000Z",
      } as never) as { rawSnapshot: unknown; manifest: unknown };
      const normalized = normalizeBatch({
        rawSnapshot: raw.rawSnapshot,
        manifest: raw.manifest,
        adapterSchemaVersion: "public-prepared-food-row-v1",
      } as never) as {
        rows: Array<Record<string, unknown>>;
        quarantined: Array<Record<string, unknown>>;
      };

      expect(normalized.rows).toEqual([]);
      expect(normalized.quarantined).toHaveLength(3);
      expect(normalized.quarantined.every((row) =>
        row.reason_code === "PRODUCT_STABLE_KEY_CONFLICT"
          && row.external_item_key === "item-report:CONFLICT-1")).toBe(true);
    }
  });

  it("rejects manifest dataset/license/schema/checksum drift before promotion", async () => {
    const importer = await loadImporter();
    const buildRawBatch = requireFunction(importer, "buildPreparedFoodRawBatch");
    const normalizeBatch = requireFunction(importer, "normalizePreparedFoodCatalogBatch");
    const buildReview = requireFunction(importer, "buildPreparedFoodCatalogReview");
    const buildImportBundle = requireFunction(importer, "buildPreparedFoodCatalogImportBundle");

    const raw = buildRawBatch({
      ...largeSyntheticSnapshot(10_000),
      fetchedAt: "2026-07-17T00:00:00.000Z",
    } as never) as Record<string, unknown>;
    const normalized = normalizeBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "public-prepared-food-row-v1",
    } as never);
    const review = buildReview({
      normalizedBundle: normalized,
      decisions: buildApproval(normalized as { rows: Array<{ fingerprint: string }> }).decisions,
    } as never);

    expect(() => buildImportBundle({
      manifest: {
        ...(raw.manifest as Record<string, unknown>),
        source_id: "data-go-kr-15199999",
      },
      normalizedBundle: normalized,
      reviewReport: review,
    } as never)).toThrowError(expect.objectContaining({ code: "SOURCE_SCHEMA_DRIFT" }));

    expect(() => buildImportBundle({
      manifest: {
        ...(raw.manifest as Record<string, unknown>),
        license: "확인 중",
      },
      normalizedBundle: normalized,
      reviewReport: review,
    } as never)).toThrowError(expect.objectContaining({ code: "SOURCE_LICENSE_NOT_APPROVED" }));

    expect(() => buildImportBundle({
      manifest: {
        ...(raw.manifest as Record<string, unknown>),
        sha256: "0".repeat(64),
      },
      normalizedBundle: normalized,
      reviewReport: review,
    } as never)).toThrowError(expect.objectContaining({ code: "SOURCE_CHECKSUM_MISMATCH" }));
  });

  it("rejects apply without a pilot checkpoint or a full target fingerprint approval", { timeout: 30_000 }, async () => {
    const importer = await loadImporter();
    const buildRawBatch = requireFunction(importer, "buildPreparedFoodRawBatch");
    const normalizeBatch = requireFunction(importer, "normalizePreparedFoodCatalogBatch");
    const buildReview = requireFunction(importer, "buildPreparedFoodCatalogReview");
    const buildImportBundle = requireFunction(importer, "buildPreparedFoodCatalogImportBundle");
    const createStore = requireFunction(importer, "createMemoryPreparedFoodCatalogImportStore");
    const runImport = requireFunction(importer, "runPreparedFoodCatalogImport");

    const raw = buildRawBatch({
      ...largeSyntheticSnapshot(10_000),
      fetchedAt: "2026-07-17T00:00:00.000Z",
    } as never) as Record<string, unknown>;
    const normalized = normalizeBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "public-prepared-food-row-v1",
    } as never);
    const review = buildReview({
      normalizedBundle: normalized,
      decisions: buildApproval(normalized as { rows: Array<{ fingerprint: string }> }).decisions,
    } as never);
    const bundle = buildImportBundle({
      manifest: raw.manifest,
      normalizedBundle: normalized,
      reviewReport: review,
    } as never) as Record<string, unknown>;

    const store = createStore();
    await expect(runImport({
      bundle: {
        ...bundle,
        approved_manifest: {
          ...(bundle.approved_manifest as Record<string, unknown>),
          query: {
            ...((bundle.approved_manifest as Record<string, unknown>).query as Record<string, unknown>),
            scope: "pilot",
          },
        },
      },
      mode: "apply",
      environment: "local",
      store,
      actor_user_id: "10000000-0000-4000-8000-000000000001",
      run_id: "pilot-without-checkpoint",
      idempotency_key: "pilot-without-checkpoint",
    } as never)).rejects.toMatchObject({ code: "CHECKPOINT_MISMATCH" });

    await expect(runImport({
      bundle: {
        ...bundle,
        approved_manifest: {
          ...(bundle.approved_manifest as Record<string, unknown>),
          query: {
            ...((bundle.approved_manifest as Record<string, unknown>).query as Record<string, unknown>),
            scope: "full",
            approval_checkpoint: {
              scope: "full",
              approved_row_count: 10_000,
              selection_mode: "all-valid",
              valid_row_count: 10_000,
              target_fingerprint: "wrong-target",
              approved_at: "2026-07-17T00:00:00.000Z",
            },
          },
        },
      },
      mode: "apply",
      environment: "local",
      store,
      actor_user_id: "10000000-0000-4000-8000-000000000001",
      run_id: "full-without-target",
      idempotency_key: "full-without-target",
    } as never)).rejects.toMatchObject({ code: "TARGET_FINGERPRINT_MISMATCH" });
  });

  it("rejects a tampered bundle at the JS apply boundary before any write and allows a proven full valid set below 10,000", { timeout: 30_000 }, async () => {
    const importer = await loadImporter();
    const buildRawBatch = requireFunction(importer, "buildPreparedFoodRawBatch");
    const normalizeBatch = requireFunction(importer, "normalizePreparedFoodCatalogBatch");
    const buildReview = requireFunction(importer, "buildPreparedFoodCatalogReview");
    const buildImportBundle = requireFunction(importer, "buildPreparedFoodCatalogImportBundle");
    const createStore = requireFunction(importer, "createMemoryPreparedFoodCatalogImportStore");
    const runImport = requireFunction(importer, "runPreparedFoodCatalogImport");

    const raw = buildRawBatch({
      ...largeSyntheticSnapshot(10_000),
      fetchedAt: "2026-07-17T00:00:00.000Z",
    } as never) as Record<string, unknown>;
    const normalized = normalizeBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "public-prepared-food-row-v1",
    } as never) as { rows: Array<{ fingerprint: string }>; normalized_content_hash: string };
    const review = buildReview({
      normalizedBundle: normalized,
      decisions: buildApproval(normalized).decisions,
    } as never);
    const bundle = buildImportBundle({
      manifest: {
        ...(raw.manifest as Record<string, unknown>),
        query: {
          ...((raw.manifest as Record<string, unknown>).query as Record<string, unknown>),
          scope: "pilot",
          approval_checkpoint: {
            scope: "pilot",
            approved_row_count: 10_000,
            selection_mode: "pilot-min-10000",
            target_fingerprint: normalized.normalized_content_hash,
            approved_at: "2026-07-17T00:00:00.000Z",
          },
        },
      },
      normalizedBundle: normalized,
      reviewReport: review,
    } as never) as Record<string, unknown>;

    const tamperedStore = createStore() as { snapshot: () => Record<string, unknown> };
    await expect(runImport({
      bundle: {
        ...bundle,
        handoff_schema_checksum: "not-the-official-checksum",
      },
      mode: "apply",
      environment: "local",
      store: tamperedStore,
      actor_user_id: "10000000-0000-4000-8000-000000000001",
      run_id: "tampered-js-run",
      idempotency_key: "tampered-js-run",
    } as never)).rejects.toMatchObject({ code: "INVALID_IMPORT_BUNDLE" });
    expect(tamperedStore.snapshot()).toMatchObject({
      active_public_product_count: 0,
      total_product_count: 0,
      total_version_count: 0,
    });

    const smallRaw = buildRawBatch({
      ...cleanSyntheticSnapshot(),
      fetchedAt: "2026-07-17T00:00:00.000Z",
    } as never) as Record<string, unknown>;
    const smallNormalized = normalizeBatch({
      rawSnapshot: smallRaw.rawSnapshot,
      manifest: smallRaw.manifest,
      adapterSchemaVersion: "public-prepared-food-row-v1",
    } as never) as { rows: Array<{ fingerprint: string }>; normalized_content_hash: string };
    const smallReview = buildReview({
      normalizedBundle: smallNormalized,
      decisions: buildApproval(smallNormalized).decisions,
    } as never);
    const smallBundle = buildImportBundle({
      manifest: {
        ...(smallRaw.manifest as Record<string, unknown>),
        query: {
          ...((smallRaw.manifest as Record<string, unknown>).query as Record<string, unknown>),
          scope: "full",
          approval_checkpoint: {
            scope: "full",
            approved_row_count: 2,
            valid_row_count: 2,
            selection_mode: "all-valid",
            target_fingerprint: smallNormalized.normalized_content_hash,
            approved_at: "2026-07-17T00:00:00.000Z",
          },
        },
      },
      normalizedBundle: smallNormalized,
      reviewReport: smallReview,
    } as never);

    const smallStore = createStore();
    const applied = await runImport({
      bundle: smallBundle,
      mode: "apply",
      environment: "local",
      store: smallStore,
      actor_user_id: "10000000-0000-4000-8000-000000000001",
      run_id: "full-valid-set-2",
      idempotency_key: "full-valid-set-2",
    } as never) as Record<string, unknown>;
    expect(applied).toMatchObject({
      status: "applied",
      source_item_count: 2,
      product_count: 2,
    });
  });

  it("builds an approved import bundle, replays identical content at zero writes, versions changed content, and disables without deleting payload history", { timeout: 30_000 }, async () => {
    const importer = await loadImporter();
    const buildRawBatch = requireFunction(importer, "buildPreparedFoodRawBatch");
    const normalizeBatch = requireFunction(importer, "normalizePreparedFoodCatalogBatch");
    const buildReview = requireFunction(importer, "buildPreparedFoodCatalogReview");
    const buildImportBundle = requireFunction(importer, "buildPreparedFoodCatalogImportBundle");
    const createStore = requireFunction(importer, "createMemoryPreparedFoodCatalogImportStore");
    const runImport = requireFunction(importer, "runPreparedFoodCatalogImport");
    const disableImport = requireFunction(importer, "disablePreparedFoodCatalogImport");
    const getRun = requireFunction(importer, "getPreparedFoodCatalogImportRun");

    const raw = buildRawBatch({
      ...largeSyntheticSnapshot(10_000),
      fetchedAt: "2026-07-17T00:00:00.000Z",
    } as never) as Record<string, unknown>;
    const normalized = normalizeBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "public-prepared-food-row-v1",
    } as never) as { rows: Array<{ fingerprint: string }>; normalized_content_hash: string };
    const review = buildReview({
      normalizedBundle: normalized,
      decisions: buildApproval(normalized).decisions,
    } as never);
    const bundle = buildImportBundle({
      manifest: {
        ...(raw.manifest as Record<string, unknown>),
        query: {
          ...((raw.manifest as Record<string, unknown>).query as Record<string, unknown>),
          scope: "pilot",
          approval_checkpoint: {
            scope: "pilot",
            approved_row_count: 10_000,
            selection_mode: "pilot-min-10000",
            target_fingerprint: normalized.normalized_content_hash,
            approved_at: "2026-07-17T00:00:00.000Z",
          },
        },
      },
      normalizedBundle: normalized,
      reviewReport: review,
    } as never);
    const store = createStore();

    const applied = await runImport({
      bundle,
      mode: "apply",
      environment: "local",
      store,
      actor_user_id: "10000000-0000-4000-8000-000000000001",
      run_id: "prepared-food-import-run-0001",
      idempotency_key: "prepared-food-import-key-0001",
    } as never) as Record<string, unknown>;
    expect(applied).toMatchObject({
      status: "applied",
      replayed: false,
      source_item_count: 10_000,
      product_count: 10_000,
    });
    expect(Number(applied.writes_committed)).toBeGreaterThan(0);

    const replay = await runImport({
      bundle,
      mode: "apply",
      environment: "local",
      store,
      actor_user_id: "10000000-0000-4000-8000-000000000001",
      run_id: "prepared-food-import-run-0001",
      idempotency_key: "prepared-food-import-key-0001",
    } as never) as Record<string, unknown>;
    expect(replay).toMatchObject({
      status: "applied",
      replayed: true,
      writes_committed: 0,
    });

    const updatedSnapshot = largeSyntheticSnapshot(10_000);
    updatedSnapshot.pages[0]!.items[0] = {
      ...updatedSnapshot.pages[0]!.items[0],
      enerc: "53",
    };
    const updatedRaw = buildRawBatch({
      ...updatedSnapshot,
      fetchedAt: "2026-07-17T00:00:00.000Z",
    } as never) as Record<string, unknown>;
    const updatedNormalized = normalizeBatch({
      rawSnapshot: updatedRaw.rawSnapshot,
      manifest: updatedRaw.manifest,
      adapterSchemaVersion: "public-prepared-food-row-v1",
    } as never) as { rows: Array<Record<string, unknown>>; normalized_content_hash: string };
    const updatedReview = buildReview({
      normalizedBundle: updatedNormalized,
      decisions: (updatedNormalized as { rows: Array<Record<string, unknown>> }).rows.map((row) => ({
        fingerprint: row.fingerprint,
        status: "approved",
      })),
    } as never);
    const updatedBundle = buildImportBundle({
      manifest: {
        ...(updatedRaw.manifest as Record<string, unknown>),
        query: {
          ...((updatedRaw.manifest as Record<string, unknown>).query as Record<string, unknown>),
          scope: "pilot",
          approval_checkpoint: {
            scope: "pilot",
            approved_row_count: 10_000,
            selection_mode: "pilot-min-10000",
            target_fingerprint: updatedNormalized.normalized_content_hash,
            approved_at: "2026-07-17T00:00:00.000Z",
          },
        },
      },
      normalizedBundle: updatedNormalized,
      reviewReport: updatedReview,
    } as never);
    const updated = await runImport({
      bundle: updatedBundle,
      mode: "apply",
      environment: "local",
      store,
      actor_user_id: "10000000-0000-4000-8000-000000000001",
      run_id: "prepared-food-import-run-0002",
      idempotency_key: "prepared-food-import-key-0002",
    } as never) as Record<string, unknown>;
    expect(updated).toMatchObject({
      status: "applied",
      replayed: false,
      version_updates: 10_000,
    });

    const disabled = await disableImport({
      store,
      model_run_key: "prepared-food-import-key-0002",
      disable_key: "prepared-food-disable-key-0001",
      actor_user_id: "10000000-0000-4000-8000-000000000001",
      reason: "operator rollback",
      reviewed_at: "2026-07-17T01:00:00.000Z",
    } as never) as Record<string, unknown>;
    expect(disabled).toMatchObject({
      replayed: false,
      payload_deleted: 0,
    });

    const reported = getRun({
      store,
      run_identifier: "prepared-food-import-key-0002",
    } as never) as Record<string, unknown> | null;
    expect(reported).toMatchObject({
      idempotency_key: "prepared-food-import-key-0002",
      status: "applied",
    });

    const snapshot = (store as { snapshot: () => Record<string, unknown> }).snapshot();
    expect(snapshot).toMatchObject({
      active_public_product_count: 0,
      total_product_count: 10_000,
      total_version_count: 20_000,
    });
  });

  it("rejects non-local write targets before any store mutation and keeps deterministic performance fixtures", async () => {
    const importer = await loadImporter();
    const runImport = requireFunction(importer, "runPreparedFoodCatalogImport");
    const createStore = requireFunction(importer, "createMemoryPreparedFoodCatalogImportStore");
    const generatePerfRows = requireFunction(importer, "generatePreparedFoodCatalogPerfRows");

    const store = createStore() as { snapshot: () => Record<string, unknown> };
    await expect(runImport({
      bundle: {},
      mode: "apply",
      environment: "staging",
      store,
      actor_user_id: "10000000-0000-4000-8000-000000000001",
      run_id: "prepared-food-import-run-unsafe",
      idempotency_key: "prepared-food-import-key-unsafe",
    } as never)).rejects.toMatchObject({
      code: "PRODUCTION_LOAD_APPROVAL_REQUIRED",
    });
    expect(store.snapshot()).toMatchObject({
      active_public_product_count: 0,
      total_product_count: 0,
      total_version_count: 0,
    });

    const tenThousand = generatePerfRows({
      count: 10_000,
      seed: "perf-10k",
    } as never) as Array<Record<string, unknown>>;
    const hundredThousand = generatePerfRows({
      count: 100_000,
      seed: "perf-100k",
    } as never) as Array<Record<string, unknown>>;
    expect(tenThousand).toHaveLength(10_000);
    expect(hundredThousand).toHaveLength(100_000);
    expect(tenThousand[0]).toMatchObject({
      itemMnftrRptNo: "PERF-10K-000000",
      foodNm: "성능 fixture 제품 000000",
    });
    expect(hundredThousand[99_999]).toMatchObject({
      itemMnftrRptNo: "PERF-100K-099999",
      foodCd: "PERF-CODE-099999",
    });
  });
});
