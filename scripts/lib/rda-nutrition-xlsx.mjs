import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  NutritionPipelineError,
  buildRawBatch,
} from "./public-nutrition-pipeline.mjs";

const RDA_SHEET_NAME = "국가표준식품성분 Database 10.4";
const RDA_FILE_NAME = "식품성분표(10개정판).xlsx";
const RDA_OFFICIAL_FILE_SIZE_BYTES = 13_348_408;
const RDA_OFFICIAL_FILE_SHA256 =
  "271cc431f2991b3c0c049ec6e05fb59a040319e984ab71468184530de61dec50";
const RDA_OFFICIAL_DATA_ROW_COUNT = 3_366;
const RDA_STABLE_KEY_HEADER = "DB10.4색인";
const RDA_EDIBLE_PORTION_TEXT = "가식부 100g 당 (per 100g Edible Portion)";
const RDA_SOURCE = Object.freeze({
  id: "rda-10.4",
  provider: "농촌진흥청",
  dataset: "국가표준식품성분 DB 10.4",
  source_version: "10.4",
  data_basis_date: "2026-04-28",
  endpoint_or_file_url:
    "https://www.nics.go.kr/food/kfi/fct/fctIntro/list?menuId=PS03562",
  license: "공공누리 제1유형(출처표시)",
  license_url:
    "https://www.nics.go.kr/food/kfi/fct/fctIntro/list?menuId=PS03562",
  license_evidence_url: "https://www.nics.go.kr/food/kfi/notice/view?bbsSnn=41",
  license_verified_at: "2026-07-15",
});

function fail(code, details = {}) {
  throw new NutritionPipelineError(code, details);
}

