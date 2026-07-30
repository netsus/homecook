import { beforeEach, describe, expect, it, vi } from "vitest";

const createOperationalEventInternalClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createOperationalEventInternalClient,
}));

describe("hybrid operational event facade", () => {
  beforeEach(() => {
    vi.resetModules();
    createOperationalEventInternalClient.mockReset();
  });

  it("returns false and emits a PII-free diagnostic when the audit RPC fails", async () => {
    createOperationalEventInternalClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "database unavailable" },
      }),
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { recordOperationalEventFromServiceRole } =
      await import("@/lib/server/admin-events");

    await expect(recordOperationalEventFromServiceRole({
      event_type: "auth_failure",
      source: "auth",
      actor_user_id: "71000000-0000-4000-8000-000000000001",
      metadata_json: { email: "private@example.com" },
    })).resolves.toBe(false);

    expect(consoleError).toHaveBeenCalledWith(
      "HOMECOOK_OPERATIONAL_EVENT_WRITE_FAILED",
      {
        event_type: "auth_failure",
        source: "auth",
      },
    );
    expect(JSON.stringify(consoleError.mock.calls))
      .not.toContain("private@example.com");
    consoleError.mockRestore();
  });
});
