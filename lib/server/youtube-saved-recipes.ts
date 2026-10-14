import { fail, ok } from "@/lib/api/response";
import { isQuantityInputDraft, isQuantityInputSnapshot } from "@/lib/quantity-input";
import { quantityInputContractRequested, quantityInputWriteEnabled } from "@/lib/server/quantity-input";
import {
  readVerifiedAccountGenerationSession,
} from "@/lib/server/account-generation/session-authority";
import {
  buildSessionAuthorityRpcArgs,
  readRequiredIdempotencyKey,
} from "@/lib/server/recipe-content-snapshot-future-propagation";
import {
  createRecipeFuturePropagationInternalClient,
  createRouteHandlerClient,
} from "@/lib/supabase/server";
import type {
  YoutubeSavedRecipeEditableContent,
  YoutubeSavedRecipeIngredientInput,
  YoutubeSavedRecipeStepInput,
} from "@/types/youtube-saved-recipe";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ValidationField = { field: string; reason: string };

interface RpcResult {
  data: unknown;
  error: unknown;
}

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

interface RpcEnvelope {
  success: boolean;
  data: unknown;
  error: { code?: string; message?: string } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseIngredient(
  value: unknown,
  index: number,
  fields: ValidationField[],
  quantityContract: boolean,
): YoutubeSavedRecipeIngredientInput | null {
  const field = `content.ingredients[${index}]`;
  const keys = [
    "row_id",
    "source_draft_ingredient_id",
    "standard_name",
    "quantity_mode",
    "amount",
    "unit",
    "display_text",
    "component_label",
  ];
  if (isRecord(value) && "quantity_input" in value) keys.push("quantity_input");
  if (isRecord(value) && "quantity_context_fingerprint" in value) keys.push("quantity_context_fingerprint");
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    fields.push({ field, reason: "invalid_shape" });
    return null;
  }
  if (!isUuid(value.row_id)) fields.push({ field: `${field}.row_id`, reason: "invalid_uuid" });
  if (value.source_draft_ingredient_id !== null && !isUuid(value.source_draft_ingredient_id)) {
    fields.push({ field: `${field}.source_draft_ingredient_id`, reason: "invalid_uuid" });
  }
  const name = typeof value.standard_name === "string" ? value.standard_name.trim() : "";
  if (!name || name.length > 100) fields.push({ field: `${field}.standard_name`, reason: "invalid_text" });
  if (value.quantity_mode !== "unknown" && value.quantity_mode !== "to_taste" && value.quantity_mode !== "quantity") {
    fields.push({ field: `${field}.quantity_mode`, reason: "invalid_enum" });
  }
  if (value.amount !== null && (typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount <= 0)) {
    fields.push({ field: `${field}.amount`, reason: "positive_number_or_null_required" });
  }
  if (!isNullableString(value.unit) || (typeof value.unit === "string" && value.unit.trim().length > 20)) {
    fields.push({ field: `${field}.unit`, reason: "invalid_text" });
  }
  if (!isNullableString(value.display_text) || (typeof value.display_text === "string" && value.display_text.length > 200)) {
    fields.push({ field: `${field}.display_text`, reason: "invalid_text" });
  }
  if (!isNullableString(value.component_label) || (typeof value.component_label === "string" && value.component_label.length > 100)) {
    fields.push({ field: `${field}.component_label`, reason: "invalid_text" });
  }
  if (value.quantity_mode === "to_taste" && (value.amount !== null || value.unit !== null)) {
    fields.push({ field: `${field}.quantity_mode`, reason: "to_taste_requires_empty_quantity" });
  }
  if (value.quantity_mode === "quantity" && (typeof value.amount !== "number" || value.amount <= 0 || typeof value.unit !== "string" || !value.unit.trim())) {
    fields.push({ field: `${field}.quantity_mode`, reason: "quantity_requires_amount_and_unit" });
  }
  if ("quantity_input" in value) {
    if (!quantityContract) fields.push({ field: `${field}.quantity_input`, reason: "quantity_contract_required" });
    else if (value.quantity_input !== null) {
      const quantity = { amount: Number(value.amount), unit: String(value.unit ?? "") };
      const input = value.quantity_input;
      const raw = isRecord(input) ? { schema_version: input.schema_version, raw_value: input.raw_value, raw_unit: input.raw_unit } : null;
      const draft = isRecord(input) && hasExactKeys(input, ["schema_version", "raw_value", "raw_unit", "expected_context_fingerprint"])
        && typeof input.expected_context_fingerprint === "string" && /^[a-f0-9]{64}$/u.test(input.expected_context_fingerprint)
        && isQuantityInputDraft(raw, quantity);
      if (!draft && !isQuantityInputSnapshot(input, quantity)) fields.push({ field: `${field}.quantity_input`, reason: "invalid_quantity_input" });
    }
  }
  if ("quantity_context_fingerprint" in value && (!quantityContract || typeof value.quantity_context_fingerprint !== "string"
    || !/^[a-f0-9]{64}$/u.test(value.quantity_context_fingerprint))) fields.push({ field: `${field}.quantity_context_fingerprint`, reason: "invalid_context_stamp" });
  if (fields.some((item) => item.field === field || item.field.startsWith(`${field}.`))) return null;
  const parsed: YoutubeSavedRecipeIngredientInput = {
    row_id: value.row_id as string,
    source_draft_ingredient_id: value.source_draft_ingredient_id as string | null,
    standard_name: name,
    quantity_mode: value.quantity_mode as "unknown" | "to_taste" | "quantity",
    amount: value.amount as number | null,
    unit: typeof value.unit === "string" ? value.unit.trim() || null : null,
    display_text: typeof value.display_text === "string" ? value.display_text.trim() || null : null,
    component_label: typeof value.component_label === "string" ? value.component_label.trim() || null : null,
  };
  // The strict runtime checks above distinguish a raw draft, a stored snapshot
  // echo and explicit null. SQL revalidates every server-held source relation.
  if ("quantity_input" in value) parsed.quantity_input = value.quantity_input as YoutubeSavedRecipeIngredientInput["quantity_input"];
  if (typeof value.quantity_context_fingerprint === "string") parsed.quantity_context_fingerprint = value.quantity_context_fingerprint;
  return parsed;
}

