#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const MFDS_ENDPOINT = "https://api.data.go.kr/openapi/tn_pubr_public_nutri_process_info_api";
const RDA_ENDPOINT =
  "https://apis.data.go.kr/1390803/AgriFood/NationStdFood/V2/getKoreanFoodNationStdList";
const RDA_MAX_PAGE_SIZE = 20;

function parseCliArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--" || !token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const nextToken = argv[index + 1];

    if (!nextToken || nextToken.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = nextToken;
    index += 1;
  }

  return args;
}

function parseDotEnv(text) {
  const env = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    env[key] = value;
  }

  return env;
}

async function readLocalEnv() {
  if (!existsSync(".env.local")) return {};

  return parseDotEnv(await readFile(".env.local", "utf8"));
}

function envValue(name, localEnv) {
  return process.env[name] || localEnv[name] || "";
}

function resolvePublicDataPortalKey(localEnv) {
  const keyOption = resolvePublicDataPortalKeys(localEnv)[0];

  return keyOption ?? { key: "", keySource: null };
}

function publicDataPortalKeySortValue(name) {
  if (name === "DATA_GO_KR_API_KEY") return 0;

  const match = name.match(/^DATA_GO_KR_API_KEY(\d+)$/);

  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function resolvePublicDataPortalKeys(localEnv) {
  const keySources = [...new Set([...Object.keys(localEnv), ...Object.keys(process.env)])]
    .filter((name) => /^DATA_GO_KR_API_KEY\d*$/.test(name))
    .sort((left, right) => publicDataPortalKeySortValue(left) - publicDataPortalKeySortValue(right));

  return keySources.flatMap((keySource) => {
    const key = envValue(keySource, localEnv);

    return key ? [{ key, keySource }] : [];
  });
}

class RequestLimitExceededError extends Error {
  constructor({ request, usedRequests, maxRequests }) {
    super("request_limit_exceeded");
    this.name = "RequestLimitExceededError";
    this.request = request;
    this.usedRequests = usedRequests;
    this.maxRequests = maxRequests;
  }
}

function parsePositiveInteger(value, defaultValue) {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return defaultValue;
}

function parseRdaPageSize(value) {
  const pageSize = parsePositiveInteger(value, 10);

  if (pageSize > RDA_MAX_PAGE_SIZE) {
    throw new Error(
      `RDA Page_Size must be ${RDA_MAX_PAGE_SIZE} or lower. The public API returns page format errors above ${RDA_MAX_PAGE_SIZE}.`,
    );
  }

  return pageSize;
}

function createRequestLimiter(maxRequests) {
  let usedRequests = 0;

  return {
    consume(request) {
      if (usedRequests >= maxRequests) {
        throw new RequestLimitExceededError({
          request,
          usedRequests,
          maxRequests,
        });
      }

      usedRequests += 1;
    },
    get usedRequests() {
      return usedRequests;
    },
    maxRequests,
  };
}

function isRequestLimitExceededError(error) {
  return error instanceof RequestLimitExceededError;
}

function isQuotaOrRateLimitFailure(providerResult) {
  if (providerResult?.status !== "failed") return false;

  const errorCode = String(providerResult.error_code ?? "").toLowerCase();
  const errorMessage = String(providerResult.error_message ?? "").toLowerCase();

  return (
    errorCode === "http_429" ||
    errorCode === "429" ||
    errorMessage.includes("quota") ||
    errorMessage.includes("rate limit")
  );
}

function withFailedKeySources(providerResult, failedKeySources) {
  if (failedKeySources.length === 0) return providerResult;

  return {
    ...providerResult,
    request: {
      ...(isRecord(providerResult.request) ? providerResult.request : {}),
      failed_key_sources: [...failedKeySources],
    },
  };
}

function createPublicDataPortalKeyRing(keyOptions) {
  let activeIndex = 0;
  const failedKeySources = [];

  return {
    get hasKeys() {
      return keyOptions.length > 0;
    },
    async run(fetcher) {
      for (let index = activeIndex; index < keyOptions.length; index += 1) {
        const keyOption = keyOptions[index];
        const result = await fetcher(keyOption);

        if (isQuotaOrRateLimitFailure(result) && index < keyOptions.length - 1) {
          if (!failedKeySources.includes(keyOption.keySource)) {
            failedKeySources.push(keyOption.keySource);
          }
          activeIndex = index + 1;
          continue;
        }

        return withFailedKeySources(result, failedKeySources);
      }

      return null;
    },
  };
}

function buildPublicDataUrl(endpoint, key, params) {
  const restParams = new URLSearchParams(params).toString();

  if (/%[0-9a-f]{2}/i.test(key)) {
    return `${endpoint}?serviceKey=${key}&${restParams}`;
  }

  const url = new URL(endpoint);
  url.searchParams.set("serviceKey", key);

  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }

  return url.toString();
}

