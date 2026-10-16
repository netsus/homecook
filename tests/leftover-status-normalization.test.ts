import { describe, expect, it } from "vitest";

import { normalizeLeftoverStatus } from "@/lib/server/leftovers";

describe("leftover list status query", () => {
  it.each([null, "", " ", "\t\r\n"])("defaults an omitted or blank status (%j) to leftover", (value) => {
    expect(normalizeLeftoverStatus(value)).toBe("leftover");
  });

  it.each(["leftover", "eaten"])("accepts the exact %s status", (value) => {
    expect(normalizeLeftoverStatus(value)).toBe(value);
  });

  it.each([" leftoVer ", " leftover", "leftover ", " eaten", "eaten ", "LEFTOVER", "EATEN", "archived"])(
    "rejects a non-exact status (%j) without trimming or case folding",
    (value) => {
      expect(normalizeLeftoverStatus(value)).toBeNull();
    },
  );
});
