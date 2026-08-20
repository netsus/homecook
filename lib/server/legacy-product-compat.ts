import { createHash } from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface LegacyProductPlannerRow {
  id: string;
  userId: string;
  columnId: string;
  productId: string;
  productName: string;
  productBrand: string | null;
  quantity: { amount: number; unit: string };
  pinnedNutritionVersionId: string;
  currentNutritionVersionId: string;
}

export interface LegacyCompatibilityReceiptStore<Result> {
  read(scope: string, key: string): Promise<{
    payloadHash: string;
    result: Result;
  } | null>;
  commit(
    scope: string,
    key: string,
    payloadHash: string,
    result: Result,
  ): Promise<void>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function payloadHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

export function listLegacyProductPlannerRows({
  ownerId,
  rows,
  recipeMealIds,
}: {
  ownerId: string;
  rows: LegacyProductPlannerRow[];
  recipeMealIds: string[];
}) {
  const recipeIds = new Set(recipeMealIds);
  return rows
    .filter((row) => row.userId === ownerId && !recipeIds.has(row.id))
    .map((row) => ({
      id: row.id,
      user_id: row.userId,
      column_id: row.columnId,
      product_id: row.productId,
      product_name: row.productName,
      product_brand: row.productBrand,
      quantity: { ...row.quantity },
      product_nutrition_version_id: row.pinnedNutritionVersionId,
      legacy_read_only: true as const,
    }));
}

export function deleteLegacyProductPlannerRow({
  ownerId,
  entryId,
  rows,
}: {
  ownerId: string;
  entryId: string;
  rows: LegacyProductPlannerRow[];
}) {
  const index = rows.findIndex(
    (row) => row.id === entryId && row.userId === ownerId,
  );
  if (index < 0) {
    return {
      ok: false as const,
      code: "RESOURCE_NOT_FOUND" as const,
      mutationCount: 0,
    };
  }
  rows.splice(index, 1);
  return { ok: true as const, deleted: true as const, mutationCount: 1 };
}

export function validateLegacyPlannerOwnerBootstrap({
  owners,
  columns,
  productRows,
}: {
  owners: string[];
  columns: Array<{ id: string; userId: string }>;
  productRows: LegacyProductPlannerRow[];
}) {
  const ownerSet = new Set(owners);
  const columnsById = new Map(columns.map((column) => [column.id, column]));
  const valid = productRows.every((row) => {
    const column = columnsById.get(row.columnId);
    return ownerSet.has(row.userId) && column?.userId === row.userId;
  });
  return valid
    ? { ok: true as const }
    : { ok: false as const, reason: "column_owner_mismatch" as const };
}

export async function executeLegacyCookingMutation<Result>({
  phase,
  scope,
  key,
  canonicalPayload,
  store,
  mutate,
}: {
  phase: "optional" | "required";
  scope: "planner_complete" | "standalone_complete";
  key: string | null;
  canonicalPayload: unknown;
  store: LegacyCompatibilityReceiptStore<Result>;
  mutate(): Promise<Result>;
}) {
  if (key !== null && !UUID_PATTERN.test(key)) {
    return {
      ok: false as const,
      status: 400 as const,
      code: "INVALID_IDEMPOTENCY_KEY" as const,
    };
  }
  if (key === null && phase === "required") {
    return {
      ok: false as const,
      status: 428 as const,
      code: "IDEMPOTENCY_KEY_REQUIRED" as const,
    };
  }
  if (key === null) {
    return { ok: true as const, replayed: false as const, data: await mutate() };
  }

  const hash = payloadHash(canonicalPayload);
  const existing = await store.read(scope, key);
  if (existing) {
    return existing.payloadHash === hash
      ? { ok: true as const, replayed: true as const, data: existing.result }
      : {
          ok: false as const,
          status: 409 as const,
          code: "IDEMPOTENCY_KEY_REUSED" as const,
        };
  }

  const result = await mutate();
  await store.commit(scope, key, hash, result);
  return { ok: true as const, replayed: false as const, data: result };
}

export function readOptionalLegacyIdempotencyKey(
  request: Request,
  headerName = "Idempotency-Key",
) {
  const raw = request.headers.get(headerName)?.trim() ?? "";
  if (!raw) {
    return { ok: true as const, key: null };
  }
  if (!UUID_PATTERN.test(raw)) {
    return { ok: false as const };
  }
  return { ok: true as const, key: raw.toLowerCase() };
}

export function getLegacyCookingIdempotencyPhase(
  _environment: Readonly<Record<string, string | undefined>> = process.env,
): "optional" | "required" {
  void _environment;
  // Activation requires a separately approved code change after the Manual
  // drain/revoke evidence. A runtime flag alone must never cross that gate.
  return "optional" as const;
}
