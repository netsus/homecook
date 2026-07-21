import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const INTEGRATED_MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/integrated-nutrition-source.mjs`,
).href;
const PIPELINE_MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/public-nutrition-pipeline.mjs`,
).href;

async function loadIntegratedModule(): Promise<Record<string, unknown>> {
  try {
    return await import(INTEGRATED_MODULE_URL);
  } catch {
    return {};
  }
}

describe("integrated raw-material nutrition source", () => {
  it("retries retryable provider failures with the shared 15-second request policy", async () => {
    const integratedModule = await loadIntegratedModule();
    expect(integratedModule.fetchIntegratedNutritionBatch).toBeTypeOf("function");
    const fetchIntegratedNutritionBatch = integratedModule.fetchIntegratedNutritionBatch as (
      input: Record<string, unknown>,
    ) => Promise<unknown>;
    const waits: number[] = [];
    const timeoutValues: number[] = [];
    let attempts = 0;

    await fetchIntegratedNutritionBatch({
      apiKey: "do-not-persist-this-key",
      fetchedAt: "2026-07-22T00:00:00.000Z",
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) {
          return {
            ok: false,
            status: 429,
            headers: { get: () => null },
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            response: {
              header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
              body: { items: [], totalCount: "0", pageNo: "1" },
            },
          }),
        };
      },
      sleep: async (ms: number) => {
        waits.push(ms);
      },
      createTimeoutSignal: (ms: number) => {
        timeoutValues.push(ms);
        return AbortSignal.abort();
      },
    });

    expect(attempts).toBe(2);
    expect(waits).toEqual([1_000]);
    expect(timeoutValues).toEqual([15_000, 15_000]);
  });

  it("keeps provider rows immutable while normalizing core and optional nutrients", async () => {
    const integratedModule = await loadIntegratedModule();
    expect(integratedModule.fetchIntegratedNutritionBatch).toBeTypeOf("function");
    const fetchIntegratedNutritionBatch = integratedModule.fetchIntegratedNutritionBatch as (
      input: Record<string, unknown>,
    ) => Promise<{
      manifest: Record<string, unknown>;
      rawSnapshot: { pages: Array<{ items: unknown[] }> };
    }>;
    const sourceRows = [
      {
        foodCd: "R211-TEST-1",
        foodNm: "멸치류_멸치_말린것_대표_평균",
        nutConSrtrQua: "100g",
        enerc: "303",
        prot: "59.3",
        fatce: "6.2",
        chocdf: "0.8",
        nat: "2400",
        sugar: "0",
        fibtg: "",
        fasat: "2.1",
        srcNm: "국립수산과학원(표준수산물성분표)",
        crtrYmd: "2026-01-13",
      },
      {
        foodCd: "R211-TEST-2",
        foodNm: "조개류_모시조개_생것_대표_평균",
        nutConSrtrQua: "100g",
        enerc: "49",
        prot: "8.0",
        fatce: "0.7",
        chocdf: "2.6",
        nat: "320",
        sugar: "0.1",
        fibtg: "0",
        fasat: "0.2",
        srcNm: "국립수산과학원(표준수산물성분표)",
        crtrYmd: "2026-01-13",
      },
    ];
    const requestedUrls: string[] = [];
    const fetchImpl = async (url: URL | string) => {
      requestedUrls.push(String(url));
      const pageNo = Number(new URL(String(url)).searchParams.get("pageNo"));
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          response: {
            header: { resultCode: "00", resultMsg: "NORMAL_SERVICE", type: "json" },
            body: {
              items: [sourceRows[pageNo - 1]],
              totalCount: "2",
              numOfRows: "1",
              pageNo: String(pageNo),
            },
          },
        }),
      };
    };

    const raw = await fetchIntegratedNutritionBatch({
      apiKey: "do-not-persist-this-key",
      fetchedAt: "2026-07-21T00:00:00.000Z",
      pageSize: 1,
      maxPages: 2,
      fetchImpl,
    });

    expect(raw.manifest).toMatchObject({
      provider: "공공데이터포털",
      dataset: "전국통합식품영양성분정보(원재료성식품)표준데이터",
      source_version: "2026-07-01",
      input_shape: "integrated-material-provider-v1",
      fetched_raw_count: 2,
    });
    expect(raw.rawSnapshot.pages.flatMap((page) => page.items)).toEqual(sourceRows);
    expect(JSON.stringify(raw)).not.toContain("do-not-persist-this-key");
    expect(requestedUrls).toHaveLength(2);

    const { normalizeNutritionBatch } = await import(PIPELINE_MODULE_URL);
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });
    expect(normalized.counts).toMatchObject({ normalized_count: 2, quarantined_count: 0 });
    expect(normalized.rows[0].values).toMatchObject({
      energy_kcal: { amount: 303, unit: "kcal" },
      protein_g: { amount: 59.3, unit: "g" },
      sugars_g: { amount: 0, unit: "g" },
      fiber_g: { amount: null, missing_reason: "blank", unit: "g" },
      saturated_fat_g: { amount: 2.1, unit: "g" },
    });
    expect(normalized.production_db_writes).toBe(0);
  });
});
