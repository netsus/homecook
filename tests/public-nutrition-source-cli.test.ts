import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const PIPELINE_MODULE = pathToFileURL(
  join(process.cwd(), "scripts/lib/public-nutrition-pipeline.mjs"),
).href;
const FAILURE_FIXTURE = JSON.parse(readFileSync(join(
  process.cwd(),
  "tests/fixtures/public-nutrition-source/failure-scenarios.json",
), "utf8"));

async function loadPipeline() {
  return import(PIPELINE_MODULE);
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
  });
});
