#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MFDS_ENDPOINT = "https://api.data.go.kr/openapi/tn_pubr_public_nutri_process_info_api";
const RDA_ENDPOINT =
  "https://apis.data.go.kr/1390803/AgriFood/NationStdFood/V2/getKoreanFoodNationStdList";

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
  const keySource = "DATA_GO_KR_API_KEY";
  const key = envValue(keySource, localEnv);

  return key ? { key, keySource } : { key: "", keySource: null };
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

function parseRdaResponse({ httpStatus, contentType, text }, keySource, groupCode) {
  if (httpStatus !== 200) {
    return {
      provider: "rda",
      status: "failed",
      key_source: keySource,
      endpoint: RDA_ENDPOINT,
      http_status: httpStatus,
      content_type: contentType,
      rows: 0,
      request: { fd_Grupp: groupCode },
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
      request: { fd_Grupp: groupCode },
      error_code: resultCode,
      error_message: resultMessage,
    };
  }

  const rows = parseRdaItems(text, groupCode);

  return {
    provider: "rda",
    status: "ok",
    key_source: keySource,
    endpoint: RDA_ENDPOINT,
    http_status: httpStatus,
    content_type: contentType,
    rows: rows.length,
    request: { fd_Grupp: groupCode },
    data: rows,
  };
}

async function fetchMfds({ key, keySource, mockDir, rows }) {
  const params = {
    pageNo: "1",
    numOfRows: String(rows),
    type: "json",
  };
  const response = mockDir
    ? await readMockResponse(mockDir, "mfds.json")
    : await fetchText(buildPublicDataUrl(MFDS_ENDPOINT, key, params));

  return parseMfdsResponse(response, keySource);
}

async function fetchRdaGroup({ key, keySource, mockDir, groupCode, pageSize }) {
  const params = {
    page_No: "1",
    Page_Size: String(pageSize),
    fd_Grupp: groupCode,
  };
  const response = mockDir
    ? await readMockResponse(mockDir, `rda-${groupCode}.xml`)
    : await fetchText(buildPublicDataUrl(RDA_ENDPOINT, key, params));

  return parseRdaResponse(response, keySource, groupCode);
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
  const rdaPageSize = Number(args["rda-page-size"] ?? "10");
  const providerResults = [];
  const sourceExport = {
    dataGoKrProcessedFoodRows: [],
    rdaFoodCompositionRows: [],
  };

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
      const result = await fetchMfds({ key, keySource, mockDir, rows: mfdsRows });
      providerResults.push(result);
      sourceExport.dataGoKrProcessedFoodRows.push(...(result.data ?? []));
    }
  }

  if (providers.includes("rda")) {
    const { key, keySource } = resolvePublicDataPortalKey(localEnv);

    if (!key && !mockDir) {
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
        const result = await fetchRdaGroup({
          key,
          keySource,
          mockDir,
          groupCode,
          pageSize: rdaPageSize,
        });
        providerResults.push(result);
        sourceExport.rdaFoodCompositionRows.push(...(result.data ?? []));
      }
    }
  }

  await mkdir(outputDir, { recursive: true });

  const sourceExportPath = path.join(outputDir, "live-source-export.json");
  const liveFetchReportPath = path.join(outputDir, "live-fetch-report.json");
  const summaryPath = path.join(outputDir, "live-fetch-summary.md");
  const totalSourceRows =
    sourceExport.dataGoKrProcessedFoodRows.length + sourceExport.rdaFoodCompositionRows.length;

  await writeJson(sourceExportPath, sourceExport);

  if (totalSourceRows > 0) {
    await runDryRun({ sourceExportPath, outputDir, generatedAt });
  }

  const report = {
    generated_at: generatedAt,
    providers: providerResults.map(withoutData),
    summary: {
      total_source_rows: totalSourceRows,
      candidate_dry_run_executed: totalSourceRows > 0,
      production_db_writes: 0,
    },
    output: {
      live_fetch_report_path: liveFetchReportPath,
      source_export_path: sourceExportPath,
      candidate_report_path:
        totalSourceRows > 0 ? path.join(outputDir, "candidate-report.json") : null,
      approved_seed_promotion_artifact_path:
        totalSourceRows > 0 ? path.join(outputDir, "approved-seed-promotion-artifact.json") : null,
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
