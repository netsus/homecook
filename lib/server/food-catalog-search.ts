import { createHash } from "node:crypto";

export const FOOD_CATALOG_SEARCH_ALGORITHM_VERSION = 2;
export const FOOD_CATALOG_SEARCH_QUERY_MAX_LENGTH = 120;
export const FOOD_CATALOG_SEARCH_DEFAULT_LIMIT = 20;
export const FOOD_CATALOG_SEARCH_MAX_LIMIT = 50;

export type FoodCatalogSearchType = "ingredient" | "food_product";
export type FoodCatalogSearchSource = "public" | "community" | "mine";
export type FoodCatalogSearchField = { field: string; reason: string };

export interface FoodCatalogSearchTuple {
  algorithm_version: number;
  match_bucket: number;
  coverage_bucket: number;
  quantized_score: number;
  source_partition: number;
  type_partition: number;
  created_at: string;
  stable_id: string;
}

export type FoodCatalogSearchCursor =
  | {
      version: 1;
      created_at: string;
      stable_id: string;
    }
  | {
      version: 2;
      fingerprint: string;
      tuple: FoodCatalogSearchTuple;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSTGRES_UTC_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{1,6})Z$/;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const ALLOWED_QUERY_FIELDS = new Set([
  "q",
  "types",
  "source",
  "cursor",
  "limit",
]);
const TYPE_ORDER: FoodCatalogSearchType[] = ["ingredient", "food_product"];
const ALLOWED_TYPES = new Set<string>(TYPE_ORDER);
const ALLOWED_SOURCES = new Set<string>(["public", "community", "mine"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPostgresTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = POSTGRES_UTC_TIMESTAMP_PATTERN.exec(value);
  if (!match || match[1].startsWith("0000-")) return false;
  const millisecondIso =
    `${match[1]}.${match[2].padEnd(3, "0").slice(0, 3)}Z`;
  const date = new Date(millisecondIso);
  return !Number.isNaN(date.getTime()) && date.toISOString() === millisecondIso;
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

export function normalizeFoodCatalogSearchQuery(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .trim()
    .replace(/\s+/gu, " ");
}

export function buildFoodCatalogSearchFingerprint({
  q,
  types,
  source,
}: {
  q: string;
  types: FoodCatalogSearchType[];
  source: FoodCatalogSearchSource | null;
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      q,
      types: TYPE_ORDER.filter((type) => types.includes(type)),
      source: source ?? "all",
    }))
    .digest("hex");
}

function parseV2Tuple(value: unknown): FoodCatalogSearchTuple | null {
  if (!isRecord(value)) return null;
  if (
    value.algorithm_version !== FOOD_CATALOG_SEARCH_ALGORITHM_VERSION
    || !isBoundedInteger(value.match_bucket, 0, 9)
    || !isBoundedInteger(value.coverage_bucket, 0, 9)
    || !isBoundedInteger(value.quantized_score, 0, 1_000_000)
    || !isBoundedInteger(value.source_partition, 0, 9)
    || !isBoundedInteger(value.type_partition, 0, 9)
    || !isPostgresTimestamp(value.created_at)
    || typeof value.stable_id !== "string"
    || !UUID_PATTERN.test(value.stable_id)
  ) {
    return null;
  }

  return {
    algorithm_version: value.algorithm_version,
    match_bucket: value.match_bucket,
    coverage_bucket: value.coverage_bucket,
    quantized_score: value.quantized_score,
    source_partition: value.source_partition,
    type_partition: value.type_partition,
    created_at: value.created_at,
    stable_id: value.stable_id,
  };
}

