import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const createRecipeFuturePropagationInternalClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRecipeFuturePropagationInternalClient,
}));

const ingredientId = "550e8400-e29b-41d4-a716-446655440010";
const methodId = "550e8400-e29b-41d4-a716-446655440020";
const imageObjectId = "550e8400-e29b-41d4-a716-446655440030";

function ownerProjection() {
  return {
    revision: 12,
    edit_context: {
      base_recipe_revision: 12,
      draft: {
        title: "현재 김치찌개",
        description: null,
        base_servings: 2,
        ingredients: [{
          ingredient_id: ingredientId,
          amount: 1,
          unit: null,
          ingredient_type: "QUANT",
          display_text: null,
          component_label: null,
          scalable: true,
          food_product_id: null,
          food_product_nutrition_version_id: null,
        }],
        steps: [{
          step_number: 1,
          instruction: "끓여요.",
          cooking_method_id: methodId,
          cooking_method_ids: [methodId],
          ingredients_used: [{
            ingredient_id: ingredientId,
            amount: null,
            unit: null,
            cut_size: null,
          }],
          component_label: null,
          heat_level: null,
          duration_seconds: null,
          duration_text: null,
        }],
      },
      image_object_id: imageObjectId,
    },
  };
}

describe("recipe snapshot server-only entrypoint projection", () => {
  beforeEach(() => {
    vi.resetModules();
    createRecipeFuturePropagationInternalClient.mockReset();
  });

  it.each([
    [{ data: "snapshot_v2", error: null }, "snapshot_v2"],
    [{ data: "legacy_v1", error: null }, "legacy_v1"],
    [{ data: null, error: null }, "legacy_v1"],
    [{ data: "unknown", error: null }, "legacy_v1"],
    [{ data: null, error: { message: "read failed" } }, "legacy_v1"],
  ] as const)("fails closed without exposing raw capability values", async (rpcResult, expected) => {
    const rpc = vi.fn(async () => rpcResult);
    createRecipeFuturePropagationInternalClient.mockReturnValue({ rpc });

    const { readRecipeSnapshotUiMode } = await import(
      "@/lib/server/recipe-snapshot-entrypoint"
    );

    await expect(readRecipeSnapshotUiMode()).resolves.toBe(expected);
    expect(rpc).toHaveBeenCalledWith("read_recipe_snapshot_ui_mode");
  });

  it("returns legacy_v1 when the server-only client is unavailable", async () => {
    createRecipeFuturePropagationInternalClient.mockReturnValue(null);
    const { readRecipeSnapshotUiMode } = await import(
      "@/lib/server/recipe-snapshot-entrypoint"
    );

    await expect(readRecipeSnapshotUiMode()).resolves.toBe("legacy_v1");
  });

  it("accepts only the exact positive-revision owner edit projection", async () => {
    const rpc = vi.fn(async () => ({ data: ownerProjection(), error: null }));
    createRecipeFuturePropagationInternalClient.mockReturnValue({ rpc });
    const { readRecipeSnapshotEntrypointContext } = await import(
      "@/lib/server/recipe-snapshot-entrypoint"
    );
    const authority = {
      authIdentityCreatedAt: "2026-08-01T00:00:00.000Z",
      hmacKeyVersion: 1,
      ownerUuid: "550e8400-e29b-41d4-a716-446655440001",
      sessionIssuedAt: "2026-08-03T00:00:00.000Z",
      sessionKeyHash: "a".repeat(64),
    };

    await expect(readRecipeSnapshotEntrypointContext({
      recipeId: "550e8400-e29b-41d4-a716-446655440002",
      sessionAuthority: authority,
    })).resolves.toEqual(ownerProjection());
    expect(rpc).toHaveBeenCalledWith("read_recipe_snapshot_entrypoint_context", {
      p_auth_identity_created_at_snapshot: authority.authIdentityCreatedAt,
      p_hmac_key_version: authority.hmacKeyVersion,
      p_owner_uuid: authority.ownerUuid,
      p_recipe_id: "550e8400-e29b-41d4-a716-446655440002",
      p_session_issued_at: authority.sessionIssuedAt,
      p_session_key_hash: authority.sessionKeyHash,
    });
  });

  it.each([
    { ...ownerProjection(), revision: 0 },
    { ...ownerProjection(), edit_context: { ...ownerProjection().edit_context, base_recipe_revision: 11 } },
    {
      ...ownerProjection(),
      edit_context: {
        ...ownerProjection().edit_context,
        draft: {
          ...ownerProjection().edit_context.draft,
          steps: [{
            ...ownerProjection().edit_context.draft.steps[0],
            ingredients_used: [{ ingredient_id: ingredientId, amount: null, unit: null }],
          }],
        },
      },
    },
  ])("rejects malformed or cross-revision owner context", async (data) => {
    createRecipeFuturePropagationInternalClient.mockReturnValue({
      rpc: vi.fn(async () => ({ data, error: null })),
    });
    const { readRecipeSnapshotEntrypointContext } = await import(
      "@/lib/server/recipe-snapshot-entrypoint"
    );

    await expect(readRecipeSnapshotEntrypointContext({
      recipeId: "550e8400-e29b-41d4-a716-446655440002",
      sessionAuthority: {
        authIdentityCreatedAt: "2026-08-01T00:00:00.000Z",
        hmacKeyVersion: 1,
        ownerUuid: "550e8400-e29b-41d4-a716-446655440001",
        sessionIssuedAt: "2026-08-03T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
      },
    })).rejects.toThrow("recipe snapshot entrypoint context is invalid");
  });

  it("keeps both capability reads atomic and denies public execution", () => {
    const sql = readFileSync(join(
      process.cwd(),
      "supabase/migrations/20260804100000_recipe_snapshot_entrypoint_projection.sql",
    ), "utf8");

    expect(sql).toMatch(/select[\s\S]*current_setting\('homecook\.personal_recipe_v2',[\s\S]*current_setting\('homecook\.snapshot_v2_creation'/i);
    expect(sql).toMatch(/then 'snapshot_v2'[\s\S]*else 'legacy_v1'/i);
    expect(sql).toMatch(/revoke all on function public\.read_recipe_snapshot_ui_mode\(\)[\s\S]*from public, anon, authenticated, service_role/i);
    expect(sql).toMatch(/grant execute on function public\.read_recipe_snapshot_ui_mode\(\)[\s\S]*to service_role/i);
    expect(sql).toContain("'cut_size', ingredient_used -> 'cut_size'");
    expect(sql).not.toMatch(/thumbnail_url[\s\S]*image_object_id/i);
  });
});