async function readMockResponse(mockDir, fileName) {
  return {
    httpStatus: 200,
    contentType: fileName.endsWith(".json") ? "application/json" : "application/xml",
    text: await readFile(path.join(mockDir, fileName), "utf8"),
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, application/xml, text/xml, */*",
    },
  });

  return {
    httpStatus: response.status,
    contentType: response.headers.get("content-type") ?? "",
    text: await response.text(),
  };
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];

  return [value];
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMfdsRow(row) {
  return {
    FOOD_CD: row.FOOD_CD ?? row.foodCd,
    FOOD_NM: row.FOOD_NM ?? row.foodNm,
    TYPE_NM: row.TYPE_NM ?? row.typeNm,
    SRC_NM: row.SRC_NM ?? row.srcNm,
    INSTT_NM: row.INSTT_NM ?? row.insttNm,
    FOOD_LV3_NM: row.FOOD_LV3_NM ?? row.foodLv3Nm,
    FOOD_LV4_NM: row.FOOD_LV4_NM ?? row.foodLv4Nm,
    FOOD_LV5_NM: row.FOOD_LV5_NM ?? row.foodLv5Nm,
    FOOD_LV6_NM: row.FOOD_LV6_NM ?? row.foodLv6Nm,
    CRTR_YMD: row.CRTR_YMD ?? row.crtrYmd ?? row.crtYmd,
    raw_data_go_kr_row: row,
  };
}

function extractMfdsRows(json) {
  const body = json.response?.body ?? {};
  const items = body.items?.item ?? body.items;

  return toArray(items).map(normalizeMfdsRow);
}

function parseMfdsResponse({ httpStatus, contentType, text }, keySource) {
  if (httpStatus !== 200) {
    return {
      provider: "mfds",
      status: "failed",
      key_source: keySource,
      endpoint: MFDS_ENDPOINT,
      http_status: httpStatus,
      content_type: contentType,
      rows: 0,
      error_code: `HTTP_${httpStatus}`,
      error_message: text.slice(0, 300),
    };
  }

  let json;

  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      provider: "mfds",
      status: "failed",
      key_source: keySource,
      endpoint: MFDS_ENDPOINT,
      http_status: httpStatus,
      content_type: contentType,
      rows: 0,
      error_code: "invalid_json",
      error_message: error instanceof Error ? error.message : String(error),
    };
  }

  const header = json.response?.header ?? {};
  const resultCode = String(header.resultCode ?? header.result_code ?? "");
  const resultMessage = String(header.resultMsg ?? header.result_msg ?? "");

  if (resultCode && resultCode !== "00") {
    return {
      provider: "mfds",
      status: "failed",
      key_source: keySource,
      endpoint: MFDS_ENDPOINT,
      http_status: httpStatus,
      content_type: contentType,
      rows: 0,
      error_code: resultCode,
      error_message: resultMessage,
    };
  }

  const rows = extractMfdsRows(json);

  return {
    provider: "mfds",
    status: "ok",
    key_source: keySource,
    endpoint: MFDS_ENDPOINT,
    http_status: httpStatus,
    content_type: contentType,
    rows: rows.length,
    data: rows,
  };
}

function decodeXmlText(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function xmlText(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));

  return match ? decodeXmlText(match[1].trim()) : null;
}

function xmlBlocks(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map(
    (match) => match[1],
  );
}

function parseRdaItems(xml, groupCode) {
  return xmlBlocks(xml, "item").map((itemBlock) => ({
    fdCode: xmlText(itemBlock, "food_Code"),
    fdGrupp: groupCode,
    fdGruppNm: xmlText(itemBlock, "food_Grupp"),
    fdNm: xmlText(itemBlock, "food_Nm"),
    originNm: xmlText(itemBlock, "origin_Nm"),
    food_Eng_Nm: xmlText(itemBlock, "food_Eng_Nm"),
    examin_Year: xmlText(itemBlock, "examin_Year"),
    raw_public_data_xml_item: {
      food_Code: xmlText(itemBlock, "food_Code"),
      food_Grupp: xmlText(itemBlock, "food_Grupp"),
      food_Nm: xmlText(itemBlock, "food_Nm"),
      origin_Nm: xmlText(itemBlock, "origin_Nm"),
      examin_Year: xmlText(itemBlock, "examin_Year"),
    },
  }));
}

function parseRdaResponse({ httpStatus, contentType, text }, keySource, groupCode, pageNo = 1, pageSize = null) {
  if (httpStatus !== 200) {
    return {
      provider: "rda",
      status: "failed",
      key_source: keySource,
      endpoint: RDA_ENDPOINT,
      http_status: httpStatus,
      content_type: contentType,
      rows: 0,
      request: { fd_Grupp: groupCode, page_no: pageNo, page_size: pageSize },
      error_code: `HTTP_${httpStatus}`,
      error_message: text.slice(0, 300),
    };
  }

  const resultCode = xmlText(text, "result_Code") ?? xmlText(text, "resultCode") ?? "";
  const resultMessage = xmlText(text, "result_Msg") ?? xmlText(text, "resultMsg") ?? "";

  if (resultCode && !["00", "200"].includes(resultCode)) {
    return {
      provider: "rda",
      status: "failed",
      key_source: keySource,
      endpoint: RDA_ENDPOINT,
      http_status: httpStatus,
      content_type: contentType,
      rows: 0,
      request: { fd_Grupp: groupCode, page_no: pageNo, page_size: pageSize },
      error_code: resultCode,
      error_message: resultMessage,
    };
  }

  const parsedTotalCount = Number(xmlText(text, "total_Count") ?? xmlText(text, "totalCount") ?? "");
  const totalCount = Number.isFinite(parsedTotalCount) && parsedTotalCount >= 0 ? parsedTotalCount : null;
  const rows = parseRdaItems(text, groupCode);

  return {
    provider: "rda",
    status: "ok",
    key_source: keySource,
    endpoint: RDA_ENDPOINT,
    http_status: httpStatus,
    content_type: contentType,
    rows: rows.length,
    total_count: totalCount,
    request: { fd_Grupp: groupCode, page_no: pageNo, page_size: pageSize, total_count: totalCount },
    data: rows,
  };
}

async function fetchMfds({ key, keySource, mockDir, rows, requestLimiter = null }) {
  const params = {
    pageNo: "1",
    numOfRows: String(rows),
    type: "json",
  };

  requestLimiter?.consume({ provider: "mfds", page_no: 1, rows });

  const response = mockDir
    ? await readMockResponse(mockDir, "mfds.json")
    : await fetchText(buildPublicDataUrl(MFDS_ENDPOINT, key, params));

  return parseMfdsResponse(response, keySource);
}

async function readRdaMockResponse(mockDir, groupCode, pageNo, keySource = null) {
  const keyedFileName = keySource ? `rda-${groupCode}-page-${pageNo}-key-${keySource}.xml` : null;
  const pagedFileName = `rda-${groupCode}-page-${pageNo}.xml`;
  const legacyFileName = `rda-${groupCode}.xml`;

  if (keyedFileName && existsSync(path.join(mockDir, keyedFileName))) {
    return readMockResponse(mockDir, keyedFileName);
  }

  if (existsSync(path.join(mockDir, pagedFileName))) {
    return readMockResponse(mockDir, pagedFileName);
  }

  return readMockResponse(mockDir, legacyFileName);
}

async function fetchRdaGroupPage({
  key,
  keySource,
  mockDir,
  groupCode,
  pageSize,
  pageNo,
  requestLimiter = null,
}) {
  const params = {
    page_No: String(pageNo),
    Page_Size: String(pageSize),
    fd_Grupp: groupCode,
  };

  requestLimiter?.consume({
    provider: "rda",
    fd_Grupp: groupCode,
    page_no: pageNo,
    page_size: pageSize,
  });

  const response = mockDir
    ? await readRdaMockResponse(mockDir, groupCode, pageNo, keySource)
    : await fetchText(buildPublicDataUrl(RDA_ENDPOINT, key, params));

  return parseRdaResponse(response, keySource, groupCode, pageNo, pageSize);
}

async function fetchRdaGroupPageWithKeyFailover({
  keyRing,
  mockDir,
  groupCode,
  pageSize,
  pageNo,
  requestLimiter = null,
}) {
  return keyRing.run(({ key, keySource }) =>
    fetchRdaGroupPage({
      key,
      keySource,
      mockDir,
      groupCode,
      pageSize,
      pageNo,
      requestLimiter,
    }),
  );
}

function calculateRdaPageCount({ totalCount, pageSize, fallbackRows }) {
  if (Number.isInteger(totalCount) && totalCount > 0 && Number.isInteger(pageSize) && pageSize > 0) {
    return Math.ceil(totalCount / pageSize);
  }

  return fallbackRows > 0 ? 1 : 0;
}

function rdaGroupArtifactPath(outputDir, groupCode) {
  return path.join(outputDir, `rda-${groupCode}-full-source.json`);
}

async function readCompletedRdaGroupArtifact({ outputDir, groupCode }) {
  if (!outputDir) return null;

  const artifactPath = rdaGroupArtifactPath(outputDir, groupCode);
  if (!existsSync(artifactPath)) return null;

  const parsed = JSON.parse(await readFile(artifactPath, "utf8"));

  if (
    parsed?.provider !== "rda" ||
    parsed?.status !== "ok" ||
    !Array.isArray(parsed?.data)
  ) {
    throw new Error(`Invalid completed RDA group artifact: ${artifactPath}`);
  }

  return {
    ...parsed,
    cached: true,
    request: {
      ...(isRecord(parsed.request) ? parsed.request : {}),
      fd_Grupp: groupCode,
      cache_hit: true,
    },
  };
}

function buildRdaRequestLimitFailure({
  keySource,
  groupCode,
  pageSize,
  pagesFetched,
  nextPage,
  totalCount,
  requestLimitError,
}) {
  return {
    provider: "rda",
    status: "failed",
    key_source: keySource,
    endpoint: RDA_ENDPOINT,
    rows: 0,
    request: {
      fd_Grupp: groupCode,
      page_size: pageSize,
      pages_fetched: pagesFetched,
      next_page: nextPage,
      total_count: totalCount,
    },
    error_code: "request_limit_exceeded",
    error_message: `Request limit ${requestLimitError.maxRequests} would be exceeded before page ${nextPage}.`,
    data: [],
  };
}

async function fetchAllRdaGroupPages({
  key,
  keySource,
  mockDir,
  groupCode,
  pageSize,
  outputDir = null,
  requestLimiter = null,
  keyRing = null,
}) {
  const cachedResult = await readCompletedRdaGroupArtifact({ outputDir, groupCode });
  if (cachedResult) {
    return cachedResult;
  }

  let firstPage;

  try {
    firstPage = keyRing
      ? await fetchRdaGroupPageWithKeyFailover({
          keyRing,
          mockDir,
          groupCode,
          pageSize,
          pageNo: 1,
          requestLimiter,
        })
      : await fetchRdaGroupPage({
          key,
          keySource,
          mockDir,
          groupCode,
          pageSize,
          pageNo: 1,
          requestLimiter,
        });
  } catch (error) {
    if (isRequestLimitExceededError(error)) {
      return buildRdaRequestLimitFailure({
        keySource,
        groupCode,
        pageSize,
        pagesFetched: 0,
        nextPage: 1,
        totalCount: null,
        requestLimitError: error,
      });
    }

    throw error;
  }

  if (firstPage.status !== "ok") {
    return firstPage;
  }

  const totalCount = firstPage.total_count ?? firstPage.rows;
  const pageCount = calculateRdaPageCount({
    totalCount,
    pageSize,
    fallbackRows: firstPage.rows,
  });
  const pageResults = [firstPage];

  for (let pageNo = 2; pageNo <= pageCount; pageNo += 1) {
    let pageResult;

    try {
      pageResult = keyRing
        ? await fetchRdaGroupPageWithKeyFailover({
            keyRing,
            mockDir,
            groupCode,
            pageSize,
            pageNo,
            requestLimiter,
          })
        : await fetchRdaGroupPage({
            key,
            keySource,
            mockDir,
            groupCode,
            pageSize,
            pageNo,
            requestLimiter,
          });
    } catch (error) {
      if (isRequestLimitExceededError(error)) {
        return buildRdaRequestLimitFailure({
          keySource,
          groupCode,
          pageSize,
          pagesFetched: pageResults.length,
          nextPage: pageNo,
          totalCount,
          requestLimitError: error,
        });
      }

      throw error;
    }

    pageResults.push(pageResult);

    if (pageResult.status !== "ok") {
      return {
        ...pageResult,
        rows: 0,
        data: [],
        request: {
          fd_Grupp: groupCode,
          page_size: pageSize,
          pages_fetched: pageResults.length,
          first_page: 1,
          last_page: pageNo,
          total_count: totalCount,
        },
      };
    }
  }

  const data = pageResults.flatMap((pageResult) => pageResult.data ?? []);

  const result = {
    provider: "rda",
    status: "ok",
    key_source: firstPage.key_source,
    endpoint: RDA_ENDPOINT,
    http_status: firstPage.http_status,
    content_type: firstPage.content_type,
    rows: data.length,
    total_count: totalCount,
    request: {
      fd_Grupp: groupCode,
      page_size: pageSize,
      pages_fetched: pageResults.length,
      first_page: 1,
      last_page: pageResults.length,
      total_count: totalCount,
      ...(Array.isArray(firstPage.request?.failed_key_sources)
        ? { failed_key_sources: firstPage.request.failed_key_sources }
        : {}),
    },
    pages: pageResults.map(withoutData),
    data,
  };

  if (outputDir) {
    await writeJson(rdaGroupArtifactPath(outputDir, groupCode), result);
  }

  return result;
}

function withoutData(providerResult) {
  const rest = { ...providerResult };
  delete rest.data;

  return rest;
}

function defaultOutputDir(generatedAt) {
  return path.join(
    ".artifacts",
    "external-ingredient-ingest",
    `live-fetch-${generatedAt.replace(/[:.]/g, "-")}`,
  );
}

function buildSummary(report) {
  const successfulCount = report.providers.filter((provider) => provider.status === "ok").length;

  return [
    "# External Ingredient Live Fetch",
    "",
    `Generated at: ${report.generated_at}`,
    "",
    "## Safety",
    "",
    "- Production DB writes: 0",
    "- API keys are read from server/local environment only and are not printed or written.",
    "",
    "## Provider Results",
    "",
    `- Successful providers: ${successfulCount}/${report.providers.length}`,
    `- Source export rows: ${report.summary.total_source_rows}`,
    `- Candidate dry-run executed: ${report.summary.candidate_dry_run_executed ? "yes" : "no"}`,
    "",
    ...report.providers.map((provider) => {
      if (provider.status === "ok") {
        return `- ${provider.provider}: ok, rows=${provider.rows}, key=${provider.key_source}`;
      }

      return `- ${provider.provider}: failed, code=${provider.error_code}, message=${provider.error_message}`;
    }),
    "",
    "## Output Files",
    "",
    `- Live fetch report: ${report.output.live_fetch_report_path}`,
    `- Source export: ${report.output.source_export_path}`,
    ...(report.output.candidate_report_path
      ? [`- Candidate report: ${report.output.candidate_report_path}`]
      : []),
    "",
  ].join("\n");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function runDryRun({ sourceExportPath, outputDir, generatedAt }) {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/external-ingredient-file-dry-run.mjs",
      "--input",
      sourceExportPath,
      "--output-dir",
      outputDir,
      "--generated-at",
      generatedAt,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "file dry-run failed");
  }
}

async function removeStaleDryRunArtifacts(outputDir) {
  await Promise.all(
    ["candidate-report.json", "approved-seed-promotion-artifact.json"].map((fileName) =>
      rm(path.join(outputDir, fileName), { force: true }),
    ),
  );
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(
      "Usage: pnpm external:ingredients:live-fetch -- --providers mfds,rda [--output-dir <dir>] [--generated-at <iso>]\n",
    );

    return;
  }

  const generatedAt = typeof args["generated-at"] === "string" ? args["generated-at"] : new Date().toISOString();
  const outputDir =
    typeof args["output-dir"] === "string" && args["output-dir"].trim().length > 0
      ? args["output-dir"]
      : defaultOutputDir(generatedAt);
  const providers = String(args.providers ?? "mfds,rda")
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean);
  const rdaGroups = String(args["rda-groups"] ?? "A")
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean);
  const localEnv = await readLocalEnv();
  const mockDir = typeof args["mock-response-dir"] === "string" ? args["mock-response-dir"] : null;
  const mfdsRows = Number(args["mfds-rows"] ?? "20");
  const rdaPageSize = providers.includes("rda")
    ? parseRdaPageSize(args["rda-page-size"] ?? "10")
    : parsePositiveInteger(args["rda-page-size"] ?? "10", 10);
  const rdaFetchAll = args["rda-fetch-all"] === true || args["rda-fetch-all"] === "true";
  const maxRequestsPerRun = parsePositiveInteger(args["max-requests-per-run"] ?? "100", 100);
  const requestLimiter = createRequestLimiter(maxRequestsPerRun);
  const providerResults = [];
  const sourceExport = {
    dataGoKrProcessedFoodRows: [],
    rdaFoodCompositionRows: [],
  };

  await mkdir(outputDir, { recursive: true });

  if (providers.includes("mfds")) {
    const { key, keySource } = resolvePublicDataPortalKey(localEnv);

    if (!key && !mockDir) {
      providerResults.push({
        provider: "mfds",
        status: "failed",
        key_source: null,
        endpoint: MFDS_ENDPOINT,
        rows: 0,
        error_code: "missing_key",
        error_message: "DATA_GO_KR_API_KEY is required.",
      });
    } else {
      try {
        const result = await fetchMfds({
          key,
          keySource,
          mockDir,
          rows: mfdsRows,
          requestLimiter,
        });
        providerResults.push(result);
        sourceExport.dataGoKrProcessedFoodRows.push(...(result.data ?? []));
      } catch (error) {
        if (!isRequestLimitExceededError(error)) {
          throw error;
        }

        providerResults.push({
          provider: "mfds",
          status: "failed",
          key_source: keySource,
          endpoint: MFDS_ENDPOINT,
          rows: 0,
          request: { page_no: 1, rows: mfdsRows },
          error_code: "request_limit_exceeded",
          error_message: `Request limit ${error.maxRequests} would be exceeded before MFDS fetch.`,
        });
      }
    }
  }

  if (providers.includes("rda")) {
    const publicDataPortalKeys = resolvePublicDataPortalKeys(localEnv);
    const keyRing = createPublicDataPortalKeyRing(publicDataPortalKeys);
    const { key, keySource } = publicDataPortalKeys[0] ?? { key: "", keySource: null };

    if (!keyRing.hasKeys && !mockDir) {
      providerResults.push({
        provider: "rda",
        status: "failed",
        key_source: null,
        endpoint: RDA_ENDPOINT,
        rows: 0,
        error_code: "missing_key",
        error_message: "DATA_GO_KR_API_KEY is required.",
      });
    } else {
      for (const groupCode of rdaGroups) {
        const result = rdaFetchAll
          ? await fetchAllRdaGroupPages({
              key,
              keySource,
              mockDir,
              groupCode,
              pageSize: rdaPageSize,
              outputDir,
              requestLimiter,
              keyRing,
            })
          : await fetchRdaGroupPageWithKeyFailover({
              keyRing,
              mockDir,
              groupCode,
              pageSize: rdaPageSize,
              pageNo: 1,
              requestLimiter,
            });
        providerResults.push(result);
        sourceExport.rdaFoodCompositionRows.push(...(result.data ?? []));

        if (isQuotaOrRateLimitFailure(result)) {
          break;
        }
      }
    }
  }

  const sourceExportPath = path.join(outputDir, "live-source-export.json");
  const liveFetchReportPath = path.join(outputDir, "live-fetch-report.json");
  const summaryPath = path.join(outputDir, "live-fetch-summary.md");
  const totalSourceRows =
    sourceExport.dataGoKrProcessedFoodRows.length + sourceExport.rdaFoodCompositionRows.length;

  await writeJson(sourceExportPath, sourceExport);

  const hasProviderFailures = providerResults.some((providerResult) => providerResult.status !== "ok");
  const shouldRunDryRun = totalSourceRows > 0 && !hasProviderFailures;

  if (shouldRunDryRun) {
    await runDryRun({ sourceExportPath, outputDir, generatedAt });
  } else {
    await removeStaleDryRunArtifacts(outputDir);
  }

  const report = {
    generated_at: generatedAt,
    providers: providerResults.map(withoutData),
    summary: {
      total_source_rows: totalSourceRows,
      candidate_dry_run_executed: shouldRunDryRun,
      production_db_writes: 0,
    },
    output: {
      live_fetch_report_path: liveFetchReportPath,
      source_export_path: sourceExportPath,
      candidate_report_path:
        shouldRunDryRun ? path.join(outputDir, "candidate-report.json") : null,
      approved_seed_promotion_artifact_path:
        shouldRunDryRun ? path.join(outputDir, "approved-seed-promotion-artifact.json") : null,
      live_fetch_summary_path: summaryPath,
    },
  };
  const summary = buildSummary(report);

  await writeJson(liveFetchReportPath, report);
  await writeFile(summaryPath, summary);

  process.stdout.write(`${summary}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
