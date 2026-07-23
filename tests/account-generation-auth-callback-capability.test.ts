import { describe, expect, it, vi } from "vitest";

import { readAuthCallbackAccountGenerationCapability } from
  "@/lib/server/account-generation/auth-callback";

describe("auth callback account generation capability", () => {
  it("accepts only the exact capability states with a positive revision", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { state: "legacy", revision: 1 },
      error: null,
    });

    await expect(readAuthCallbackAccountGenerationCapability({ rpc }))
      .resolves.toEqual({
        ok: true,
        state: "legacy",
        revision: 1,
      });
    expect(rpc).toHaveBeenCalledWith("get_account_generation_capability");
  });

  it.each([
    null,
    {},
    { rpc: null },
    { rpc: vi.fn().mockRejectedValue(new Error("network unavailable")) },
    {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "capability unavailable" },
      }),
    },
    {
      rpc: vi.fn().mockResolvedValue({
        data: { state: "unknown", revision: 1 },
        error: null,
      }),
    },
    {
      rpc: vi.fn().mockResolvedValue({
        data: { state: "legacy", revision: 0 },
        error: null,
      }),
    },
  ])("fails closed for unavailable or malformed authority: %o", async (client) => {
    await expect(readAuthCallbackAccountGenerationCapability(client))
      .resolves.toEqual({ ok: false });
  });
});