function parseStep(
  value: unknown,
  index: number,
  fields: ValidationField[],
): YoutubeSavedRecipeStepInput | null {
  const field = `content.steps[${index}]`;
  if (!isRecord(value) || !hasExactKeys(value, [
    "row_id",
    "source_step_index",
    "instruction",
    "component_label",
    "duration_text",
  ])) {
    fields.push({ field, reason: "invalid_shape" });
    return null;
  }
  if (!isUuid(value.row_id)) fields.push({ field: `${field}.row_id`, reason: "invalid_uuid" });
  if (value.source_step_index !== null && (!Number.isSafeInteger(value.source_step_index) || Number(value.source_step_index) < 0)) {
    fields.push({ field: `${field}.source_step_index`, reason: "non_negative_integer_or_null_required" });
  }
  const instruction = typeof value.instruction === "string" ? value.instruction.trim() : "";
  if (!instruction || instruction.length > 10_000) fields.push({ field: `${field}.instruction`, reason: "invalid_text" });
  if (!isNullableString(value.component_label) || (typeof value.component_label === "string" && value.component_label.length > 100)) {
    fields.push({ field: `${field}.component_label`, reason: "invalid_text" });
  }
  if (!isNullableString(value.duration_text) || (typeof value.duration_text === "string" && value.duration_text.length > 100)) {
    fields.push({ field: `${field}.duration_text`, reason: "invalid_text" });
  }
  if (fields.some((item) => item.field === field || item.field.startsWith(`${field}.`))) return null;
  return {
    row_id: value.row_id as string,
    source_step_index: value.source_step_index as number | null,
    instruction,
    component_label: typeof value.component_label === "string" ? value.component_label.trim() || null : null,
    duration_text: typeof value.duration_text === "string" ? value.duration_text.trim() || null : null,
  };
}

