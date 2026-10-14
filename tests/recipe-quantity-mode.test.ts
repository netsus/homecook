import { describe, expect, it, vi } from "vitest";
import { readRecipeQuantityMode, RecipeQuantityModeError } from "@/lib/server/recipe-snapshot-entrypoint";
const authority = { ownerUuid: "550e8400-e29b-41d4-a716-446655440001", authIdentityCreatedAt: "2026-01-01T00:00:00Z", sessionKeyHash: "a".repeat(64), hmacKeyVersion: 1, sessionIssuedAt: "2026-01-02T00:00:00Z" };
const recipe = "550e8400-e29b-41d4-a716-446655440002";
const context = { revision: 8, edit_context: { base_recipe_revision: 8, image_object_id: null, draft: { title: "약간 원문", description: null, base_servings: 2, ingredients: [], steps: [] } } };
describe("server-owned recipe calculation mode", () => {
  it.each([false, true])("reuses only the existing signed recipe reader and preserves legacy/v4 mode %s", async v4 => {
    const data = v4 ? { ...context, quantity_policy_version: "quantity-v4" } : context;
    const rpc = vi.fn(async () => ({ data, error: null }));
    expect(await readRecipeQuantityMode({ client: { rpc }, sessionAuthority: authority, recipeId: recipe, expectedRevision: 8 })).toBe(v4);
    expect(rpc).toHaveBeenCalledWith("read_recipe_snapshot_entrypoint_context", { p_owner_uuid: authority.ownerUuid,
      p_auth_identity_created_at_snapshot: authority.authIdentityCreatedAt, p_session_key_hash: authority.sessionKeyHash,
      p_hmac_key_version: 1, p_session_issued_at: authority.sessionIssuedAt, p_recipe_id: recipe });
  });
  it.each([{ ...context, quantity_policy_version: "unverified" }, { ...context, quantity_policy_version: "latest" }, { ...context, owner_uuid: "client-authority" }])("fails closed for unverified or fabricated mode rather than choosing v3", async data => {
    await expect(readRecipeQuantityMode({ client: { rpc: async () => ({ data, error: null }) }, sessionAuthority: authority, recipeId: recipe, expectedRevision: 8 })).rejects.toBeInstanceOf(RecipeQuantityModeError);
  });
  it("requires the current revision and preserves the existing hidden-resource error", async () => {
    await expect(readRecipeQuantityMode({ client: { rpc: async () => ({ data: context, error: null }) }, sessionAuthority: authority, recipeId: recipe, expectedRevision: 7 })).rejects.toMatchObject({ code: "RECIPE_REVISION_CONFLICT", status: 409 });
    await expect(readRecipeQuantityMode({ client: { rpc: async () => ({ data: null, error: { message: "RESOURCE_NOT_FOUND" } }) }, sessionAuthority: authority, recipeId: recipe, expectedRevision: 8 })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", status: 404 });
  });
});
