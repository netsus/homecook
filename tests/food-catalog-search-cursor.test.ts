import { describe, expect, it } from "vitest";

import {
  buildFoodCatalogSearchFingerprint,
  decodeFoodCatalogSearchCursor,
  encodeFoodCatalogSearchCursor,
  parseFoodCatalogSearchQuery,
} from "@/lib/server/food-catalog-search";

const STABLE_ID = "550e8400-e29b-41d4-a716-446655440001";

describe("food catalog search parser and cursor", () => {
  it("normalizes the official filters and computes a stable private fingerprint", () => {
    const parsed = parseFoodCatalogSearchQuery(new URLSearchParams({
      q: "  연세\u3000크림-빵  ",
      types: "food_product,ingredient",
      source: "community",
      limit: "20",
    }));

    expect(parsed).toMatchObject({
      ok: true,
      value: {
        q: "연세 크림-빵",
        types: ["ingredient", "food_product"],
        source: "community",
        limit: 20,
        cursor: null,
      },
    });
    if (!parsed.ok) return;
    expect(parsed.value.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.value.fingerprint).toBe(
      buildFoodCatalogSearchFingerprint({
        q: "연세 크림-빵",
        types: ["ingredient", "food_product"],
        source: "community",
      }),
    );
  });

  it.each([
    ["visibility=public", "visibility"],
    ["types=ingredient,unknown", "types"],
    ["source=all", "source"],
    ["limit=51", "limit"],
    ["types=ingredient&types=food_product", "types"],
    [`types=ingredient,food_product&cursor=${encodeURIComponent("bad")}`, "cursor"],
  ])("rejects unsupported or malformed filters without coercion: %s", (query, field) => {
    const parsed = parseFoodCatalogSearchQuery(new URLSearchParams(query));
    expect(parsed).toMatchObject({
      ok: false,
      code: "INVALID_SEARCH_FILTER",
      fields: expect.arrayContaining([expect.objectContaining({ field })]),
    });
  });

  it("round-trips only the official integer v2 tuple and matching fingerprint", () => {
    const fingerprint = buildFoodCatalogSearchFingerprint({
      q: "연세크림빵",
      types: ["food_product"],
      source: "public",
    });
    const cursor = encodeFoodCatalogSearchCursor({
      version: 2,
      fingerprint,
      tuple: {
        algorithm_version: 2,
        match_bucket: 1,
        coverage_bucket: 0,
        quantized_score: 912_345,
        source_partition: 0,
        type_partition: 1,
        created_at: "2026-07-25T12:00:00.123456Z",
        stable_id: STABLE_ID,
      },
    });

    expect(decodeFoodCatalogSearchCursor(cursor, fingerprint)).toEqual({
      version: 2,
      fingerprint,
      tuple: {
        algorithm_version: 2,
        match_bucket: 1,
        coverage_bucket: 0,
        quantized_score: 912_345,
        source_partition: 0,
        type_partition: 1,
        created_at: "2026-07-25T12:00:00.123456Z",
        stable_id: STABLE_ID,
      },
    });
    expect(decodeFoodCatalogSearchCursor(cursor, "0".repeat(64))).toBeNull();
    expect(Buffer.from(cursor, "base64url").toString("utf8")).not.toContain("연세");
  });

  it("dual-decodes the existing created_at plus id v1 cursor", () => {
    const legacy = Buffer.from(JSON.stringify({
      created_at: "2026-07-25T12:00:00.123456Z",
      id: STABLE_ID,
    }), "utf8").toString("base64url");

    expect(decodeFoodCatalogSearchCursor(legacy, "f".repeat(64))).toEqual({
      version: 1,
      created_at: "2026-07-25T12:00:00.123456Z",
      stable_id: STABLE_ID,
    });
    expect(parseFoodCatalogSearchQuery(new URLSearchParams({
      types: "ingredient,food_product",
      cursor: legacy,
    }))).toMatchObject({
      ok: false,
      fields: [{ field: "cursor", reason: "legacy_product_cursor_requires_food_product_only" }],
    });
  });
});