function parseContent(value: unknown, quantityContract = false): { content: YoutubeSavedRecipeEditableContent | null; fields: ValidationField[] } {
  const fields: ValidationField[] = [];
  if (!isRecord(value) || !hasExactKeys(value, ["title", "base_servings", "tags", "ingredients", "steps"])) {
    return { content: null, fields: [{ field: "content", reason: "invalid_shape" }] };
  }
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title || title.length > 200) fields.push({ field: "content.title", reason: "invalid_text" });
  if (!Number.isSafeInteger(value.base_servings) || Number(value.base_servings) <= 0) {
    fields.push({ field: "content.base_servings", reason: "positive_integer_required" });
  }
  const tags = Array.isArray(value.tags) ? value.tags : [];
  if (!Array.isArray(value.tags) || tags.length > 20 || tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.trim().length > 50)) {
    fields.push({ field: "content.tags", reason: "invalid_string_array" });
  }
  if (!Array.isArray(value.ingredients) || value.ingredients.length > 200) {
    fields.push({ field: "content.ingredients", reason: "invalid_array" });
  }
  if (!Array.isArray(value.steps) || value.steps.length > 200) {
    fields.push({ field: "content.steps", reason: "invalid_array" });
  }
  const ingredients = Array.isArray(value.ingredients)
    ? value.ingredients.map((item, index) => parseIngredient(item, index, fields, quantityContract)).filter((item): item is YoutubeSavedRecipeIngredientInput => item !== null)
    : [];
  const steps = Array.isArray(value.steps)
    ? value.steps.map((item, index) => parseStep(item, index, fields)).filter((item): item is YoutubeSavedRecipeStepInput => item !== null)
    : [];
  if (new Set(ingredients.map((item) => item.row_id)).size !== ingredients.length) {
    fields.push({ field: "content.ingredients", reason: "duplicate_row_id" });
  }
  const sourceIngredientIds = ingredients.flatMap((item) => item.source_draft_ingredient_id ? [item.source_draft_ingredient_id] : []);
  if (new Set(sourceIngredientIds).size !== sourceIngredientIds.length) {
    fields.push({ field: "content.ingredients", reason: "duplicate_source_row" });
  }
  if (new Set(steps.map((item) => item.row_id)).size !== steps.length) {
    fields.push({ field: "content.steps", reason: "duplicate_row_id" });
  }
  const sourceStepIndexes = steps.flatMap((item) => item.source_step_index === null ? [] : [item.source_step_index]);
  if (new Set(sourceStepIndexes).size !== sourceStepIndexes.length) {
    fields.push({ field: "content.steps", reason: "duplicate_source_row" });
  }
  if (fields.length > 0) return { content: null, fields };
  return {
    content: {
      title,
      base_servings: Number(value.base_servings),
      tags: tags.map((tag) => (tag as string).trim()),
      ingredients,
      steps,
    },
    fields,
  };
}

async function readBody(request: Request) {
  try {
    return await request.json() as unknown;
  } catch {
    return null;
  }
}

async function requireAuthority() {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;
  if (!user) return { ok: false as const, response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401) };
  const verified = await readVerifiedAccountGenerationSession(routeClient, user);
  if (!verified.ok || verified.sessionAuthority.ownerUuid !== user.id) {
    return { ok: false as const, response: fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409) };
  }
  const internalClient = createRecipeFuturePropagationInternalClient();
  if (!internalClient) return { ok: false as const, response: fail("INTERNAL_ERROR", "저장 결과를 처리하지 못했어요.", 500) };
  return { ok: true as const, authority: verified.sessionAuthority, client: internalClient as RpcClient };
}

function parseEnvelope(value: unknown): RpcEnvelope | null {
  if (!isRecord(value) || typeof value.success !== "boolean" || !(value.error === null || isRecord(value.error))) return null;
  return value as unknown as RpcEnvelope;
}

