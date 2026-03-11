import { describe, expect, it } from "vitest";

import { PENDING_ACTION_KEY } from "@/lib/auth/pending-action";

describe("pending action key", () => {
  it("uses a stable storage key", () => {
    expect(PENDING_ACTION_KEY).toBe("homecook.pending-recipe-action");
  });
});
