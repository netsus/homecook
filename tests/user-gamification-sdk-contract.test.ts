import { createClient } from "@supabase/supabase-js";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  markUserGamificationNotificationsSeen, readUserGamification,
  readUserGamificationArchive, type UserGamificationDbClient,
} from "@/lib/server/user-gamification";
import { recordUserGrowthActivityEvent, type UserGrowthActivityDbClient } from "@/lib/server/user-growth-activity";

type RequestEvidence = { url: URL; method: string; body: unknown };
function fixture(mode: "success" | "denied" | "duplicate" | "projection-denied" = "success") {
  const requests: RequestEvidence[] = [];
  const sdk = createClient("http://gamification-contract.invalid", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method, body });
      const table = url.pathname.split("/").at(-1);
      if (mode === "denied" || (mode === "projection-denied" && table === "user_progress_summary")) {
        return new Response(JSON.stringify({ code: "42501", message: "fixture denied" }), {
          status: 403, headers: { "content-type": "application/json" },
        });
      }
      if (table === "user_growth_activity_events" && method === "POST") {
        return new Response(JSON.stringify(mode === "duplicate"
          ? { code: "23505", message: "fixture duplicate" } : { id: "activity-1" }), {
          status: mode === "duplicate" ? 409 : 201,
          headers: { "content-type": "application/json" },
        });
      }
      if (method === "HEAD") {
        return new Response(null, { headers: { "content-range": "*/3" } });
      }
      const data = method === "PATCH"
        ? [{ id: "notification-1", notification_type: "xp_awarded", payload_json: {} }]
        : [];
      return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    } },
  });
  const client: UserGamificationDbClient = sdk;
  return { sdk, client, requests };
}

describe("native gamification SDK contract", () => {
  it("keeps actual SDK identity and exact selected nullable/JSON rows", () => {
    const { sdk, client } = fixture();
    const notifications = client.from("user_progress_notifications").select("id, seen_at, payload_json");
    const awards = client.from("user_achievement_awards").select("badge_key, track_key");
    const quests = client.from("user_quest_progress").select("quest_type, status, source_event_id");
    expectTypeOf<Awaited<typeof notifications>["data"]>().toEqualTypeOf<Array<{
      id: string; seen_at: string | null; payload_json: unknown;
    }> | null>();
    expectTypeOf<Awaited<typeof awards>["data"]>().toEqualTypeOf<Array<{
      badge_key: string | null; track_key: string | null;
    }> | null>();
    expectTypeOf<Awaited<typeof quests>["data"]>().toEqualTypeOf<Array<{
      quest_type: "standard" | "tutorial"; status: "active" | "completed" | "dismissed";
      source_event_id: string | null;
    }> | null>();
    expect(client).toBe(sdk);
    expect([notifications, awards, quests].every(query => typeof query.then === "function")).toBe(true);
  });

  it.each([false, true])("preserves archive owner/in/order/limit and denial (denied=%s)", async denied => {
    const { client, requests } = fixture(denied ? "denied" : "success");
    const result = await readUserGamificationArchive(client, "owner", { limit: 3, cursor: null });
    expect(result).toMatchObject(denied
      ? { data: null, error: { code: "42501" } }
      : { data: { items: [], has_next: false, next_cursor: null }, error: null });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({
      select: "id,notification_type,priority,delivery_channel,toast_eligible,group_key,payload_json,created_at,seen_at",
      user_id: "eq.owner", delivery_channel: "in.(toast,archive_only)",
      order: "created_at.desc,id.desc", limit: "4",
    });
  });

  it.each([false, true])("preserves seen PATCH owner, deduplicated ids and errors (denied=%s)", async denied => {
    const { client, requests } = fixture(denied ? "denied" : "success");
    const result = await markUserGamificationNotificationsSeen(client, "owner", ["notification-1", "notification-1"]);
    expect(result).toMatchObject(denied
      ? { data: null, error: { code: "42501" } }
      : { data: { seen_notification_ids: ["notification-1"] }, error: null });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].body).toEqual({ seen_at: expect.any(String) });
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({
      user_id: "eq.owner", id: "in.(notification-1)", select: "id,notification_type,payload_json",
    });
  });

  it("keeps exact HEAD counts and the existing recipe source/owner filters", async () => {
    const { client, requests } = fixture();
    const results = await Promise.all([
      client.from("shopping_lists").select("id", { count: "exact", head: true }).eq("user_id", "owner"),
      client.from("recipes").select("id", { count: "exact", head: true })
        .eq("created_by", "owner").in("source_type", ["manual", "youtube"]),
    ]);
    expect(results.map(result => ({ count: result.count, data: result.data, error: result.error })))
      .toEqual([{ count: 3, data: null, error: null }, { count: 3, data: null, error: null }]);
    expect(requests.map(({ method }) => method)).toEqual(["HEAD", "HEAD"]);
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({ select: "id", user_id: "eq.owner" });
    expect(Object.fromEntries(requests[1].url.searchParams)).toEqual({
      select: "id", created_by: "eq.owner", source_type: "in.(manual,youtube)",
    });
  });

  it("keeps unseen/null filtering and both stable notification orders", async () => {
    const { client, requests } = fixture();
    const result = await client.from("user_progress_notifications").select("id, seen_at, payload_json")
      .eq("user_id", "owner").in("delivery_channel", ["toast", "archive_only"])
      .is("seen_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(5);
    expect(result.error).toBeNull();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({
      select: "id,seen_at,payload_json", user_id: "eq.owner", delivery_channel: "in.(toast,archive_only)",
      seen_at: "is.null", order: "created_at.desc,id.desc", limit: "5",
    });
  });

  it.each(["duplicate", "projection-denied"])("keeps the activity ledger authoritative on %s", async mode => {
    const { sdk, requests } = fixture(mode === "duplicate" ? "duplicate" : "projection-denied");
    const client: UserGrowthActivityDbClient = sdk;
    const result = await recordUserGrowthActivityEvent(client, {
      userId: "owner", activityType: "pantry_item_added", category: "pantry",
      sourceKey: "pantry_item_added:item-1", sourceTable: "pantry_items", sourceId: "item-1",
      occurredAt: "2026-10-20T00:00:00Z", sourceMeta: { ingredient_id: "ingredient-1" },
    });
    expect(result).toEqual({ recorded: mode !== "duplicate", duplicate: mode === "duplicate", error: null });
    expect(requests.map(({ url, method }) => [url.pathname.split("/").at(-1), method])).toEqual(
      mode === "duplicate" ? [["user_growth_activity_events", "POST"]]
        : [["user_growth_activity_events", "POST"], ["user_progress_summary", "GET"]],
    );
    expect(requests[0].body).toMatchObject({ user_id: "owner", source_key: "pantry_item_added:item-1" });
  });

  it("preserves summary permission errors before secondary reads or writes", async () => {
    const { sdk, requests } = fixture("denied");
    const result = await readUserGamification(sdk, "owner");
    expect(result).toMatchObject({ data: null, error: { code: "42501" } });
    expect(requests.map(({ url, method }) => [url.pathname.split("/").at(-1), method]))
      .toEqual([["user_progress_summary", "GET"]]);
  });
});