function rpcFailure(error: RpcEnvelope["error"]) {
  const code = error?.code ?? "INTERNAL_ERROR";
  const contracts: Record<string, { message: string; status: number }> = {
    ACCOUNT_SESSION_STALE: { message: "세션을 다시 확인해 주세요.", status: 409 },
    CONFLICT: { message: "저장 결과가 변경됐어요. 최신 내용을 다시 확인해 주세요.", status: 409 },
    EXTRACTION_EXPIRED: { message: "추출 결과가 만료됐어요. 다시 가져와 주세요.", status: 410 },
    IDEMPOTENCY_KEY_REUSED: { message: "이미 다른 요청에 사용한 요청 키예요.", status: 409 },
    RESOURCE_NOT_FOUND: { message: "저장 결과를 찾을 수 없어요.", status: 404 },
    VALIDATION_ERROR: { message: "저장할 내용을 확인해 주세요.", status: 422 },
    UNIT_POLICY_INACTIVE: { message: "단위 입력을 수정할 준비가 되지 않았어요.", status: 503 },
    UNIT_CONVERSION_MISSING: { message: "그 단위로 바꿀 근거가 없어요. 현재 양을 유지해 주세요.", status: 422 },
    QUANTITY_CONTEXT_CHANGED: { message: "단위 근거가 바뀌었어요. 최신 내용을 다시 확인해 주세요.", status: 409 },
    QUANTITY_INPUT_REQUIRED: { message: "원입력을 유지하려면 화면을 다시 열고 수정해 주세요.", status: 409 },
  };
  const contract = contracts[code] ?? { message: "저장 결과를 처리하지 못했어요.", status: 500 };
  return fail(code, error?.message ?? contract.message, contract.status);
}

function projectQuantityRead(data: unknown, requested: boolean, writeEnabled: boolean): unknown {
  if (!isRecord(data) || !isRecord(data.content) || !Array.isArray(data.content.ingredients)) return data;
  const output = { ...data };
  if (!requested) {
    delete output.quantity_policy; delete output.quantity_contexts;
    output.content = { ...data.content, ingredients: data.content.ingredients.map(value => {
      if (!isRecord(value)) return value;
      const row = { ...value }; delete row.quantity_input; delete row.quantity_context_fingerprint;
      return row;
    }) };
  } else if ("quantity_policy" in output && !writeEnabled) output.quantity_policy = null;
  return output;
}

function newQuantityWrite(content: YoutubeSavedRecipeEditableContent): boolean {
  return content.ingredients.some(row => "quantity_input" in row && (row.quantity_input === null
    || !isQuantityInputSnapshot(row.quantity_input, row.amount !== null && row.unit !== null ? { amount: row.amount, unit: row.unit } : undefined)));
}

async function callRpc(client: RpcClient, name: string, args: Record<string, unknown>, quantityRequest?: Request) {
  const result = await client.rpc(name, args);
  if (result.error) {
    const text = isRecord(result.error)
      ? [result.error.code, result.error.message, result.error.details, result.error.hint]
        .filter((value): value is string => typeof value === "string").join(" ")
      : String(result.error);
    const code = [
      "ACCOUNT_SESSION_STALE",
      "CONFLICT",
      "EXTRACTION_EXPIRED",
      "IDEMPOTENCY_KEY_REUSED",
      "RESOURCE_NOT_FOUND",
      "VALIDATION_ERROR",
      "UNIT_POLICY_INACTIVE", "UNIT_CONVERSION_MISSING", "QUANTITY_CONTEXT_CHANGED", "QUANTITY_INPUT_REQUIRED",
    ].find((candidate) => text.includes(candidate));
    return code ? rpcFailure({ code }) : fail("INTERNAL_ERROR", "저장 결과를 처리하지 못했어요.", 500);
  }
  const envelope = parseEnvelope(result.data);
  if (!envelope) return fail("INTERNAL_ERROR", "저장 결과 응답을 확인하지 못했어요.", 500);
  return envelope.success ? ok(projectQuantityRead(envelope.data, Boolean(quantityRequest && quantityInputContractRequested(quantityRequest)),
    Boolean(quantityRequest && quantityInputWriteEnabled(quantityRequest)))) : rpcFailure(envelope.error);
}

