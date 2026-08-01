import { beforeEach, describe, expect, it, vi } from "vitest";

const { readAuthFlowAttempt, terminalAuthFlowAttempt } = vi.hoisted(() => ({
  readAuthFlowAttempt: vi.fn(),
  terminalAuthFlowAttempt: vi.fn(),
}));

vi.mock("@/lib/server/full-local-auth/runtime", () => ({
  readAuthFlowAttempt,
  terminalAuthFlowAttempt,
}));

import {
  readCallbackAuthFlow,
  terminalCallbackAuthFlow,
} from "@/lib/server/full-local-auth/callback-flow";

describe("callback auth-flow authority", () => {
  beforeEach(() => {
    readAuthFlowAttempt.mockReset();
    terminalAuthFlowAttempt.mockReset();
  });

  it("uses the ledger provider and ignores a conflicting query hint", async () => {
    readAuthFlowAttempt.mockResolvedValue({
      ok: true,
      attempt: {
        authority: "local",
        cutover_epoch: 7,
        expires_at: "2026-08-01T12:15:00.000Z",
        flow_kind: "login",
        provider: "custom:naver",
        terminal_at: null,
        terminal_reason: null,
      },
    });

    await expect(readCallbackAuthFlow({
      cookieValue: "signed-cookie",
      expectedFlowKind: "login",
      providerHint: "google",
    })).resolves.toEqual({ ok: true, provider: "naver" });
  });

  it("rejects replayed and wrong-kind flows", async () => {
    readAuthFlowAttempt.mockResolvedValue({
      ok: true,
      attempt: {
        authority: "local",
        cutover_epoch: 7,
        expires_at: "2026-08-01T12:15:00.000Z",
        flow_kind: "link",
        provider: "google",
        terminal_at: "2026-08-01T12:01:00.000Z",
        terminal_reason: "success",
      },
    });

    await expect(readCallbackAuthFlow({
      cookieValue: "signed-cookie",
      expectedFlowKind: "login",
      providerHint: null,
    })).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("requires durable terminalization", async () => {
    terminalAuthFlowAttempt.mockResolvedValue({ ok: false, reason: "unavailable" });

    await expect(terminalCallbackAuthFlow("signed-cookie", "success"))
      .resolves.toEqual({ ok: false });
  });
});
