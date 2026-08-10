import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("meal-log route surface", () => {
  test.each([
    "app/api/v1/meal-log/route.ts",
    "app/api/v1/meal-log/recent/route.ts",
    "app/api/v1/meal-log/entries/route.ts",
    "app/api/v1/meal-log/entries/[id]/route.ts",
  ])("provides the official route %s", (path) => {
    expect(existsSync(resolve(process.cwd(), path))).toBe(true);
  });
});
