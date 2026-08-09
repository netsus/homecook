import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("meal-log core", () => {
  test("provides the dedicated server contract module", () => {
    expect(existsSync(resolve(process.cwd(), "lib/server/meal-log.ts"))).toBe(true);
  });
});
