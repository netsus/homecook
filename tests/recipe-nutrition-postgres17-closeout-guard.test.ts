import { describe, expect, it } from "vitest";

import { assertSafeRecipeNutritionPostgres17Target } from "./fixtures/recipe-nutrition-postgres17-closeout-harness";

describe("recipe nutrition PostgreSQL 17 closeout target guard", () => {
  it.each(["05432", "0", "65536", "-1", "1.5", " 55439", "55439 "])(
    "rejects a non-canonical or out-of-range port %s",
    (port) => {
      expect(() => assertSafeRecipeNutritionPostgres17Target({
        host: "127.0.0.1",
        port,
        database: "homecook_closeout",
        user: "postgres",
      })).toThrow("Unsafe PostgreSQL closeout target");
    },
  );

  it("rejects the default PostgreSQL port after numeric normalization", () => {
    expect(() => assertSafeRecipeNutritionPostgres17Target({
      host: "127.0.0.1",
      port: "5432",
      database: "homecook_closeout",
      user: "postgres",
    })).toThrow("Unsafe PostgreSQL closeout target");
  });

  it("accepts a canonical isolated local port", () => {
    expect(() => assertSafeRecipeNutritionPostgres17Target({
      host: "127.0.0.1",
      port: "55439",
      database: "homecook_closeout",
      user: "postgres",
    })).not.toThrow();
  });
});
