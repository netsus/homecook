import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const PIPELINE_MODULE = pathToFileURL(
  join(process.cwd(), "scripts/lib/public-nutrition-pipeline.mjs"),
).href;
const CLI_OPTIONS_MODULE = pathToFileURL(
  join(process.cwd(), "scripts/lib/public-nutrition-cli-options.mjs"),
).href;
const FAILURE_FIXTURE = JSON.parse(readFileSync(join(
  process.cwd(),
  "tests/fixtures/public-nutrition-source/failure-scenarios.json",
), "utf8"));

type MutableNutritionFixture = {
  source: {
    provider: string;
    dataset: string;
    endpoint_or_file_url: string;
  };
  query?: Record<string, unknown>;
  pages: Array<{ items: Array<Record<string, unknown>> }>;
};

async function loadPipeline() {
  return import(PIPELINE_MODULE);
}

async function loadCli() {
  return import(CLI_OPTIONS_MODULE);
}

function run(command: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync("pnpm", [`external:nutrition:${command}`, "--", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, DATA_GO_KR_API_KEY: "", ...env },
  });
}

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

function failureBundlePath(result: ReturnType<typeof run>): string {
  const lines = result.stderr.trim().split("\n");
  const report = JSON.parse(lines.at(-1) ?? "{}");
  expect(report).toMatchObject({ success: false, failure_bundle_path: expect.any(String) });
  return report.failure_bundle_path;
}

function readTree(root: string): string {
  if (!existsSync(root)) return "";
  return readdirSync(root).sort().map((name) => {
    const file = join(root, name);
    return statSync(file).isDirectory() ? readTree(file) : readFileSync(file, "utf8");
  }).join("\n");
}

function prepareLifecycle(tempDir: string) {
  const fixtureDir = join(process.cwd(), "tests/fixtures/public-nutrition-source");
  const rawDir = join(tempDir, "raw");
  const normalizedDir = join(tempDir, "normalized");
  const reviewedDir = join(tempDir, "reviewed");
  expect(run("fetch", [
    "--input", join(fixtureDir, "mfds-source-sample.json"),
    "--output-dir", rawDir,
    "--fetched-at", "2026-07-13T00:00:00.000Z",
  ]).status).toBe(0);
  expect(run("normalize", ["--input-dir", rawDir, "--output-dir", normalizedDir]).status).toBe(0);
  const normalized = JSON.parse(readFileSync(join(normalizedDir, "normalized-bundle.json"), "utf8"));
  const decisionsPath = join(tempDir, "decisions.json");
  writeFileSync(decisionsPath, JSON.stringify({
    decisions: normalized.rows.map((row: { fingerprint: string }) => ({
      fingerprint: row.fingerprint,
      status: "approved",
    })),
  }));
  expect(run("review", [
    "--input-dir", normalizedDir,
    "--decisions", decisionsPath,
    "--measurement-evidence", join(fixtureDir, "rda-measurement-limited-evidence.json"),
    "--output-dir", reviewedDir,
  ]).status).toBe(0);
  return { fixtureDir, rawDir, normalizedDir, reviewedDir, decisionsPath };
}