export async function handleCreateYoutubeSavedRecipe(request: Request) {
  const idempotency = readRequiredIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;
  const raw = await readBody(request);
  if (!isRecord(raw) || !isUuid(raw.extraction_id)) {
    return fail("VALIDATION_ERROR", "저장할 내용을 확인해 주세요.", 422, [{ field: "body", reason: "invalid_shape" }]);
  }
  if (hasExactKeys(raw, ["extraction_id"])) {
    const access = await requireAuthority();
    if (!access.ok) return access.response;
    return callRpc(access.client, "ensure_youtube_saved_recipe_result", {
      ...buildSessionAuthorityRpcArgs(access.authority),
      p_extraction_id: raw.extraction_id,
      p_idempotency_key: idempotency.key,
    }, request);
  }
  if (!hasExactKeys(raw, ["extraction_id", "content"])) {
    return fail("VALIDATION_ERROR", "저장할 내용을 확인해 주세요.", 422, [{ field: "body", reason: "invalid_shape" }]);
  }
  const parsed = parseContent(raw.content, quantityInputContractRequested(request));
  if (!parsed.content) return fail("VALIDATION_ERROR", "저장할 내용을 확인해 주세요.", 422, parsed.fields);
  const access = await requireAuthority();
  if (!access.ok) return access.response;
  if (newQuantityWrite(parsed.content) && !quantityInputWriteEnabled(request)) return rpcFailure({ code: "UNIT_POLICY_INACTIVE" });
  return callRpc(access.client, "write_youtube_saved_recipe_result", {
    ...buildSessionAuthorityRpcArgs(access.authority),
    p_action: "create",
    p_result_id: null,
    p_extraction_id: raw.extraction_id,
    p_expected_revision: null,
    p_editable_content: parsed.content,
    p_idempotency_key: idempotency.key,
  }, request);
}

export async function handleListYoutubeSavedRecipes() {
  const access = await requireAuthority();
  if (!access.ok) return access.response;
  return callRpc(access.client, "read_youtube_saved_recipe_results", {
    ...buildSessionAuthorityRpcArgs(access.authority),
    p_result_id: null,
  });
}

export async function handleGetYoutubeSavedRecipe(draftId: string, request?: Request) {
  if (!isUuid(draftId)) return fail("RESOURCE_NOT_FOUND", "저장 결과를 찾을 수 없어요.", 404);
  const access = await requireAuthority();
  if (!access.ok) return access.response;
  return callRpc(access.client, "read_youtube_saved_recipe_results", {
    ...buildSessionAuthorityRpcArgs(access.authority),
    p_result_id: draftId,
  }, request);
}

export async function handleUpdateYoutubeSavedRecipe(request: Request, draftId: string) {
  if (!isUuid(draftId)) return fail("RESOURCE_NOT_FOUND", "저장 결과를 찾을 수 없어요.", 404);
  const idempotency = readRequiredIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;
  const raw = await readBody(request);
  if (!isRecord(raw) || !hasExactKeys(raw, ["expected_revision", "content"]) || !Number.isSafeInteger(raw.expected_revision) || Number(raw.expected_revision) <= 0) {
    return fail("VALIDATION_ERROR", "저장할 내용을 확인해 주세요.", 422, [{ field: "body", reason: "invalid_shape" }]);
  }
  const parsed = parseContent(raw.content, quantityInputContractRequested(request));
  if (!parsed.content) return fail("VALIDATION_ERROR", "저장할 내용을 확인해 주세요.", 422, parsed.fields);
  const access = await requireAuthority();
  if (!access.ok) return access.response;
  if (newQuantityWrite(parsed.content) && !quantityInputWriteEnabled(request)) return rpcFailure({ code: "UNIT_POLICY_INACTIVE" });
  return callRpc(access.client, "write_youtube_saved_recipe_result", {
    ...buildSessionAuthorityRpcArgs(access.authority),
    p_action: "update",
    p_result_id: draftId,
    p_extraction_id: null,
    p_expected_revision: raw.expected_revision,
    p_editable_content: parsed.content,
    p_idempotency_key: idempotency.key,
  }, request);
}
