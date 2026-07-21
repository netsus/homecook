import {
  NutritionPipelineError,
  buildRawBatch,
  requestJsonWithRetry,
} from "./public-nutrition-pipeline.mjs";

export const INTEGRATED_MATERIAL_MAX_PAGE_SIZE = 1_000;
export const INTEGRATED_MATERIAL_MAX_LIVE_PAGES = 10;

const REQUEST_ENDPOINT =
  "https://api.data.go.kr/openapi/tn_pubr_public_nutri_material_info_api";
const SOURCE = Object.freeze({
  id: "integrated-material-15100065",
  provider: "공공데이터포털",
  dataset: "전국통합식품영양성분정보(원재료성식품)표준데이터",
  source_version: "2026-07-01",
  data_basis_date: null,
  endpoint_or_file_url: "https://www.data.go.kr/data/15100065/standard.do",
  license: "공공데이터포털 이용정책",
  license_url: "https://data.go.kr/ugs/selectPortalPolicyView.do",
  license_evidence_url: "https://www.data.go.kr/data/15100065/standard.do",
  license_verified_at: "2026-07-21",
});

function fail(code, details = {}) {
  throw new NutritionPipelineError(code, details);
}

function parsePage(payload, expectedPageNo) {
  const header = payload?.response?.header;
  const body = payload?.response?.body;
  if (String(header?.resultCode) !== "00" || body === null || typeof body !== "object") {
    fail("INTEGRATED_PROVIDER_RESPONSE_INVALID", {
      result_code: header?.resultCode ?? null,
      result_message: header?.resultMsg ?? null,
      requested_page_no: expectedPageNo,
    });
  }
  const pageNo = Number(body.pageNo);
  const totalCount = Number(body.totalCount);
  const items = Array.isArray(body.items) ? body.items : [];
  if (
    !Number.isInteger(pageNo) ||
    pageNo !== expectedPageNo ||
    !Number.isInteger(totalCount) ||
    totalCount < 0 ||
    items.some((item) => item === null || typeof item !== "object" || Array.isArray(item))
  ) {
    fail("INTEGRATED_PROVIDER_RESPONSE_INVALID", { requested_page_no: expectedPageNo });
  }
  return {
    page_no: pageNo,
    total_count: totalCount,
    next_page_token: null,
    items,
  };
}

export async function fetchIntegratedNutritionBatch({
  apiKey,
  fetchedAt,
  pageSize = INTEGRATED_MATERIAL_MAX_PAGE_SIZE,
  maxPages = INTEGRATED_MATERIAL_MAX_LIVE_PAGES,
  fetchImpl = globalThis.fetch,
  sleep,
  now,
  createTimeoutSignal,
}) {
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    fail("MISSING_API_KEY", { env: "DATA_GO_KR_API_KEY" });
  }
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > INTEGRATED_MATERIAL_MAX_PAGE_SIZE ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > INTEGRATED_MATERIAL_MAX_LIVE_PAGES
  ) {
    fail("PAGINATION_SCHEMA_INVALID", { page_size: pageSize, max_pages: maxPages });
  }
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");

  const pages = [];
  let accumulated = 0;
  let reportedTotal = null;
  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    let payload;
    try {
      payload = await requestJsonWithRetry({
        endpoint: REQUEST_ENDPOINT,
        query: {
          pageNo,
          numOfRows: pageSize,
          type: "json",
        },
        apiKey,
        fetchImpl,
        ...(sleep ? { sleep } : {}),
        ...(now ? { now } : {}),
        ...(createTimeoutSignal ? { createTimeoutSignal } : {}),
      });
    } catch (error) {
      if (error instanceof NutritionPipelineError) throw error;
      fail("INTEGRATED_PROVIDER_RESPONSE_INVALID", { requested_page_no: pageNo });
    }
    const page = parsePage(payload, pageNo);
    pages.push(page);
    accumulated += page.items.length;
    reportedTotal ??= page.total_count;
    if (page.total_count !== reportedTotal || accumulated > reportedTotal) {
      fail("PAGINATION_SCHEMA_INVALID", {
        requested_page_no: pageNo,
        reported_total: reportedTotal,
        accumulated,
      });
    }
    if (accumulated === reportedTotal) break;
  }
  if (reportedTotal === null || accumulated !== reportedTotal) {
    fail("PAGINATION_INCOMPLETE", { reported_total: reportedTotal, accumulated });
  }

  return buildRawBatch({
    source: SOURCE,
    adapter_schema_version: "nutrition-source-row-v1",
    input_shape: "integrated-material-provider-v1",
    pages,
    query: {
      pageNo_start: 1,
      pageNo_end: pages.length,
      numOfRows: pageSize,
      type: "json",
      dataset_scope: "raw_materials",
    },
    fetchedAt,
  });
}
