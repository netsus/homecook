import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAccountQuarantineIntent,
  resolveAccountQuarantine,
} from "@/lib/api/account-quarantine";
import { isApiFetchError } from "@/lib/api/fetch-json";

const IDEMPOTENCY_KEY = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("account quarantine API client", () => {
  it("creates one opaque UUID key for a new resolution intent", () => {
    const randomUUID = vi.fn(() => IDEMPOTENCY_KEY);
    vi.stubGlobal("crypto", { randomUUID });

    expect(createAccountQuarantineIntent("activate")).toEqual({
      action: "activate",
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("sends the required nickname for activate without client authority fields", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: {
          resolution_status: "active",
          account_generation: 3,
        },
        error: null,
      }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveAccountQuarantine({
      action: "activate",
      idempotencyKey: IDEMPOTENCY_KEY,
      nickname: " 집밥러 ",
    })).resolves.toEqual({
      resolution_status: "active",
      account_generation: 3,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/v1/users/me/cutover-quarantine-resolution");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": IDEMPOTENCY_KEY,
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      action: "activate",
      profile: { nickname: "집밥러" },
    });
    expect(String(init?.body)).not.toMatch(
      /owner|session|generation|capability/iu,
    );
  });

  it("sends delete without a profile and preserves cleanup_pending", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        data: { deletion_status: "cleanup_pending" },
        error: null,
      }), { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveAccountQuarantine({
      action: "delete",
      idempotencyKey: IDEMPOTENCY_KEY,
    })).resolves.toEqual({ deletion_status: "cleanup_pending" });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ action: "delete" });
  });

  it("keeps the exact public error wrapper for UI state mapping", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({
        success: false,
        data: null,
        error: {
          code: "ACCOUNT_LIFECYCLE_MAINTENANCE",
          message: "계정 전환 작업 중이에요.",
          fields: [],
        },
      }), { status: 503 }),
    ));

    const error = await resolveAccountQuarantine({
      action: "activate",
      idempotencyKey: IDEMPOTENCY_KEY,
      nickname: "집밥러",
    }).catch((caught: unknown) => caught);

    expect(isApiFetchError(error)).toBe(true);
    expect(error).toMatchObject({
      status: 503,
      code: "ACCOUNT_LIFECYCLE_MAINTENANCE",
      message: "계정 전환 작업 중이에요.",
      fields: [],
    });
  });
});
