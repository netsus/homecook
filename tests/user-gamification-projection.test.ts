import { describe, expect, it, vi } from "vitest";

import { readUserGamification, type UserGamificationDbClient } from "@/lib/server/user-gamification";
import { buildUserProgressSummary, type UserProgressDbClient } from "@/lib/server/user-progress";
import { createUserGamificationProjectionWriter } from "@/lib/server/user-gamification-projection";

const authority = {
  ownerUuid: "user-1",
  authIdentityCreatedAt: "2026-09-01T00:00:00Z",
  sessionIssuedAt: "2026-09-06T00:00:00Z",
  sessionKeyHash: "session-hash",
  hmacKeyVersion: 1,
};

function createReadOnlyClient(missingSummary = false) {
  const rows: Record<string, object[]> = {
    user_achievement_awards: [], user_badge_awards: [], user_quest_progress: [],
    user_progress_notifications: [], user_growth_activity_events: [], user_progress_events: [],
  };
  const summary = buildUserProgressSummary({ userId: "user-1", events: [] });
  summary.event_counts = { cooking_completed: 1 };
  const write = vi.fn(() => { throw new Error("user route is read-only"); });
  const from = vi.fn((table: string) => ({
    insert: write, upsert: write, update: write,
    select() {
      const result = { data: rows[table] ?? [], error: null, count: 0 };
      const query = {
        eq: () => query, in: () => query, is: () => query,
        order: () => query, limit: () => query,
        maybeSingle: async () => ({ data: missingSummary ? null : summary, error: null }),
        then: Promise.resolve(result).then.bind(Promise.resolve(result)),
      };
      return query;
    },
  }));
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    const payload = args.p_payload as Record<string, unknown>;
    const row = { ...payload, seen_at: null };
    const table = ({ achievement: "user_achievement_awards", badge: "user_badge_awards", quest: "user_quest_progress" } as Record<string, string>)[args.p_operation as string];
    if (table) rows[table].push(row);
    return { data: row, error: null };
  });
  return { db: { from } as unknown as UserGamificationDbClient & UserProgressDbClient, rpc, write };
}

describe("gamification session-scoped projection", () => {
  it("reads through the user client and projects through RPC without historical notifications", async () => {
    const { db, rpc, write } = createReadOnlyClient();
    const result = await readUserGamification(db, authority.ownerUuid, createUserGamificationProjectionWriter({ rpc }, authority));
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(write).not.toHaveBeenCalled();
    const operations = rpc.mock.calls.map(([, args]) => args.p_operation);
    expect(operations).toContain("achievement");
    expect(operations).toContain("badge");
    expect(operations).toContain("quest");
    expect(operations).not.toContain("notification");
    expect(result.data?.notifications.unseen).toEqual([]);
    expect(rpc.mock.calls[0]).toMatchObject(["write_user_gamification_projection", {
      p_owner_uuid: "user-1", p_session_key_hash: "session-hash",
      p_auth_identity_created_at_snapshot: authority.authIdentityCreatedAt,
      p_hmac_key_version: 1, p_session_issued_at: authority.sessionIssuedAt,
    }]);
  });

  it("rebuilds a missing summary through the same writer without user-client writes", async () => {
    const { db, rpc, write } = createReadOnlyClient(true);
    const result = await readUserGamification(db, authority.ownerUuid, createUserGamificationProjectionWriter({ rpc }, authority));
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(rpc.mock.calls[0][1].p_operation).toBe("summary");
    expect(write).not.toHaveBeenCalled();
  });

  it("continues on duplicate award inserts and still updates quests silently", async () => {
    const { db, write } = createReadOnlyClient();
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      if (args.p_operation === "achievement" || args.p_operation === "badge") {
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      return { data: args.p_payload, error: null };
    });
    const result = await readUserGamification(db, authority.ownerUuid, createUserGamificationProjectionWriter({ rpc }, authority));
    expect(result.error).toBeNull();
    expect(rpc.mock.calls.some(([, args]) => args.p_operation === "quest")).toBe(true);
    expect(result.data?.notifications.unseen).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  it("propagates RPC failures instead of reporting a successful projection", async () => {
    const { db, write } = createReadOnlyClient();
    const error = { code: "42501", message: "projection denied" };
    const rpc = vi.fn(async () => ({ data: null, error }));
    const result = await readUserGamification(db, authority.ownerUuid, createUserGamificationProjectionWriter({ rpc }, authority));
    expect(result).toEqual({ data: null, error });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });
});