export function encodeFoodCatalogSearchCursor(
  cursor: Extract<FoodCatalogSearchCursor, { version: 2 }>,
) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeFoodCatalogSearchCursor(
  value: string,
  expectedFingerprint: string,
): FoodCatalogSearchCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
    if (!isRecord(parsed)) return null;

    if ("version" in parsed) {
      if (
        parsed.version !== 2
        || typeof parsed.fingerprint !== "string"
        || !FINGERPRINT_PATTERN.test(parsed.fingerprint)
        || parsed.fingerprint !== expectedFingerprint
      ) {
        return null;
      }
      const tuple = parseV2Tuple(parsed.tuple);
      return tuple
        ? { version: 2, fingerprint: parsed.fingerprint, tuple }
        : null;
    }

    if (
      !isPostgresTimestamp(parsed.created_at)
      || typeof parsed.id !== "string"
      || !UUID_PATTERN.test(parsed.id)
    ) {
      return null;
    }
    return {
      version: 1,
      created_at: parsed.created_at,
      stable_id: parsed.id,
    };
  } catch {
    return null;
  }
}

export function parseFoodCatalogSearchQuery(params: URLSearchParams):
  | {
      ok: true;
      value: {
        q: string;
        types: FoodCatalogSearchType[];
        source: FoodCatalogSearchSource | null;
        cursor: FoodCatalogSearchCursor | null;
        fingerprint: string;
        limit: number;
      };
    }
  | {
      ok: false;
      code: "INVALID_SEARCH_FILTER";
      fields: FoodCatalogSearchField[];
    } {
  const fields: FoodCatalogSearchField[] = [];
  for (const key of new Set(params.keys())) {
    if (!ALLOWED_QUERY_FIELDS.has(key)) {
      fields.push({ field: key, reason: "unsupported_filter" });
    }
    if (params.getAll(key).length > 1) {
      fields.push({ field: key, reason: "duplicate_filter" });
    }
  }

  const q = normalizeFoodCatalogSearchQuery(params.get("q") ?? "");
  if ([...q].length > FOOD_CATALOG_SEARCH_QUERY_MAX_LENGTH) {
    fields.push({ field: "q", reason: "max_length" });
  }

  const rawTypes = params.get("types");
  const requestedTypes = rawTypes?.split(",").map((type) => type.trim()) ?? [];
  if (
    requestedTypes.length === 0
    || requestedTypes.some((type) => !ALLOWED_TYPES.has(type))
    || new Set(requestedTypes).size !== requestedTypes.length
  ) {
    fields.push({ field: "types", reason: "unsupported_types" });
  }
  const types = TYPE_ORDER.filter((type) => requestedTypes.includes(type));

  const rawSource = params.get("source")?.trim() ?? "";
  if (rawSource && !ALLOWED_SOURCES.has(rawSource)) {
    fields.push({ field: "source", reason: "unsupported_source" });
  }
  const source = rawSource
    ? rawSource as FoodCatalogSearchSource
    : null;

  const rawLimit = params.get("limit")?.trim() ?? "";
  const limit = rawLimit ? Number(rawLimit) : FOOD_CATALOG_SEARCH_DEFAULT_LIMIT;
  if (
    !Number.isInteger(limit)
    || limit < 1
    || limit > FOOD_CATALOG_SEARCH_MAX_LIMIT
  ) {
    fields.push({ field: "limit", reason: "integer_between_1_and_50" });
  }

  const fingerprint = buildFoodCatalogSearchFingerprint({ q, types, source });
  const rawCursor = params.get("cursor")?.trim() ?? "";
  const cursor = rawCursor
    ? decodeFoodCatalogSearchCursor(rawCursor, fingerprint)
    : null;
  if (rawCursor && !cursor) {
    fields.push({ field: "cursor", reason: "invalid_cursor" });
  }
  if (
    cursor?.version === 1
    && (types.length !== 1 || types[0] !== "food_product")
  ) {
    fields.push({
      field: "cursor",
      reason: "legacy_product_cursor_requires_food_product_only",
    });
  }

  if (fields.length > 0) {
    return {
      ok: false,
      code: "INVALID_SEARCH_FILTER",
      fields: fields
        .filter(
          (field, index, all) =>
            all.findIndex(
              (candidate) =>
                candidate.field === field.field
                && candidate.reason === field.reason,
            ) === index,
        )
        .sort((left, right) => left.field.localeCompare(right.field)),
    };
  }

  return {
    ok: true,
    value: { q, types, source, cursor, fingerprint, limit },
  };
}

export function parseFoodCatalogSearchTuple(value: unknown) {
  return parseV2Tuple(value);
}