describe("public nutrition source network and CLI", () => {
  it("registers the four operator-only package scripts", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

    expect(pkg.scripts).toMatchObject({
      "external:nutrition:fetch": expect.any(String),
      "external:nutrition:normalize": expect.any(String),
      "external:nutrition:review": expect.any(String),
      "external:nutrition:promote": expect.any(String),
    });
  });

  it("uses 15s timeouts and retries only allowlisted failures with 1/2/4 second backoff", async () => {
    const { requestJsonWithRetry } = await loadPipeline();
    const sleeps: number[] = [];
    const timeouts: number[] = [];
    let attempt = 0;
    const result = await requestJsonWithRetry({
      endpoint: "https://example.test/nutrition",
      query: { pageNo: "1" },
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchImpl: async () => {
        attempt += 1;
        if (attempt === 1) return response({}, 500);
        if (attempt === 2) {
          throw Object.assign(new Error("hidden"), {
            name: FAILURE_FIXTURE.timeout_error_name,
          });
        }
        if (attempt === 3) throw new TypeError("hidden network detail");
        return response({ ok: true });
      },
      sleep: async (ms: number) => { sleeps.push(ms); },
      now: () => 0,
      createTimeoutSignal: (ms: number) => {
        timeouts.push(ms);
        return new AbortController().signal;
      },
    });

    expect(result).toEqual({ ok: true });
    expect(attempt).toBe(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(timeouts).toEqual([15000, 15000, 15000, 15000]);
  });

  it("honors Retry-After with a 30 second cap and fails non-retry 4xx immediately", async () => {
    const { requestJsonWithRetry } = await loadPipeline();
    const sleeps: number[] = [];
    let rateAttempts = 0;
    await requestJsonWithRetry({
      endpoint: "https://example.test/nutrition",
      query: {},
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchImpl: async () => {
        rateAttempts += 1;
        return rateAttempts === 1
          ? response({}, 429, { "Retry-After": "99" })
          : response({ ok: true });
      },
      sleep: async (ms: number) => { sleeps.push(ms); },
      now: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    });
    expect(sleeps).toEqual([30000]);

    let clientAttempts = 0;
    await expect(requestJsonWithRetry({
      endpoint: "https://example.test/nutrition",
      query: {},
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchImpl: async () => {
        clientAttempts += 1;
        return response({}, 400);
      },
      sleep: async () => undefined,
      now: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    })).rejects.toMatchObject({ code: "HTTP_NON_RETRYABLE" });
    expect(clientAttempts).toBe(1);
  });

  it("stops after four 429 attempts and redacts provider/network details", async () => {
    const { requestJsonWithRetry } = await loadPipeline();
    const sleeps: number[] = [];
    let attempts = 0;
    const secret = "<FAKE_TEST_KEY_ONLY>";
    let caught: unknown;
    try {
      await requestJsonWithRetry({
        endpoint: "https://example.test/nutrition",
        query: {},
        apiKey: secret,
        fetchImpl: async () => {
          attempts += 1;
          return response(
            { provider_message: secret },
            FAILURE_FIXTURE.rate_limit.status,
            { "Retry-After": FAILURE_FIXTURE.rate_limit.retry_after },
          );
        },
        sleep: async (ms: number) => { sleeps.push(ms); },
        now: () => 0,
        createTimeoutSignal: () => new AbortController().signal,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "RETRY_EXHAUSTED",
      details: { last_reason_code: "RATE_LIMITED", attempts: 4 },
    });
    expect(JSON.stringify(caught)).not.toContain(secret);
    expect(attempts).toBe(4);
    expect(sleeps).toEqual([1000, 1000, 1000]);
  });

  it("fails closed on malformed JSON, provider errors, and response schema drift", async () => {
    const { fetchMfdsBatch, requestJsonWithRetry } = await loadPipeline();
    await expect(requestJsonWithRetry({
      endpoint: "https://example.test/nutrition",
      query: {},
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchImpl: async () => new Response(FAILURE_FIXTURE.malformed_json, { status: 200 }),
      sleep: async () => undefined,
      now: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    })).rejects.toMatchObject({ code: "MALFORMED_PAYLOAD" });

    for (const payload of [
      FAILURE_FIXTURE.provider_error_payload,
      FAILURE_FIXTURE.schema_drift_payload,
    ]) {
      await expect(fetchMfdsBatch({
        apiKey: "<FAKE_TEST_KEY_ONLY>",
        fetchedAt: "2026-07-13T00:00:00.000Z",
        fetchImpl: async () => response(payload),
        sleep: async () => undefined,
        now: () => 0,
        createTimeoutSignal: () => new AbortController().signal,
      })).rejects.toMatchObject({
        code: payload.response.header.resultCode === "99" ? "PROVIDER_ERROR" : "SCHEMA_DRIFT",
      });
    }
  });

  it("injects serviceKey only at the send boundary and returns no auth query or secret", async () => {
    const { fetchMfdsBatch } = await loadPipeline();
    const sentUrls: string[] = [];
    const result = await fetchMfdsBatch({
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchedAt: "2026-07-13T00:00:00.000Z",
      pageSize: 2,
      fetchImpl: async (url: string) => {
        sentUrls.push(url);
        return response({
          response: {
            header: { resultCode: "00" },
            body: {
              pageNo: 1,
              totalCount: 1,
              items: [{ external_item_key: "MFDS-1" }],
            },
          },
        });
      },
      sleep: async () => undefined,
      now: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    });
    const persisted = JSON.stringify(result);

    expect(sentUrls[0]).toContain("serviceKey=%3CFAKE_TEST_KEY_ONLY%3E");
    expect(persisted).not.toContain("serviceKey");
    expect(persisted).not.toContain("<FAKE_TEST_KEY_ONLY>");
  });

  it("sends only official MFDS filters and pins the bounded query in provenance", async () => {
    const { fetchMfdsBatch } = await loadPipeline();
    let sentUrl = "";
    const result = await fetchMfdsBatch({
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchedAt: "2026-07-15T00:00:00.000Z",
      pageSize: 1,
      maxPages: 1,
      filters: {
        FOOD_NM_KR: "시험 식품",
        ITEM_REPORT_NO: "202600000001",
      },
      fetchImpl: async (url: string) => {
        sentUrl = url;
        return response({ response: {
          header: { resultCode: "00" },
          body: {
            pageNo: 1,
            totalCount: 1,
            items: [{ FOOD_CD: "MFDS-FILTERED-1" }],
          },
        } });
      },
      sleep: async () => undefined,
      now: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    });

    const url = new URL(sentUrl);
    expect(Object.fromEntries(url.searchParams.entries())).toMatchObject({
      FOOD_NM_KR: "시험 식품",
      ITEM_REPORT_NO: "202600000001",
      pageNo: "1",
      numOfRows: "1",
      type: "json",
    });
    expect(result.manifest.query).toEqual({
      FOOD_NM_KR: "시험 식품",
      ITEM_REPORT_NO: "202600000001",
      pageNo_start: "1",
      pageNo_end: "1",
      numOfRows: "1",
      type: "json",
    });
    await expect(fetchMfdsBatch({
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchedAt: "2026-07-15T00:00:00.000Z",
      filters: { unsupported: "value" },
    })).rejects.toMatchObject({ code: "MFDS_FILTER_INVALID" });
  });

  it("maps bounded official MFDS filters at the CLI boundary and rejects unsafe input", async () => {
    const { mfdsLiveOptions } = await loadCli();
    expect(mfdsLiveOptions({
      FOOD_NM_KR: "시험 식품",
      ITEM_REPORT_NO: "202600000001",
      "num-of-rows": "1",
      "max-pages": "1",
    })).toEqual({
      filters: {
        FOOD_NM_KR: "시험 식품",
        ITEM_REPORT_NO: "202600000001",
      },
      pageSize: 1,
      maxPages: 1,
    });
    expect(() => mfdsLiveOptions({ FOOD_NM_KR: "" }))
      .toThrowError(expect.objectContaining({ code: "MFDS_FILTER_INVALID" }));
    expect(() => mfdsLiveOptions({ FOOD_NM_KR: "시험 식품", unsupported: "value" }))
      .toThrowError(expect.objectContaining({ code: "MFDS_FILTER_INVALID" }));
  });

  it("enforces the MFDS live request budget at both CLI and core boundaries", async () => {
    const { mfdsLiveOptions } = await loadCli();
    expect(mfdsLiveOptions({
      FOOD_NM_KR: "시험 식품",
      "num-of-rows": "100",
      "max-pages": "10",
    })).toMatchObject({ pageSize: 100, maxPages: 10 });
    for (const args of [
      { FOOD_NM_KR: "시험 식품", "num-of-rows": "0" },
      { FOOD_NM_KR: "시험 식품", "num-of-rows": "101" },
      { FOOD_NM_KR: "시험 식품", "max-pages": "0" },
      { FOOD_NM_KR: "시험 식품", "max-pages": "11" },
    ]) {
      expect(() => mfdsLiveOptions(args)).toThrowError(
        expect.objectContaining({ code: "CLI_ARGUMENT_INVALID" }),
      );
    }

    const { fetchMfdsBatch } = await loadPipeline();
    let requests = 0;
    const fetchImpl = async () => {
      requests += 1;
      return response({ response: {
        header: { resultCode: "00" },
        body: {
          pageNo: 1,
          totalCount: 1,
          items: [{ FOOD_CD: "MFDS-BUDGET-1" }],
        },
      } });
    };
    for (const options of [
      { pageSize: 0, maxPages: 1 },
      { pageSize: 101, maxPages: 1 },
      { pageSize: 100, maxPages: 0 },
      { pageSize: 100, maxPages: 11 },
    ]) {
      await expect(fetchMfdsBatch({
        apiKey: "<FAKE_TEST_KEY_ONLY>",
        fetchedAt: "2026-07-15T00:00:00.000Z",
        filters: { FOOD_NM_KR: "시험 식품" },
        fetchImpl,
        ...options,
      })).rejects.toMatchObject({ code: "PAGINATION_SCHEMA_INVALID" });
    }
    expect(requests).toBe(0);

    await expect(fetchMfdsBatch({
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchedAt: "2026-07-15T00:00:00.000Z",
      filters: { FOOD_NM_KR: "시험 식품" },
      pageSize: 100,
      maxPages: 10,
      fetchImpl,
    })).resolves.toMatchObject({ manifest: { fetched_raw_count: 1 } });
    expect(requests).toBe(1);
  });

  it("rejects unsupported and blank MFDS CLI filters before any provider request", () => {
    const directory = mkdtempSync(join(tmpdir(), "mfds-cli-filter-boundary-"));
    const env = { DATA_GO_KR_API_KEY: "<FAKE_TEST_KEY_ONLY>" };
    const unsupported = run("fetch", [
      "--live",
      "--FOOD_NM_KR", "시험 식품",
      "--unsupported", "value",
      "--output-dir", join(directory, "unsupported"),
    ], env);
    const blank = run("fetch", [
      "--live",
      "--FOOD_NM_KR", " ",
      "--output-dir", join(directory, "blank"),
    ], env);

    expect(unsupported.status).not.toBe(0);
    expect(`${unsupported.stdout}\n${unsupported.stderr}`).toContain("MFDS_FILTER_INVALID");
    expect(blank.status).not.toBe(0);
    expect(`${blank.stdout}\n${blank.stderr}`).toContain("MFDS_FILTER_INVALID");
    expect(existsSync(join(directory, "unsupported"))).toBe(false);
    expect(existsSync(join(directory, "blank"))).toBe(false);
  });

  it("accepts the direct top-level MFDS header/body envelope", async () => {
    const { fetchMfdsBatch } = await loadPipeline();

    const result = await fetchMfdsBatch({
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchedAt: "2026-07-13T00:00:00.000Z",
      pageSize: 1,
      fetchImpl: async () => response({
        header: { resultCode: "00" },
        body: {
          pageNo: 1,
          totalCount: 1,
          items: [{ FOOD_CD: "MFDS-DIRECT-1" }],
        },
      }),
      sleep: async () => undefined,
      now: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    });

    expect(result.manifest).toMatchObject({
      provider_reported_total: 1,
      fetched_raw_count: 1,
      page_count: 1,
      production_db_writes: 0,
    });
    expect(result.rawSnapshot.pages[0].items).toEqual([
      { FOOD_CD: "MFDS-DIRECT-1" },
    ]);
  });

  it("fails closed when direct and wrapped MFDS envelopes coexist", async () => {
    const { fetchMfdsBatch } = await loadPipeline();

    await expect(fetchMfdsBatch({
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchedAt: "2026-07-13T00:00:00.000Z",
      pageSize: 1,
      fetchImpl: async () => response({
        header: { resultCode: "00" },
        body: {
          pageNo: 1,
          totalCount: 1,
          items: [{ FOOD_CD: "MFDS-DIRECT-1" }],
        },
        response: {
          header: { resultCode: "00" },
          body: {
            pageNo: 1,
            totalCount: 1,
            items: [{ FOOD_CD: "MFDS-WRAPPED-1" }],
          },
        },
      }),
      sleep: async () => undefined,
      now: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    })).rejects.toMatchObject({ code: "SCHEMA_DRIFT" });
  });

  it("sends decoded and already-encoded data.go.kr keys with exactly one URL encoding pass", async () => {
    const { requestJsonWithRetry } = await loadPipeline();
    const cases = [
      { key: "decoded+key/value=", encoded: "decoded%2Bkey%2Fvalue%3D" },
      { key: "encoded%2Bkey%2Fvalue%3D", encoded: "encoded%2Bkey%2Fvalue%3D" },
    ];

    for (const item of cases) {
      let sentUrl = "";
      await requestJsonWithRetry({
        endpoint: "https://example.test/nutrition",
        query: { pageNo: 1 },
        apiKey: item.key,
        fetchImpl: async (url: string) => {
          sentUrl = url;
          return response({ ok: true });
        },
        sleep: async () => undefined,
        now: () => 0,
        createTimeoutSignal: () => new AbortController().signal,
      });
      expect(sentUrl).toContain(`serviceKey=${item.encoded}`);
      expect(sentUrl).not.toContain("serviceKey=encoded%252B");
    }
  });

  it("pins the actual MFDS page range and page size into manifest identity", async () => {
    const { buildRawBatch, fetchMfdsBatch } = await loadPipeline();
    const requests: Array<Record<string, string>> = [];
    const result = await fetchMfdsBatch({
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchedAt: "2026-07-13T00:00:00.000Z",
      pageSize: 37,
      fetchImpl: async (value: string) => {
        const url = new URL(value);
        const pageNo = Number(url.searchParams.get("pageNo"));
        requests.push(Object.fromEntries(url.searchParams.entries()));
        const count = pageNo === 1 ? 37 : 1;
        return response({ response: {
          header: { resultCode: "00" },
          body: {
            pageNo,
            totalCount: 38,
            items: Array.from({ length: count }, (_, index) => ({
              FOOD_CD: `P${pageNo}-${index}`,
            })),
          },
        } });
      },
      sleep: async () => undefined,
      now: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    });

    expect(requests.map(({ pageNo, numOfRows, type }) => ({ pageNo, numOfRows, type }))).toEqual([
      { pageNo: "1", numOfRows: "37", type: "json" },
      { pageNo: "2", numOfRows: "37", type: "json" },
    ]);
    expect(result.manifest.query).toEqual({
      pageNo_start: "1",
      pageNo_end: "2",
      numOfRows: "37",
      type: "json",
    });
    expect(JSON.stringify(result.manifest.query)).not.toContain("serviceKey");

    const fixture = JSON.parse(readFileSync(join(
      process.cwd(),
      "tests/fixtures/public-nutrition-source/mfds-source-sample.json",
    ), "utf8"));
    const one = buildRawBatch({ ...fixture, query: { pageNo_start: 1, pageNo_end: 1, numOfRows: 37, type: "json" }, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const two = buildRawBatch({ ...fixture, query: { pageNo_start: 1, pageNo_end: 1, numOfRows: 38, type: "json" }, fetchedAt: "2026-07-13T00:00:00.000Z" });
    expect(one.manifest.logical_batch_id).not.toBe(two.manifest.logical_batch_id);
  });

  it("fails on an empty intermediate page before issuing another request", async () => {
    const { fetchMfdsBatch } = await loadPipeline();
    let calls = 0;

    await expect(fetchMfdsBatch({
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchedAt: "2026-07-13T00:00:00.000Z",
      fetchImpl: async () => {
        calls += 1;
        if (calls > 1) throw new TypeError("must not request another page");
        return response({ response: {
          header: { resultCode: "00" },
          body: { pageNo: 1, totalCount: 1, items: [] },
        } });
      },
      sleep: async () => undefined,
      now: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    })).rejects.toMatchObject({ code: "PAGINATION_EMPTY_INTERMEDIATE" });
    expect(calls).toBe(1);
  });

  it("preserves successful-page context when the next MFDS page has schema drift", async () => {
    const { fetchMfdsBatch, SOURCE_REGISTRY } = await loadPipeline();
    let calls = 0;
    let caught: unknown;

    try {
      await fetchMfdsBatch({
        apiKey: "<FAKE_TEST_KEY_ONLY>",
        fetchedAt: "2026-07-13T00:00:00.000Z",
        pageSize: 2,
        fetchImpl: async () => {
          calls += 1;
          return calls === 1
            ? response({ response: {
              header: { resultCode: "00" },
              body: { pageNo: 1, totalCount: 2, items: [{ FOOD_CD: "P1" }] },
            } })
            : response({ response: {
              header: { resultCode: "00" },
              body: { pageNo: 2, totalCount: 2 },
            } });
        },
        sleep: async () => undefined,
        now: () => 0,
        createTimeoutSignal: () => new AbortController().signal,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "SCHEMA_DRIFT",
      details: {
        received_page_count: 1,
        received_page_range: { start: 1, end: 1 },
        requested_page_no: 2,
        source_id: "mfds-15127578",
        source_url: SOURCE_REGISTRY["mfds-15127578"].request_endpoint,
        query: { pageNo: "2", numOfRows: "2", type: "json" },
      },
    });
    expect(calls).toBe(2);
    expect(JSON.stringify(caught)).not.toMatch(/serviceKey|apiKey|<FAKE_TEST_KEY_ONLY>/i);
  });

  it("persists live page context in a versioned failure bundle that cannot occupy the requested output", async () => {
    const { fetchMfdsBatch } = await loadPipeline();
    let calls = 0;
    let caught: unknown;
    try {
      await fetchMfdsBatch({
        apiKey: "<FAKE_TEST_KEY_ONLY>",
        fetchedAt: "2026-07-13T00:00:00.000Z",
        pageSize: 2,
        fetchImpl: async () => {
          calls += 1;
          return calls === 1
            ? response({ response: {
              header: { resultCode: "00" },
              body: { pageNo: 1, totalCount: 2, items: [{ FOOD_CD: "P1" }] },
            } })
            : response({ response: {
              header: { resultCode: "00" },
              body: { pageNo: 2, totalCount: 2 },
            } });
        },
        sleep: async () => undefined,
        now: () => 0,
        createTimeoutSignal: () => new AbortController().signal,
      });
    } catch (error) {
      caught = error;
    }

    const failureModulePath = join(process.cwd(), "scripts/lib/public-nutrition-failure.mjs");
    expect(existsSync(failureModulePath)).toBe(true);
    const { persistNutritionFailure } = await import(pathToFileURL(failureModulePath).href);
    const parent = mkdtempSync(join(tmpdir(), "nutrition-live-failure-context-"));
    const requestedOutput = join(parent, "raw");
    const failureDir = await persistNutritionFailure("fetch", {
      "output-dir": requestedOutput,
    }, caught, { secretValues: ["<FAKE_TEST_KEY_ONLY>"] });
    const manifest = JSON.parse(readFileSync(join(failureDir, "failure-manifest.json"), "utf8"));

    expect(existsSync(requestedOutput)).toBe(false);
    expect(failureDir).toMatch(new RegExp(`${requestedOutput.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.failure-`));
    expect(manifest).toMatchObject({
      status: "failed",
      reason_code: "SCHEMA_DRIFT",
      received_context: {
        received_page_count: 1,
        received_page_range: { start: 1, end: 1 },
        requested_page_no: 2,
        query: { pageNo: "2", numOfRows: "2", type: "json" },
      },
    });
    expect(JSON.stringify(manifest)).not.toMatch(/serviceKey|apiKey|<FAKE_TEST_KEY_ONLY>/i);
  });

  it("preserves successful-page context when the next MFDS page exhausts network retries", async () => {
    const { fetchMfdsBatch } = await loadPipeline();
    let calls = 0;
    let caught: unknown;

    try {
      await fetchMfdsBatch({
        apiKey: "<FAKE_TEST_KEY_ONLY>",
        fetchedAt: "2026-07-13T00:00:00.000Z",
        pageSize: 2,
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) {
            return response({ response: {
              header: { resultCode: "00" },
              body: { pageNo: 1, totalCount: 2, items: [{ FOOD_CD: "P1" }] },
            } });
          }
          throw new TypeError("hidden network detail");
        },
        sleep: async () => undefined,
        now: () => 0,
        createTimeoutSignal: () => new AbortController().signal,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "RETRY_EXHAUSTED",
      details: {
        last_reason_code: "NETWORK_ERROR",
        attempts: 4,
        received_page_count: 1,
        received_page_range: { start: 1, end: 1 },
        requested_page_no: 2,
        query: { pageNo: "2", numOfRows: "2", type: "json" },
      },
    });
    expect(calls).toBe(5);
    expect(JSON.stringify(caught)).not.toMatch(/serviceKey|apiKey|<FAKE_TEST_KEY_ONLY>/i);
  });

  it.each([
    ["total drift", [
      { pageNo: 1, totalCount: 2, items: [{ FOOD_CD: "P1" }] },
      { pageNo: 2, totalCount: 3, items: [{ FOOD_CD: "P2" }] },
    ], "PAGINATION_TOTAL_DRIFT", 2],
    ["page sequence", [
      { pageNo: 2, totalCount: 0, items: [] },
    ], "PAGINATION_SCHEMA_INVALID", 1],
    ["duplicate page", [
      { pageNo: 1, totalCount: 2, items: [{ FOOD_CD: "SAME" }] },
      { pageNo: 2, totalCount: 2, items: [{ FOOD_CD: "SAME" }] },
    ], "PAGINATION_LOOP", 2],
  ])("fails fast for live %s with sanitized page context", async (_name, bodies, code, failingPage) => {
    const { fetchMfdsBatch } = await loadPipeline();
    let calls = 0;
    let caught: unknown;
    try {
      await fetchMfdsBatch({
        apiKey: "<FAKE_TEST_KEY_ONLY>",
        fetchedAt: "2026-07-13T00:00:00.000Z",
        pageSize: 1,
        fetchImpl: async () => {
          const body = bodies[calls];
          calls += 1;
          return response({ response: { header: { resultCode: "00" }, body } });
        },
        sleep: async () => undefined,
        now: () => 0,
        createTimeoutSignal: () => new AbortController().signal,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code,
      details: {
        requested_page_no: failingPage,
        source_id: "mfds-15127578",
        query: { pageNo: String(failingPage), numOfRows: "1", type: "json" },
      },
    });
    expect(calls).toBe(failingPage);
    expect(JSON.stringify(caught)).not.toMatch(/serviceKey|apiKey|<FAKE_TEST_KEY_ONLY>/i);
  });

  it("allows a zero-total empty first page and fails explicitly when the page cap is incomplete", async () => {
    const { fetchMfdsBatch } = await loadPipeline();
    const empty = await fetchMfdsBatch({
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchedAt: "2026-07-13T00:00:00.000Z",
      fetchImpl: async () => response({ response: {
        header: { resultCode: "00" },
        body: { pageNo: 1, totalCount: 0, items: [] },
      } }),
      sleep: async () => undefined,
      now: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    });
    expect(empty.manifest).toMatchObject({ provider_reported_total: 0, page_count: 1 });

    let calls = 0;
    await expect(fetchMfdsBatch({
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchedAt: "2026-07-13T00:00:00.000Z",
      pageSize: 1,
      maxPages: 2,
      fetchImpl: async () => {
        calls += 1;
        return response({ response: {
          header: { resultCode: "00" },
          body: { pageNo: calls, totalCount: 3, items: [{ FOOD_CD: `P${calls}` }] },
        } });
      },
      sleep: async () => undefined,
      now: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    })).rejects.toMatchObject({
      code: "PAGINATION_INCOMPLETE",
      details: {
        received_page_count: 2,
        received_page_range: { start: 1, end: 2 },
        requested_page_no: 3,
      },
    });
    expect(calls).toBe(2);
  });

  it("accepts the provider zero-total shape when the items field is omitted", async () => {
    const { fetchMfdsBatch } = await loadPipeline();

    const empty = await fetchMfdsBatch({
      apiKey: "<FAKE_TEST_KEY_ONLY>",
      fetchedAt: "2026-07-17T00:00:00.000Z",
      fetchImpl: async () => response({ response: {
        header: { resultCode: "00" },
        body: { pageNo: 1, totalCount: 0 },
      } }),
      sleep: async () => undefined,
      now: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    });

    expect(empty.manifest).toMatchObject({
      provider_reported_total: 0,
      page_count: 1,
    });
    expect(empty.rawSnapshot.pages[0].items).toEqual([]);
  });

  it.each([null, "", 1])(
    "rejects an omitted items field when totalCount is malformed or non-zero (%s)",
    async (totalCount) => {
      const { fetchMfdsBatch } = await loadPipeline();

      await expect(fetchMfdsBatch({
        apiKey: "<FAKE_TEST_KEY_ONLY>",
        fetchedAt: "2026-07-17T00:00:00.000Z",
        fetchImpl: async () => response({ response: {
          header: { resultCode: "00" },
          body: { pageNo: 1, totalCount },
        } }),
        sleep: async () => undefined,
        now: () => 0,
        createTimeoutSignal: () => new AbortController().signal,
      })).rejects.toMatchObject({ code: "SCHEMA_DRIFT" });
    },
  );

  it.each([
    ["empty intermediate page", [
      { page_no: 1, total_count: 2, next_page_token: "next", items: [] },
    ], "PAGINATION_EMPTY_INTERMEDIATE"],
    ["duplicate page identity", [
      { page_no: 1, total_count: 2, next_page_token: "a", items: [{ external_item_key: "A" }] },
      { page_no: 2, total_count: 2, next_page_token: "b", items: [{ external_item_key: "A" }] },
    ], "PAGINATION_LOOP"],
    ["duplicate page token", [
      { page_no: 1, total_count: 2, next_page_token: "same", items: [{ external_item_key: "A" }] },
      { page_no: 2, total_count: 2, next_page_token: "same", items: [{ external_item_key: "B" }] },
    ], "PAGINATION_LOOP"],
    ["total drift", [
      { page_no: 1, total_count: 2, next_page_token: "a", items: [{ external_item_key: "A" }] },
      { page_no: 2, total_count: 3, next_page_token: null, items: [{ external_item_key: "B" }] },
    ], "PAGINATION_TOTAL_DRIFT"],
    ["partial final page", FAILURE_FIXTURE.partial_pages, "PAGINATION_INCOMPLETE"],
    ["cross-page item key collision", [
      { page_no: 1, total_count: 2, next_page_token: "a", items: [{ external_item_key: "A", value: 1 }] },
      { page_no: 2, total_count: 2, next_page_token: null, items: [{ external_item_key: "A", value: 2 }] },
    ], "PAGINATION_ITEM_KEY_COLLISION"],
  ])("fails closed for %s", async (_name, pages, code) => {
    const { buildRawBatch, SOURCE_REGISTRY } = await loadPipeline();

    expect(() => buildRawBatch({
      source: SOURCE_REGISTRY["mfds-15127578"].manifest_source,
      input_shape: "adapted-row-v1",
      adapter_schema_version: "nutrition-source-row-v1",
      pages,
      fetchedAt: "2026-07-13T00:00:00.000Z",
    })).toThrowError(expect.objectContaining({ code }));
  });

  it("returns a redacted machine-readable missing-key error without attempting live fetch", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "nutrition-missing-key-"));
    const result = run("fetch", ["--live", "--output-dir", outputDir]);
    const combined = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(combined).toContain("MISSING_API_KEY");
    expect(combined).not.toContain("serviceKey");
    expect(combined).not.toContain("DATA_GO_KR_API_KEY=");
  });

  it.each([
    ["RDA 10.4", "rda-10-4-source-sample.json", "농촌진흥청"],
    ["integrated 15100064", "integrated-15100064-source-sample.json", "전국통합식품영양성분정보표준데이터"],
  ])("acquires and normalizes the minimal fake %s file source", (_name, fixtureName, provider) => {
    const tempDir = mkdtempSync(join(tmpdir(), "nutrition-keyless-file-"));
    const rawDir = join(tempDir, "raw");
    const normalizedDir = join(tempDir, "normalized");
    const fixturePath = join(
      process.cwd(),
      "tests/fixtures/public-nutrition-source",
      fixtureName,
    );

    expect(run("fetch", [
      "--input", fixturePath,
      "--output-dir", rawDir,
      "--fetched-at", "2026-07-13T00:00:00.000Z",
    ]).status).toBe(0);
    expect(run("normalize", [
      "--input-dir", rawDir,
      "--output-dir", normalizedDir,
    ]).status).toBe(0);

    const normalized = JSON.parse(
      readFileSync(join(normalizedDir, "normalized-bundle.json"), "utf8"),
    );
    expect(normalized.source.provider).toBe(provider);
    expect(normalized.rows).toHaveLength(1);
    expect(normalized.counts).toMatchObject({ normalized_count: 1, quarantined_count: 0 });
  });

  it("runs raw -> normalized -> reviewed -> approved_pinned deterministically with fake fixtures", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "nutrition-cli-lifecycle-"));
    const rawDir = join(tempDir, "raw");
    const normalizedDir = join(tempDir, "normalized");
    const reviewedDir = join(tempDir, "reviewed");
    const approvedOne = join(tempDir, "approved-one");
    const approvedTwo = join(tempDir, "approved-two");
    const fixtureDir = join(process.cwd(), "tests/fixtures/public-nutrition-source");

    expect(run("fetch", [
      "--input", join(fixtureDir, "mfds-source-sample.json"),
      "--output-dir", rawDir,
      "--fetched-at", "2026-07-13T00:00:00.000Z",
    ]).status).toBe(0);
    expect(run("normalize", ["--input-dir", rawDir, "--output-dir", normalizedDir]).status).toBe(0);

    const normalized = JSON.parse(readFileSync(join(normalizedDir, "normalized-bundle.json"), "utf8"));
    const decisionsPath = join(tempDir, "decisions.json");
    writeFileSync(decisionsPath, JSON.stringify({
      decisions: normalized.rows.map((row: { fingerprint: string }) => ({
        fingerprint: row.fingerprint,
        status: "approved",
      })),
    }));
    expect(run("review", [
      "--input-dir", normalizedDir,
      "--decisions", decisionsPath,
      "--measurement-evidence", join(fixtureDir, "rda-measurement-limited-evidence.json"),
      "--output-dir", reviewedDir,
    ]).status).toBe(0);
    expect(run("promote", ["--input-dir", reviewedDir, "--output-dir", approvedOne]).status).toBe(0);
    expect(run("promote", ["--input-dir", reviewedDir, "--output-dir", approvedTwo]).status).toBe(0);

    const first = readFileSync(join(approvedOne, "approved-promotion-input.json"), "utf8");
    const second = readFileSync(join(approvedTwo, "approved-promotion-input.json"), "utf8");
    const handoff = JSON.parse(readFileSync(join(approvedOne, "handoff-manifest.json"), "utf8"));
    expect(first).toBe(second);
    expect(handoff).toMatchObject({ status: "approved_pinned", production_db_writes: 0 });
    expect(handoff.handoff_checksum).toMatch(/^[a-f0-9]{64}$/);

    expect(run("promote", ["--input-dir", reviewedDir, "--output-dir", approvedOne]).status).toBe(0);
    writeFileSync(join(approvedOne, "approved-promotion-input.json"), "{}\n");
    const immutable = run("promote", ["--input-dir", reviewedDir, "--output-dir", approvedOne]);
    expect(immutable.status).not.toBe(0);
    expect(`${immutable.stdout}\n${immutable.stderr}`).toContain("ARTIFACT_IMMUTABLE");
  }, 20_000);

  it("persists only sanitized reviewed measurement evidence", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "nutrition-review-secret-"));
    const { fixtureDir, normalizedDir, decisionsPath } = prepareLifecycle(join(tempDir, "setup"));
    const evidence = JSON.parse(readFileSync(
      join(fixtureDir, "rda-measurement-limited-evidence.json"),
      "utf8",
    ));
    evidence[0].source_url += "?serviceKey=FAKE_SERVICE_VALUE";
    evidence[0].license_evidence_url += "&access_token=FAKE_ACCESS_VALUE";
    const evidencePath = join(tempDir, "evidence.json");
    writeFileSync(evidencePath, JSON.stringify(evidence));
    const outputDir = join(tempDir, "reviewed");

    const result = run("review", [
      "--input-dir", normalizedDir,
      "--decisions", decisionsPath,
      "--measurement-evidence", evidencePath,
      "--output-dir", outputDir,
    ]);
    expect(result.status).toBe(0);
    expect(readTree(outputDir)).not.toMatch(/serviceKey|apiKey|access_token|FAKE_SERVICE_VALUE|FAKE_ACCESS_VALUE/i);
    const reviewed = JSON.parse(readFileSync(join(outputDir, "review-report.json"), "utf8"));
    const persistedEvidence = JSON.parse(readFileSync(join(outputDir, "measurement-evidence.json"), "utf8"));
    expect(persistedEvidence).toEqual(reviewed.measurement_evidence);
  });

  it("rejects auth-shaped values anywhere in the complete artifact set before publishing", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "nutrition-artifact-secret-"));
    const fixture = JSON.parse(readFileSync(join(
      process.cwd(),
      "tests/fixtures/public-nutrition-source/mfds-source-sample.json",
    ), "utf8"));
    fixture.pages[0].items[0].apiKey = "FAKE_API_VALUE";
    fixture.pages[0].items[0].access_token = "FAKE_ACCESS_VALUE";
    const inputPath = join(tempDir, "input.json");
    const outputDir = join(tempDir, "raw");
    writeFileSync(inputPath, JSON.stringify(fixture));

    const result = run("fetch", [
      "--input", inputPath,
      "--output-dir", outputDir,
      "--fetched-at", "2026-07-13T00:00:00.000Z",
    ]);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}\n${readTree(outputDir)}`).not.toMatch(
      /apiKey|access_token|FAKE_API_VALUE|FAKE_ACCESS_VALUE/i,
    );
  });

  it("rejects raw, decoded, encoded, and percent-escaped auth secrets in non-live artifacts", () => {
    const secret = "REVIEW_FAKE_KEY_123+value=";
    const encoded = encodeURIComponent(secret);
    const doubleEncoded = encodeURIComponent(encoded);
    const fixturePath = join(
      process.cwd(),
      "tests/fixtures/public-nutrition-source/mfds-source-sample.json",
    );
    const cases = [
      ["provider raw", secret, (input: MutableNutritionFixture) => { input.source.provider = secret; }],
      ["dataset encoded", secret, (input: MutableNutritionFixture) => { input.source.dataset = encoded; }],
      ["decoded from encoded env", encoded, (input: MutableNutritionFixture) => { input.source.provider = secret; }],
      ["source URL encoded", secret, (input: MutableNutritionFixture) => {
        input.source.endpoint_or_file_url += `?note=${encoded}`;
      }],
      ["query encoded", secret, (input: MutableNutritionFixture) => { input.query = { note: encoded }; }],
      ["nested row encoded", secret, (input: MutableNutritionFixture) => {
        input.pages[0].items[0].nested = { token: doubleEncoded };
      }],
      ["percent-escaped auth marker", secret, (input: MutableNutritionFixture) => {
        input.pages[0].items[0].note = `service%4Bey%3D${encoded}`;
      }],
    ] as const;

    for (const [name, envSecret, mutate] of cases) {
      const tempDir = mkdtempSync(join(tmpdir(), `nutrition-non-live-secret-${name.replaceAll(" ", "-")}-`));
      const input = JSON.parse(readFileSync(fixturePath, "utf8")) as MutableNutritionFixture;
      mutate(input);
      const inputPath = join(tempDir, "input.json");
      const outputDir = join(tempDir, "raw");
      writeFileSync(inputPath, JSON.stringify(input));

      const result = run("fetch", [
        "--input", inputPath,
        "--output-dir", outputDir,
        "--fetched-at", "2026-07-13T00:00:00.000Z",
      ], { DATA_GO_KR_API_KEY: envSecret });
      expect(result.status, name).not.toBe(0);
      expect(existsSync(outputDir), name).toBe(false);
      const failureDir = failureBundlePath(result);
      expect(`${result.stdout}\n${result.stderr}\n${readTree(failureDir)}`, name)
        .not.toMatch(new RegExp([secret, encoded, doubleEncoded, "service%4Bey"].join("|"), "i"));
    }
  }, 20_000);

  it("redacts encoded runtime secrets from non-live failure context and persisted failure bundles", () => {
    const secret = "REVIEW_FAKE_KEY_123+value=";
    const encoded = encodeURIComponent(secret);
    const doubleEncoded = encodeURIComponent(encoded);
    const tempDir = mkdtempSync(join(tmpdir(), "nutrition-failure-secret-equivalent-"));
    const input = JSON.parse(readFileSync(join(
      process.cwd(),
      "tests/fixtures/public-nutrition-source/mfds-source-sample.json",
    ), "utf8"));
    input.query = { note: encoded };
    input.pages = FAILURE_FIXTURE.partial_pages;
    const inputPath = join(tempDir, "input.json");
    const outputDir = join(tempDir, "failed");
    writeFileSync(inputPath, JSON.stringify(input));

    const result = run("fetch", [
      "--input", inputPath,
      "--output-dir", outputDir,
      "--fetched-at", "2026-07-13T00:00:00.000Z",
    ], { DATA_GO_KR_API_KEY: secret });
    expect(result.status).not.toBe(0);
    const failureDir = failureBundlePath(result);
    expect(`${result.stdout}\n${result.stderr}\n${readTree(failureDir)}`)
      .not.toMatch(new RegExp([secret, encoded, doubleEncoded].join("|"), "i"));
  });

  it("preflights every target so late collisions leave no consumable partial bundle", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "nutrition-collision-"));
    const lifecycle = prepareLifecycle(join(tempDir, "setup"));
    const commands = [
      ["fetch", ["--input", join(lifecycle.fixtureDir, "mfds-source-sample.json"), "--fetched-at", "2026-07-13T00:00:00.000Z"]],
      ["normalize", ["--input-dir", lifecycle.rawDir]],
      ["review", ["--input-dir", lifecycle.normalizedDir, "--decisions", lifecycle.decisionsPath, "--measurement-evidence", join(lifecycle.fixtureDir, "rda-measurement-limited-evidence.json")]],
      ["promote", ["--input-dir", lifecycle.reviewedDir]],
    ] as const;

    for (const [name, args] of commands) {
      const outputDir = join(tempDir, `collision-${name}`);
      mkdirSync(outputDir);
      writeFileSync(join(outputDir, "summary.json"), "{\"late\":true}\n");
      const result = run(name, [...args, "--output-dir", outputDir]);
      expect(result.status).not.toBe(0);
      expect(readdirSync(outputDir)).toEqual(["summary.json"]);
      expect(readFileSync(join(outputDir, "summary.json"), "utf8")).toBe("{\"late\":true}\n");
    }

    const promoteDir = join(tempDir, "promote-late-handoff");
    mkdirSync(promoteDir);
    writeFileSync(join(promoteDir, "handoff-manifest.json"), "{\"late\":true}\n");
    const promote = run("promote", ["--input-dir", lifecycle.reviewedDir, "--output-dir", promoteDir]);
    expect(promote.status).not.toBe(0);
    expect(readdirSync(promoteDir)).toEqual(["handoff-manifest.json"]);
    expect(existsSync(join(promoteDir, "approved-promotion-input.json"))).toBe(false);
  }, 20_000);

  it("removes the temporary sibling when an injected later write fails", async () => {
    const modulePath = join(process.cwd(), "scripts/lib/public-nutrition-artifacts.mjs");
    expect(existsSync(modulePath)).toBe(true);
    const { publishArtifactBundle } = await import(pathToFileURL(modulePath).href);
    const parent = mkdtempSync(join(tmpdir(), "nutrition-write-failure-"));
    const outputDir = join(parent, "bundle");
    let writes = 0;

    await expect(publishArtifactBundle(outputDir, {
      "first.json": "{}\n",
      "second.json": "{}\n",
    }, {
      writeFileImpl: async (...args: unknown[]) => {
        writes += 1;
        if (writes === 2) throw new Error("injected write failure");
        const { writeFile } = await import("node:fs/promises");
        return writeFile(...(args as Parameters<typeof writeFile>));
      },
    })).rejects.toThrow("injected write failure");
    expect(existsSync(outputDir)).toBe(false);
    expect(readdirSync(parent)).toEqual([]);
  });

  it("forbids nested artifact paths and never replaces a concurrently-created output", async () => {
    const { publishArtifactBundle } = await import(pathToFileURL(
      join(process.cwd(), "scripts/lib/public-nutrition-artifacts.mjs"),
    ).href);
    const nestedParent = mkdtempSync(join(tmpdir(), "nutrition-nested-artifact-"));
    await expect(publishArtifactBundle(join(nestedParent, "bundle"), {
      "nested/value.json": "{}\n",
    })).rejects.toMatchObject({ code: "ARTIFACT_PATH_INVALID" });
    expect(readdirSync(nestedParent)).toEqual([]);

    const raceParent = mkdtempSync(join(tmpdir(), "nutrition-publish-race-"));
    const outputDir = join(raceParent, "bundle");
    await expect(publishArtifactBundle(outputDir, { "value.json": "{}\n" }, {
      publishPointerImpl: async (...args: unknown[]) => {
        mkdirSync(outputDir);
        const { symlink } = await import("node:fs/promises");
        return symlink(...(args as Parameters<typeof symlink>));
      },
    })).rejects.toMatchObject({ code: "EEXIST" });
    expect(readdirSync(outputDir)).toEqual([]);
    expect(readdirSync(raceParent)).toEqual(["bundle"]);
  });

  it("atomically persists fatal fetch, normalize, and review failure bundles", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "nutrition-failure-lifecycle-"));
    const fixtureDir = join(process.cwd(), "tests/fixtures/public-nutrition-source");
    const base = JSON.parse(readFileSync(join(fixtureDir, "mfds-source-sample.json"), "utf8"));
    base.pages = FAILURE_FIXTURE.partial_pages;
    const partialPath = join(tempDir, "partial.json");
    writeFileSync(partialPath, JSON.stringify(base));
    const failedFetchDir = join(tempDir, "failed-fetch");
    const failedFetch = run("fetch", [
      "--input", partialPath,
      "--output-dir", failedFetchDir,
      "--fetched-at", "2026-07-13T00:00:00.000Z",
    ]);
    expect(failedFetch.status).not.toBe(0);
    expect(existsSync(failedFetchDir)).toBe(false);
    const failedFetchBundle = failureBundlePath(failedFetch);
    expect(failedFetchBundle).toMatch(new RegExp(`${failedFetchDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.failure-`));
    const fetchFailure = JSON.parse(readFileSync(join(failedFetchBundle, "failure-manifest.json"), "utf8"));
    expect(fetchFailure).toMatchObject({
      status: "failed",
      command: "fetch",
      reason_counts: { PAGINATION_INCOMPLETE: 1 },
      received_context: { received_page_count: FAILURE_FIXTURE.partial_pages.length },
      production_db_writes: 0,
    });
    const retry = run("fetch", [
      "--input", join(fixtureDir, "mfds-source-sample.json"),
      "--output-dir", failedFetchDir,
      "--fetched-at", "2026-07-13T00:00:00.000Z",
    ]);
    expect(retry.status).toBe(0);
    const secondFailure = run("fetch", [
      "--input", partialPath,
      "--output-dir", failedFetchDir,
      "--fetched-at", "2026-07-13T00:00:00.000Z",
    ]);
    expect(secondFailure.status).not.toBe(0);
    expect(failureBundlePath(secondFailure)).not.toBe(failedFetchBundle);

    const lifecycle = prepareLifecycle(join(tempDir, "setup"));
    const badManifest = JSON.parse(readFileSync(join(lifecycle.rawDir, "manifest.json"), "utf8"));
    badManifest.adapter_schema_version = "tampered-schema";
    writeFileSync(join(lifecycle.rawDir, "manifest.json"), JSON.stringify(badManifest));
    const failedNormalizeDir = join(tempDir, "failed-normalize");
    const failedNormalize = run("normalize", ["--input-dir", lifecycle.rawDir, "--output-dir", failedNormalizeDir]);
    expect(failedNormalize.status).not.toBe(0);
    const failedNormalizeBundle = failureBundlePath(failedNormalize);
    expect(JSON.parse(readFileSync(join(failedNormalizeBundle, "failure-manifest.json"), "utf8"))).toMatchObject({
      status: "quarantined",
      command: "normalize",
      reason_counts: { ADAPTER_SCHEMA_MISMATCH: 1 },
    });

    const badEvidence = JSON.parse(readFileSync(join(fixtureDir, "rda-measurement-limited-evidence.json"), "utf8"));
    badEvidence[0].license_disposition = "";
    const badEvidencePath = join(tempDir, "bad-evidence.json");
    writeFileSync(badEvidencePath, JSON.stringify(badEvidence));
    const failedReviewDir = join(tempDir, "failed-review");
    const failedReview = run("review", [
      "--input-dir", lifecycle.normalizedDir,
      "--decisions", lifecycle.decisionsPath,
      "--measurement-evidence", badEvidencePath,
      "--output-dir", failedReviewDir,
    ]);
    expect(failedReview.status).not.toBe(0);
    const failedReviewBundle = failureBundlePath(failedReview);
    expect(JSON.parse(readFileSync(join(failedReviewBundle, "failure-manifest.json"), "utf8"))).toMatchObject({
      status: "quarantined",
      command: "review",
      reason_counts: { RDA_LICENSE_DISPOSITION_MISSING: 1 },
    });
    const forbidden = run("promote", ["--input-dir", failedReviewBundle, "--output-dir", join(tempDir, "forbidden")]);
    expect(forbidden.status).not.toBe(0);
    expect(existsSync(join(tempDir, "forbidden", "approved-promotion-input.json"))).toBe(false);
  }, 20_000);
});
