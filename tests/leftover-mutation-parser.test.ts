import { describe, expect, it } from "vitest";
import { parseLegacyLeftoverMutation } from "@/lib/server/leftovers";

const row = {
  id: "550e8400-e29b-41d4-a716-446655440101",
  status: "eaten",
  eaten_at: "2026-10-16T00:00:00Z",
  auto_hide_at: "2026-11-15T00:00:00Z",
  stale_reviewed_at: null,
  transitioned: true,
};

describe("legacy leftover mutation boundary", () => {
  it("projects eat and repeated eat results without leaking RPC-only fields", () => {
    const expected = {
      id: row.id, status: "eaten", eaten_at: row.eaten_at, auto_hide_at: row.auto_hide_at,
    };
    expect(parseLegacyLeftoverMutation(row, "eat")).toEqual(expected);
    expect(parseLegacyLeftoverMutation({ ...row, transitioned: false }, "eat")).toEqual(expected);
  });

  it("preserves uneat null timestamps and keep's distinct response shape", () => {
    expect(parseLegacyLeftoverMutation({
      ...row, status: "leftover", eaten_at: null, auto_hide_at: null,
    }, "uneat")).toEqual({ id: row.id, status: "leftover", eaten_at: null, auto_hide_at: null });
    expect(parseLegacyLeftoverMutation({
      ...row, status: "leftover", stale_reviewed_at: row.eaten_at,
    }, "keep")).toEqual({ id: row.id, status: "leftover", stale_reviewed_at: row.eaten_at });
  });

  it.each(["RESOURCE_NOT_FOUND", "FORBIDDEN", "CONFLICT"])("preserves %s for route mapping", (errorCode) => {
    expect(parseLegacyLeftoverMutation({ error_code: errorCode }, "eat"))
      .toEqual({ error_code: errorCode });
  });

  it.each([
    null, [], {}, { ...row, id: null }, { ...row, id: "" },
    { ...row, status: "leftover" }, { ...row, eaten_at: 12 },
    { ...row, auto_hide_at: undefined }, { ...row, transitioned: "true" },
    { error_code: "UNRECOGNIZED" },
  ])("rejects malformed eat results: %j", (value) => {
    expect(parseLegacyLeftoverMutation(value, "eat")).toBeNull();
  });

  it("rejects keep without a review time and uneat with the wrong state", () => {
    expect(parseLegacyLeftoverMutation({ ...row, status: "leftover" }, "keep")).toBeNull();
    expect(parseLegacyLeftoverMutation(row, "uneat")).toBeNull();
  });
});
