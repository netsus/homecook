import { describe, expect, it } from "vitest";

import { normalizeProductionStartArgs } from "../scripts/lib/start-production-args.mjs";

describe("production start arguments", () => {
  it("removes the pnpm separator before forwarding Next.js options", () => {
    expect(normalizeProductionStartArgs(["--", "-H", "127.0.0.1", "-p", "3100"])).toEqual([
      "-H",
      "127.0.0.1",
      "-p",
      "3100",
    ]);
  });

  it("keeps direct Next.js options unchanged", () => {
    expect(normalizeProductionStartArgs(["-H", "127.0.0.1", "-p", "3100"])).toEqual([
      "-H",
      "127.0.0.1",
      "-p",
      "3100",
    ]);
  });
});
