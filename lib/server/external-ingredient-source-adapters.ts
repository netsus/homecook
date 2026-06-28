import type { IngredientCategory } from "@/lib/ingredient-categories";
import type { ExternalIngredientSourceRow } from "@/lib/server/external-ingredient-ingest";

export interface DataGoKrNutritionStandardRow {
  FOOD_CD?: unknown;
  FOOD_NM?: unknown;
  TYPE_NM?: unknown;
  SRC_NM?: unknown;
  INSTT_NM?: unknown;
  FOOD_LV3_NM?: unknown;
  FOOD_LV4_NM?: unknown;
  FOOD_LV5_NM?: unknown;
  FOOD_LV6_NM?: unknown;
  CRTR_YMD?: unknown;
  [key: string]: unknown;
}

export interface DataGoKrNutritionSourceOptions {
  sourceFile: string;
  sourceVersion?: string | null;
  sourceDate?: string | null;
  sourceLicense?: string | null;
}

export interface RdaFoodCompositionRow {
  fdCode?: unknown;
  fdGrupp?: unknown;
  fdGruppNm?: unknown;
  fdNm?: unknown;
  originNm?: unknown;
  [key: string]: unknown;
}

export interface RdaFoodCompositionSourceOptions {
  sourceFile: string;
  sourceVersion?: string | null;
  sourceDate?: string | null;
  sourceLicense?: string | null;
}

const EMPTY_LEVEL_VALUES = new Set(["", "0", "00", "해당없음", "해당 없음", "기타"]);
const GENERIC_LEVEL_NAMES = new Set(["파"]);

function stringOrNull(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function fieldText(row: DataGoKrNutritionStandardRow, keys: Array<keyof DataGoKrNutritionStandardRow>) {
  return keys
    .map((key) => stringOrNull(row[key]))
    .filter(Boolean)
    .join(" ");
}

function meaningfulLevel(value: unknown) {
  const text = stringOrNull(value);

  if (!text || EMPTY_LEVEL_VALUES.has(text)) return null;

  return text;
}

function inferDataGoKrSourceSystem(row: DataGoKrNutritionStandardRow) {
  const sourceText = fieldText(row, ["SRC_NM", "INSTT_NM"]);

  if (/식품의약품안전처|식약처/.test(sourceText)) return "mfds";
  if (/농촌진흥청|국가표준식품성분표|농식품올바로/.test(sourceText)) return "rda";
  if (/국립수산과학원|수산/.test(sourceText)) return "nifs";

  return "data-go-kr";
}

function inferLegacyCategoryFromDataGoKrNutritionRow(
  row: DataGoKrNutritionStandardRow,
): IngredientCategory {
  const categoryText = fieldText(row, [
    "TYPE_NM",
    "FOOD_LV3_NM",
    "FOOD_LV4_NM",
    "FOOD_LV5_NM",
    "FOOD_LV6_NM",
  ]);

  if (/수산|어패|해조|해산|생선|어류|패류|갑각|연체/.test(categoryText)) return "해산물";
  if (/육류|축산|닭고기|돼지고기|소고기|쇠고기|난류|달걀|계란/.test(categoryText)) {
    return "육류";
  }
  if (/과일|과실|딸기|사과|배|바나나|감귤|귤|오렌지|레몬|라임|포도|복숭아/.test(categoryText)) {
    return "과일";
  }
  if (/우유|유제품|유가공|치즈|버터|크림/.test(categoryText)) return "유제품";
  if (/곡류|쌀|현미|보리|밀|두류|서류|감자|고구마|전분|견과|종실|콩류/.test(categoryText)) {
    return "곡류";
  }
  if (/채소|버섯|나물|엽채|근채|양파|마늘|대파|쪽파|고추|배추/.test(categoryText)) {
    return "채소";
  }
  if (/조미|장류|소스|양념|유지|식용유|고춧가루|소금|설탕|식초/.test(categoryText)) {
    return "양념";
  }

  return "기타";
}

export function chooseDataGoKrIngredientName(row: DataGoKrNutritionStandardRow) {
  const foodName = stringOrNull(row.FOOD_NM) ?? "";
  const level4 = meaningfulLevel(row.FOOD_LV4_NM);
  const level5 = meaningfulLevel(row.FOOD_LV5_NM);
  const level6 = meaningfulLevel(row.FOOD_LV6_NM);

  if (level4 && (level4.endsWith("류") || GENERIC_LEVEL_NAMES.has(level4)) && level5) {
    return level5;
  }

  return level4 ?? level5 ?? level6 ?? foodName;
}

export function mapDataGoKrNutritionRowsToExternalIngredientSourceRows(
  rows: DataGoKrNutritionStandardRow[],
  options: DataGoKrNutritionSourceOptions,
): ExternalIngredientSourceRow[] {
  return rows.map((row, rowIndex) => ({
    row_index: rowIndex,
    source_system: inferDataGoKrSourceSystem(row),
    source_file: options.sourceFile,
    source_version: options.sourceVersion ?? null,
    source_date: stringOrNull(row.CRTR_YMD) ?? options.sourceDate ?? null,
    source_license: options.sourceLicense ?? null,
    source_row_id: stringOrNull(row.FOOD_CD),
    original_name: chooseDataGoKrIngredientName(row),
    legacy_category: inferLegacyCategoryFromDataGoKrNutritionRow(row),
    raw_payload: row,
  }));
}

function inferLegacyCategoryFromRdaFoodGroup(row: RdaFoodCompositionRow): IngredientCategory {
  const groupCode = stringOrNull(row.fdGrupp);
  const groupName = stringOrNull(row.fdGruppNm) ?? "";

  if (groupCode === "K" || groupCode === "L" || /어패|수산|해조|해산/.test(groupName)) {
    return "해산물";
  }
  if (groupCode === "I" || groupCode === "J" || /육류|난류|달걀|계란/.test(groupName)) {
    return "육류";
  }
  if (groupCode === "M" || /우유|유제품/.test(groupName)) return "유제품";
  if (["A", "B", "D", "E"].includes(groupCode ?? "") || /곡류|감자|전분|두류|견과/.test(groupName)) {
    return "곡류";
  }
  if (groupCode === "F" || groupCode === "G" || /채소|버섯/.test(groupName)) return "채소";
  if (groupCode === "N" || groupCode === "R" || /유지|조미료/.test(groupName)) return "양념";

  return "기타";
}

export function chooseRdaFoodCompositionIngredientName(row: RdaFoodCompositionRow) {
  const foodName = stringOrNull(row.fdNm) ?? "";
  const parts = foodName
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts[0] && GENERIC_LEVEL_NAMES.has(parts[0]) && parts[1]) {
    return parts[1];
  }

  return parts[0] ?? foodName;
}

export function mapRdaFoodCompositionRowsToExternalIngredientSourceRows(
  rows: RdaFoodCompositionRow[],
  options: RdaFoodCompositionSourceOptions,
): ExternalIngredientSourceRow[] {
  return rows.map((row, rowIndex) => ({
    row_index: rowIndex,
    source_system: "rda",
    source_file: options.sourceFile,
    source_version: options.sourceVersion ?? stringOrNull(row.originNm),
    source_date: options.sourceDate ?? null,
    source_license: options.sourceLicense ?? null,
    source_row_id: stringOrNull(row.fdCode),
    original_name: chooseRdaFoodCompositionIngredientName(row),
    legacy_category: inferLegacyCategoryFromRdaFoodGroup(row),
    raw_payload: row,
  }));
}
