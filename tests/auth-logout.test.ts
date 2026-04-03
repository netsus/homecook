import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
const createRouteHandlerClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
}));

describe("auth logout route", () => {
  beforeEach(() => {
    signOut.mockReset();
    createRouteHandlerClient.mockReset();

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        signOut,
      },
    });
    signOut.mockResolvedValue({ error: null });
  });

  it("clears the server session and redirects to the requested local path", async () => {
    const { GET } = await import("@/app/auth/logout/route");
    const response = await GET(
      new Request("http://localhost:3000/auth/logout?next=/planner"),
    );

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe("http://localhost:3000/planner");
  });
});