function decodeXmlText(value) {
  return String(value ?? "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replaceAll("&amp;", "&");
}

function parseSharedStrings(xml) {
  if (typeof xml !== "string" || !xml.includes("<sst")) {
    fail("RDA_WORKBOOK_SCHEMA_INVALID");
  }
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((entry) =>
    decodeXmlText(
      [...entry[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
        .map((text) => text[1])
        .join(""),
    ));
}

function cellText(attributes, contents, sharedStrings) {
  if (contents === undefined) return null;
  const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? null;
  const value = contents.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  if (type === "inlineStr") {
    return decodeXmlText(
      [...contents.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
        .map((text) => text[1])
        .join(""),
    );
  }
  if (value === undefined) return null;
  if (type === "s") {
    const index = Number(value);
    if (!Number.isInteger(index) || sharedStrings[index] === undefined) {
      fail("RDA_WORKBOOK_SCHEMA_INVALID");
    }
    return sharedStrings[index];
  }
  return decodeXmlText(value);
}

function parseRows(worksheetXml, sharedStrings) {
  if (typeof worksheetXml !== "string" || !worksheetXml.includes("<worksheet")) {
    fail("RDA_WORKBOOK_SCHEMA_INVALID");
  }
  const rows = new Map();
  for (const row of worksheetXml.matchAll(
    /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g,
  )) {
    const cells = new Map();
    for (const cell of row[2].matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const column = cell[1].match(/\br="([A-Z]+)\d+"/)?.[1];
      if (column !== undefined) {
        cells.set(column, cellText(cell[1], cell[2], sharedStrings));
      }
    }
    rows.set(Number(row[1]), cells);
  }
  return rows;
}

function requiredCell(row, column) {
  const value = row?.get(column);
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("RDA_WORKBOOK_ROW_INVALID", { column });
  }
  return value.trim();
}

function validateHeader(rows, { requireStableKeyHeader = false } = {}) {
  if (requiredCell(rows.get(1), "D") !== RDA_EDIBLE_PORTION_TEXT) {
    fail("RDA_WORKBOOK_SCHEMA_INVALID", { column: "D1" });
  }
  const headers = rows.get(2);
  const units = rows.get(3);
  if (
    requireStableKeyHeader &&
    requiredCell(headers, "A").replaceAll(/\s/g, "") !== RDA_STABLE_KEY_HEADER
  ) {
    fail("RDA_WORKBOOK_SCHEMA_INVALID", { column: "A" });
  }
  const expectedHeaders = new Map([
    ["D", "식품명"],
    ["F", "에너지"],
    ["H", "단백질"],
    ["I", "지방"],
    ["K", "탄수화물"],
    ["L", "당류"],
    ["S", "총식이섬유"],
    ["AA", "나트륨"],
    ["CM", "총포화지방산"],
  ]);
  const expectedUnits = new Map([
    ["F", "kcal"],
    ["H", "g"],
    ["I", "g"],
    ["K", "g"],
    ["L", "g"],
    ["S", "g"],
    ["AA", "mg"],
    ["CM", "g"],
  ]);
  for (const [column, expected] of expectedHeaders) {
    if (requiredCell(headers, column).replaceAll(/\s/g, "") !== expected) {
      fail("RDA_WORKBOOK_SCHEMA_INVALID", { column });
    }
  }
  for (const [column, expected] of expectedUnits) {
    if (requiredCell(units, column) !== expected) {
      fail("RDA_WORKBOOK_SCHEMA_INVALID", { column });
    }
  }
}

function validateOfficialDataRows(dataRows) {
  if (
    dataRows.length !== RDA_OFFICIAL_DATA_ROW_COUNT ||
    dataRows.some(([rowNumber], index) => rowNumber !== index + 4)
  ) {
    fail("RDA_WORKBOOK_SCHEMA_INVALID", {
      expected_data_row_count: RDA_OFFICIAL_DATA_ROW_COUNT,
      received_data_row_count: dataRows.length,
    });
  }
}

export function assertRda104OfficialWorksheetSchema({
  worksheetXml,
  sharedStringsXml,
}) {
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const rows = parseRows(worksheetXml, sharedStrings);
  validateHeader(rows, { requireStableKeyHeader: true });
  validateOfficialDataRows(
    [...rows].filter(([rowNumber]) => rowNumber >= 4),
  );
}

function validateSourceFile(sourceFile) {
  const valid =
    sourceFile !== null &&
    typeof sourceFile === "object" &&
    sourceFile.name === RDA_FILE_NAME &&
    Number.isInteger(sourceFile.size_bytes) &&
    sourceFile.size_bytes > 0 &&
    typeof sourceFile.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(sourceFile.sha256);
  if (!valid) fail("RDA_SOURCE_FILE_INVALID");
  return sourceFile;
}

export function assertRda104OfficialSourceFile(sourceFile) {
  const validated = validateSourceFile(sourceFile);
  if (
    validated.size_bytes !== RDA_OFFICIAL_FILE_SIZE_BYTES ||
    validated.sha256 !== RDA_OFFICIAL_FILE_SHA256
  ) {
    fail("RDA_SOURCE_FILE_INVALID");
  }
  return validated;
}

export function assertRdaSourceFileUnchanged(before, after) {
  if (
    before.name !== after.name ||
    before.size_bytes !== after.size_bytes ||
    before.sha256 !== after.sha256
  ) {
    fail("RDA_SOURCE_FILE_CHANGED");
  }
  return after;
}

function validateScope(selectedItemKeys) {
  if (selectedItemKeys === undefined || selectedItemKeys === null) return null;
  if (
    !Array.isArray(selectedItemKeys) ||
    selectedItemKeys.length === 0 ||
    selectedItemKeys.some((value) => typeof value !== "string" || value.trim() === "")
  ) {
    fail("RDA_SCOPE_INVALID");
  }
  const normalized = selectedItemKeys.map((value) => value.trim());
  if (new Set(normalized).size !== normalized.length) fail("RDA_SCOPE_INVALID");
  return new Set(normalized);
}

function adaptWorksheet({
  worksheetXml,
  sharedStringsXml,
  sourceFile,
  fetchedAt,
  selectedItemKeys = null,
}, { official = false } = {}) {
  const pinnedFile = official
    ? assertRda104OfficialSourceFile(sourceFile)
    : validateSourceFile(sourceFile);
  const scope = validateScope(selectedItemKeys);
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const rows = parseRows(worksheetXml, sharedStrings);
  validateHeader(rows, { requireStableKeyHeader: official });

  const dataRows = [...rows].filter(([rowNumber]) => rowNumber >= 4);
  if (official) validateOfficialDataRows(dataRows);

  const items = [];
  const seenKeys = new Set();
  for (const [rowNumber, row] of dataRows) {
    const externalItemKey = requiredCell(row, "A");
    if (seenKeys.has(externalItemKey)) {
      fail("RDA_WORKBOOK_ITEM_KEY_COLLISION", { row_number: rowNumber });
    }
    seenKeys.add(externalItemKey);
    if (scope !== null && !scope.has(externalItemKey)) continue;
    items.push({
      external_item_key: externalItemKey,
      external_name: requiredCell(row, "D"),
      basis_text: "100 g",
      edible_portion: {
        text: RDA_EDIBLE_PORTION_TEXT,
      },
      preparation_state: "as_published",
      nutrients: {
        energy: { value: row.get("F") ?? "", unit: "kcal" },
        carbohydrate: { value: row.get("K") ?? "", unit: "g" },
        protein: { value: row.get("H") ?? "", unit: "g" },
        fat: { value: row.get("I") ?? "", unit: "g" },
        sodium: { value: row.get("AA") ?? "", unit: "mg" },
        sugars: { value: row.get("L") ?? "", unit: "g" },
        fiber: { value: row.get("S") ?? "", unit: "g" },
        saturated_fat: { value: row.get("CM") ?? "", unit: "g" },
      },
    });
  }
  if (scope !== null && items.length !== scope.size) {
    fail("RDA_SCOPE_ITEM_MISSING", {
      requested_count: scope.size,
      matched_count: items.length,
    });
  }
  if (items.length === 0) fail("RDA_SCOPE_ITEM_MISSING");

  return buildRawBatch({
    source: RDA_SOURCE,
    input_shape: "adapted-row-v1",
    adapter_schema_version: "nutrition-source-row-v1",
    pages: [{
      page_no: 1,
      total_count: items.length,
      next_page_token: null,
      items,
    }],
    query: {
      acquisition_mode: "official-ui-post",
      official_file_name: pinnedFile.name,
      official_file_sha256: pinnedFile.sha256,
      official_file_size_bytes: pinnedFile.size_bytes,
      ...(official
        ? { official_file_row_count: RDA_OFFICIAL_DATA_ROW_COUNT }
        : {}),
      scope_item_keys_sha256: createHash("sha256")
        .update(JSON.stringify(items.map((item) => item.external_item_key).toSorted()))
        .digest("hex"),
      scope_selection: scope === null ? "all_official_file_items" : "selected_item_keys",
      scope_item_count: items.length,
      workbook_sheet: RDA_SHEET_NAME,
    },
    fetchedAt,
  });
}

export function adaptRda104Worksheet(options) {
  return adaptWorksheet(options);
}

function adaptRda104OfficialWorksheet(options) {
  return adaptWorksheet(options, { official: true });
}

function unzipMember(filePath, member) {
  const result = spawnSync("unzip", ["-p", filePath, member], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0 || result.stdout.length === 0) {
    fail("RDA_WORKBOOK_READ_FAILED", { member });
  }
  return result.stdout;
}

function worksheetMember(workbookXml, relationshipsXml) {
  const sheet = [...workbookXml.matchAll(
    /<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g,
  )].find((entry) => decodeXmlText(entry[1]) === RDA_SHEET_NAME);
  if (sheet === undefined) fail("RDA_WORKBOOK_SCHEMA_INVALID");
  const relationship = [...relationshipsXml.matchAll(
    /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g,
  )].find((entry) => entry[1] === sheet[2]);
  const target = relationship?.[2]?.replace(/^\/?xl\//, "");
  if (target === undefined || !/^worksheets\/sheet\d+\.xml$/.test(target)) {
    fail("RDA_WORKBOOK_SCHEMA_INVALID");
  }
  return `xl/${target}`;
}

export function sourceFileEvidence(filePath) {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) fail("RDA_SOURCE_FILE_INVALID");
    const bytes = readFileSync(filePath);
    return {
      name: path.basename(filePath),
      size_bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if (error instanceof NutritionPipelineError) throw error;
    fail("RDA_SOURCE_FILE_INVALID");
  }
}

export function loadRda104Workbook(filePath, {
  fetchedAt,
  selectedItemKeys = null,
} = {}) {
  const sourceFileBeforeRead = assertRda104OfficialSourceFile(
    sourceFileEvidence(filePath),
  );
  const workbookXml = unzipMember(filePath, "xl/workbook.xml");
  const relationshipsXml = unzipMember(filePath, "xl/_rels/workbook.xml.rels");
  const worksheetXml = unzipMember(
    filePath,
    worksheetMember(workbookXml, relationshipsXml),
  );
  const sharedStringsXml = unzipMember(filePath, "xl/sharedStrings.xml");
  const sourceFile = assertRdaSourceFileUnchanged(
    sourceFileBeforeRead,
    assertRda104OfficialSourceFile(sourceFileEvidence(filePath)),
  );
  return adaptRda104OfficialWorksheet({
    worksheetXml,
    sharedStringsXml,
    sourceFile,
    fetchedAt,
    selectedItemKeys,
  });
}

export {
  RDA_FILE_NAME,
  RDA_OFFICIAL_DATA_ROW_COUNT,
  RDA_OFFICIAL_FILE_SHA256,
  RDA_OFFICIAL_FILE_SIZE_BYTES,
  RDA_SHEET_NAME,
};
